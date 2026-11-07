import { randomUUID } from 'node:crypto';
import { AuditError, normalizeUrl } from './network.mjs';
import { readBatches, saveBatches, readReport, validId } from './store.mjs';
import { getWorkspace } from './workspace.mjs';
import { compareBatchRuns } from './batch-comparison.mjs';

export const batchLabels = {
  running: 'Đang kiểm tra',
  completed: 'Hoàn tất',
  partial: 'Có website lỗi',
  cancelled: 'Đã hủy',
  interrupted: 'Bị gián đoạn',
  queued: 'Đang chờ',
  failed: 'Thất bại',
};
const terminal = new Set(['completed', 'failed', 'cancelled']);
const busy = () =>
  new AuditError('Một lượt kiểm tra đang chạy. Chờ hoàn tất hoặc hủy trước khi chạy tiếp.', 'BUSY');

export function createBatchManager({
  createJob,
  getJob,
  isBusy,
  onFinished = async () => {},
  storage = { read: readBatches, save: saveBatches },
}) {
  let batches = [];
  let active = null;
  let launchingProject = null;
  let stopped = false;
  let booting = true;
  let startupError = null;
  let writes = Promise.resolve();
  let execution = Promise.resolve();
  const persist = () => {
    const next = writes.catch(() => {}).then(() => storage.save(batches));
    writes = next;
    return next;
  };
  const ready = (async () => {
    try {
      batches = await storage.read();
      for (const batch of batches) {
        if (
          !validId(batch.id) ||
          !validId(batch.projectId) ||
          !['running', 'completed', 'partial', 'cancelled', 'interrupted'].includes(batch.status) ||
          !['mobile', 'desktop'].includes(batch.device) ||
          ![1, 5, 10].includes(batch.maxPages) ||
          !Array.isArray(batch.items) ||
          !batch.items.length ||
          batch.items.length > 10 ||
          !Number.isFinite(Date.parse(batch.createdAt))
        )
          throw new Error('Dữ liệu hàng đợi không hợp lệ.');
        for (const item of batch.items) {
          normalizeUrl(item.url);
          if (
            !['queued', 'running', 'completed', 'failed', 'cancelled'].includes(item.status) ||
            (item.reportId && !validId(item.reportId))
          )
            throw new Error('Dữ liệu hàng đợi không hợp lệ.');
        }
      }
      let recovered = false;
      for (const batch of batches.filter((b) => b.status === 'running')) {
        batch.status = 'interrupted';
        batch.finishedAt = new Date().toISOString();
        batch.error = 'Máy chủ đã khởi động lại. Thử lại các website chưa hoàn tất.';
        for (const item of batch.items.filter((i) => !terminal.has(i.status))) {
          item.status = 'cancelled';
          item.error = batch.error;
        }
        recovered = true;
      }
      if (recovered) await persist();
    } catch (error) {
      startupError = error;
    } finally {
      booting = false;
    }
  })();
  function view(batch) {
    const items = batch.items.map((item) => {
      const job = item.status === 'running' && getJob(item.jobId);
      return {
        ...item,
        progress: item.status === 'completed' ? 100 : job?.progress || 0,
        message: job?.message || item.error || batchLabels[item.status],
      };
    });
    const progress = Math.floor(
      items.reduce((n, item) => n + (terminal.has(item.status) ? 100 : item.progress), 0) /
        items.length,
    );
    return {
      ...batch,
      items,
      progress,
      settled: items.filter((i) => terminal.has(i.status)).length,
    };
  }
  async function projectState(projectId) {
    await ready;
    if (startupError) throw startupError;
    const state = await getWorkspace();
    const project = state.projects.find((p) => p.id === projectId);
    if (!project) throw new AuditError('Không tìm thấy dự án.', 'NOT_FOUND');
    return { state, project };
  }
  function find(projectId, id) {
    const batch = batches.find((b) => b.projectId === projectId && b.id === id);
    if (!batch) throw new AuditError('Không tìm thấy lần kiểm tra dự án.', 'NOT_FOUND');
    return batch;
  }
  async function execute(batch) {
    try {
      for (const item of batch.items) {
        if (item.status === 'completed') continue;
        if (batch.cancelRequested || stopped) break;
        item.status = 'running';
        item.startedAt = new Date().toISOString();
        await persist();
        if (batch.cancelRequested || stopped) break;
        let job;
        try {
          job = await createJob({
            inputUrl: item.url,
            device: batch.device,
            maxPages: batch.maxPages,
            projectId: batch.projectId,
            batchId: batch.id,
          });
          item.jobId = job.id;
          if (batch.cancelRequested || stopped)
            job.controller.abort(new AuditError('Đã hủy kiểm tra dự án.', 'ABORTED'));
          await persist();
          await job.completion;
          item.status = job.status;
          item.reportId = job.status === 'completed' ? job.id : null;
          item.error = job.error;
        } catch (error) {
          if (job?.status === 'running')
            job.controller.abort(new AuditError('Không lưu được tiến độ hàng đợi.', 'ABORTED'));
          await job?.completion;
          item.status =
            job?.status === 'completed'
              ? 'completed'
              : batch.cancelRequested || stopped
                ? 'cancelled'
                : 'failed';
          item.reportId = item.status === 'completed' ? job.id : null;
          item.error =
            item.status === 'completed'
              ? null
              : String(error.message || 'Không thể kiểm tra website.').slice(0, 500);
        }
        item.finishedAt = new Date().toISOString();
        await persist();
      }
      for (const item of batch.items.filter((i) => !terminal.has(i.status))) {
        item.status = 'cancelled';
        item.error = stopped ? 'Máy chủ đã dừng.' : 'Đã hủy trước khi hoàn tất.';
      }
      batch.status = stopped
        ? 'interrupted'
        : batch.cancelRequested
          ? 'cancelled'
          : batch.items.every((i) => i.status === 'completed')
            ? 'completed'
            : 'partial';
    } catch (error) {
      batch.status = 'interrupted';
      batch.error = `Hàng đợi bị gián đoạn: ${error.message}`;
      for (const item of batch.items.filter((i) => !terminal.has(i.status))) {
        const job = getJob(item.jobId);
        job?.controller.abort(new AuditError('Hàng đợi bị gián đoạn.', 'ABORTED'));
        await job?.completion;
        item.status = job?.status === 'completed' ? 'completed' : 'cancelled';
        item.reportId = item.status === 'completed' ? job.id : null;
        item.error = item.status === 'completed' ? null : batch.error;
      }
    } finally {
      batch.finishedAt = new Date().toISOString();
      await persist().catch((error) => console.error(`Không lưu được hàng đợi: ${error.message}`));
      await onFinished(view(batch)).catch((error) =>
        console.error(`Không cập nhật được lịch dự án: ${error.message}`),
      );
      if (active === batch) active = null;
    }
  }
  return {
    ready,
    isActive: () => booting || Boolean(active?.status === 'running' || launchingProject),
    projectBusy: (id) =>
      launchingProject === id || (active?.projectId === id && active.status === 'running'),
    async list(projectId) {
      await projectState(projectId);
      return batches.filter((b) => b.projectId === projectId).map(view);
    },
    async get(projectId, id) {
      await projectState(projectId);
      return view(find(projectId, id));
    },
    async compare(projectId, beforeId, afterId) {
      await projectState(projectId);
      const before = find(projectId, beforeId);
      const after = find(projectId, afterId);
      return compareBatchRuns(
        before,
        after,
        batches.filter((batch) => batch.projectId === projectId),
      );
    },
    async start(projectId, input = {}, retryId = null, metadata = {}) {
      await ready;
      if (startupError) throw startupError;
      if (!input || typeof input !== 'object' || Array.isArray(input))
        throw new AuditError('Cấu hình kiểm tra không hợp lệ.', 'INVALID_BATCH');
      if (stopped || active?.status === 'running' || launchingProject || isBusy()) throw busy();
      launchingProject = projectId;
      let batch;
      try {
        const { project } = await projectState(projectId);
        if (stopped) throw busy();
        const previous = retryId ? find(projectId, retryId) : null;
        if (previous && previous.items.every((i) => i.status === 'completed'))
          throw new AuditError(
            'Lần kiểm tra này đã hoàn tất. Chạy lần mới để kiểm tra lại website.',
            'INVALID_BATCH',
          );
        const device = previous?.device ?? input.device ?? 'mobile';
        const maxPages = previous?.maxPages ?? input.maxPages ?? 5;
        if (!['mobile', 'desktop'].includes(device) || ![1, 5, 10].includes(maxPages))
          throw new AuditError(
            'Chọn Mobile/Desktop và tối đa 1, 5 hoặc 10 trang.',
            'INVALID_BATCH',
          );
        batch = {
          id: randomUUID(),
          projectId,
          projectName: project.name,
          device,
          maxPages,
          createdAt: new Date().toISOString(),
          finishedAt: null,
          status: 'running',
          cancelRequested: false,
          retryOf: previous?.id || null,
          ...(metadata.scheduleRunId
            ? { scheduleRunId: metadata.scheduleRunId, trigger: metadata.trigger || 'schedule' }
            : {}),
          error: null,
          items: previous
            ? previous.items.map((item) =>
                item.status === 'completed'
                  ? { ...item }
                  : { url: item.url, status: 'queued', reportId: null, error: null },
              )
            : project.websites.map((url) => ({
                url,
                status: 'queued',
                reportId: null,
                error: null,
              })),
        };
        batches.unshift(batch);
        await persist();
        active = batch;
        execution = execute(batch);
        return view(batch);
      } catch (error) {
        if (batch) batches = batches.filter((b) => b !== batch);
        throw error;
      } finally {
        launchingProject = null;
      }
    },
    async cancel(projectId, id) {
      await projectState(projectId);
      const batch = find(projectId, id);
      if (batch.status !== 'running') return view(batch);
      batch.cancelRequested = true;
      for (const item of batch.items) {
        if (item.status === 'queued') {
          item.status = 'cancelled';
          item.error = 'Đã hủy khi đang chờ.';
        }
        if (item.status === 'running')
          getJob(item.jobId)?.controller.abort(new AuditError('Đã hủy kiểm tra dự án.', 'ABORTED'));
      }
      await persist();
      return view(batch);
    },
    async removeProject(projectId) {
      await ready;
      if (startupError) throw startupError;
      batches = batches.filter((b) => b.projectId !== projectId);
      await persist();
    },
    async close() {
      stopped = true;
      await ready;
      if (active) {
        active.cancelRequested = true;
        for (const item of active.items)
          getJob(item.jobId)?.controller.abort(new AuditError('Máy chủ đã dừng.', 'ABORTED'));
      }
      await execution;
      await writes.catch(() => {});
    },
  };
}

export async function summarizeBatch(batch) {
  const state = await getWorkspace();
  const project = state.projects.find((p) => p.id === batch.projectId);
  const client = state.clients.find((c) => c.id === project?.clientId);
  if (!project || !client) throw new AuditError('Không tìm thấy dự án.', 'NOT_FOUND');
  const tasks = [];
  const websites = await Promise.all(
    batch.items.map(async (item) => {
      const report =
        item.status === 'completed' && state.reports[item.reportId] === project.id
          ? await readReport(item.reportId)
          : null;
      const issues = report?.checks.filter((c) => ['warn', 'fail'].includes(c.status)) || [];
      tasks.push(...issues.map((check) => ({ reportId: report.id, url: item.url, check })));
      return {
        url: item.url,
        status: item.status,
        error: item.error,
        reportId: report?.id || null,
        reportMissing: item.status === 'completed' && !report,
        score: report?.score ?? null,
        categories: report?.categories || null,
        createdAt: report?.createdAt || null,
        scope: report?.scope || null,
        lighthouse: report
          ? {
              available: Boolean(report.lighthouse?.available),
              error: report.lighthouse?.error || null,
              version: report.lighthouse?.version || null,
            }
          : null,
        methodology: report?.methodology || null,
        warnings: report?.warnings || [],
        issues: issues.length,
        pending: issues.filter((c) => !c.done).length,
        high: issues.filter((c) => !c.done && c.severity === 'high').length,
      };
    }),
  );
  websites.sort((a, b) => (a.score ?? 101) - (b.score ?? 101) || a.url.localeCompare(b.url));
  tasks.sort(
    (a, b) =>
      Number(a.check.done) - Number(b.check.done) ||
      ['high', 'medium', 'low'].indexOf(a.check.severity) -
        ['high', 'medium', 'low'].indexOf(b.check.severity) ||
      a.url.localeCompare(b.url) ||
      a.check.id.localeCompare(b.check.id),
  );
  return {
    batch: {
      id: batch.id,
      createdAt: batch.createdAt,
      finishedAt: batch.finishedAt,
      status: batch.status,
      device: batch.device,
      maxPages: batch.maxPages,
      retryOf: batch.retryOf,
      error: batch.error,
    },
    project: { id: project.id, name: project.name },
    client: { id: client.id, name: client.name },
    websites,
    tasks,
    totals: {
      websites: websites.length,
      available: websites.filter((s) => s.reportId).length,
      incomplete: websites.filter((s) => !s.reportId).length,
      pending: tasks.filter((t) => !t.check.done).length,
      high: tasks.filter((t) => !t.check.done && t.check.severity === 'high').length,
    },
  };
}
