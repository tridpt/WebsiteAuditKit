import { randomUUID } from 'node:crypto';
import { AuditError } from './network.mjs';
import { readProjectSchedules, saveProjectSchedules, validId } from './store.mjs';
import { getWorkspace } from './workspace.mjs';
import { summarizeBatch } from './batch.mjs';

const durations = { daily: 86_400_000, weekly: 7 * 86_400_000 };
const fail = (message, code = 'INVALID_SCHEDULE') => new AuditError(message, code);
const busy = () =>
  fail('Một lượt kiểm tra đang chạy. Chờ hoàn tất hoặc hủy trước khi chạy lịch.', 'BUSY');
const iso = (value) => new Date(value).toISOString();
export function nextProjectRun(interval, from = new Date()) {
  if (!Object.hasOwn(durations, interval)) throw fail('Chọn chu kỳ mỗi ngày hoặc mỗi tuần.');
  return iso(new Date(from).getTime() + durations[interval]);
}
export function validateProjectSchedule(input, partial = false) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw fail('Cấu hình lịch dự án không hợp lệ.');
  const output = {};
  for (const field of Object.keys(input))
    if (!['device', 'maxPages', 'interval', 'active'].includes(field))
      throw fail('Cấu hình lịch chứa trường không hỗ trợ.');
  if (!partial || input.device !== undefined) {
    if (!['mobile', 'desktop'].includes(input.device))
      throw fail('Chọn thiết bị Mobile hoặc Desktop.');
    output.device = input.device;
  }
  if (!partial || input.maxPages !== undefined) {
    if (![1, 5, 10].includes(input.maxPages))
      throw fail('Chọn tối đa 1, 5 hoặc 10 trang mỗi website.');
    output.maxPages = input.maxPages;
  }
  if (!partial || input.interval !== undefined) {
    if (!Object.hasOwn(durations, input.interval))
      throw fail('Chọn chu kỳ mỗi ngày hoặc mỗi tuần.');
    output.interval = input.interval;
  }
  if (input.active !== undefined) {
    if (typeof input.active !== 'boolean') throw fail('Trạng thái lịch không hợp lệ.');
    output.active = input.active;
  }
  return output;
}

export function createProjectScheduleManager({
  batches,
  isBusy,
  now = () => new Date(),
  storage = { read: readProjectSchedules, save: saveProjectSchedules },
}) {
  let schedules = [];
  let startupError = null;
  let stopped = false;
  let writes = Promise.resolve();
  const serial = (work) => {
    const result = writes.catch(() => {}).then(work);
    writes = result;
    result.catch(() => {});
    return result;
  };
  const commit = async (draft) => {
    await storage.save(draft);
    schedules = draft;
  };
  const publicSchedule = (schedule, projects) => ({
    ...structuredClone(schedule),
    projectName: projects.find((p) => p.id === schedule.projectId)?.name || '',
    unreadAlerts: schedule.notifications.filter((alert) => !alert.readAt).length,
  });
  const projectFor = async (id) => {
    const state = await getWorkspace();
    const project = state.projects.find((p) => p.id === id);
    if (!project) throw fail('Không tìm thấy dự án.', 'NOT_FOUND');
    return project;
  };
  const get = (draft, id) => {
    const schedule = draft.find((s) => s.projectId === id);
    if (!schedule) throw fail('Chưa có lịch kiểm tra cho dự án này.', 'NOT_FOUND');
    return schedule;
  };
  const notify = (schedule, details) => {
    schedule.notifications = [
      ...schedule.notifications,
      { id: randomUUID(), createdAt: iso(now()), readAt: null, ...details },
    ].slice(-30);
  };
  async function finishDraft(schedule, batch) {
    if (batch.status === 'running' || batch.scheduleRunId !== schedule.currentRunId) return;
    let comparison = null,
      comparisonError = null;
    if (schedule.baselineBatchId) {
      try {
        comparison = await batches.compare(schedule.projectId, schedule.baselineBatchId, batch.id);
      } catch (error) {
        comparisonError = error.message;
      }
    }
    const websites =
      comparison?.websites.map((site) => {
        const total = site.scoreChanges.find((score) => score.id === 'total');
        const speed = site.scoreChanges.find((score) => score.id === 'performance');
        return {
          url: site.url,
          scoreDrop: total?.delta <= -5 ? -total.delta : 0,
          speedDrop: speed?.delta <= -5 ? -speed.delta : 0,
          newIssues: site.counts.new,
          unverifiedIssues: site.counts.unverified,
          comparable: site.scoreComparable,
          reason: site.scoreReason,
          reportId: site.after.reportId,
        };
      }) || [];
    const summary = await summarizeBatch(batch);
    const failed = summary.totals.incomplete;
    const scoreDrops = websites.filter((site) => site.scoreDrop || site.speedDrop).length;
    const newIssues = websites.reduce((sum, site) => sum + site.newIssues, 0);
    const unverified = websites.filter(
      (site) => !site.comparable || site.unverifiedIssues > 0,
    ).length;
    const hasAlert = scoreDrops > 0 || newIssues > 0;
    const outcome = ['cancelled', 'interrupted'].includes(batch.status)
      ? batch.status
      : hasAlert
        ? 'alert'
        : failed || unverified || comparisonError
          ? 'incomplete'
          : comparison
            ? 'healthy'
            : 'baseline';
    const message =
      [
        scoreDrops ? `${scoreDrops} website giảm ít nhất 5 điểm tổng hoặc Tốc độ` : '',
        newIssues ? `${newIssues} lỗi mới được xác minh` : '',
        failed ? `${failed} website chưa hoàn tất` : '',
        unverified ? `${unverified} website có dữ liệu chưa đủ để đối chiếu` : '',
        comparisonError || '',
      ]
        .filter(Boolean)
        .join(' · ') ||
      (outcome === 'baseline'
        ? 'Đã lưu mốc đầu tiên để đối chiếu các lượt sau.'
        : outcome === 'cancelled'
          ? 'Đã hủy lượt theo lịch. Kết quả hoàn tất vẫn được giữ.'
          : outcome === 'interrupted'
            ? 'Lượt theo lịch bị gián đoạn. Mốc hoàn tất trước vẫn được giữ.'
            : 'Không phát hiện cảnh báo mới trong phạm vi đã kiểm tra.');
    const run = {
      runId: schedule.currentRunId,
      batchId: batch.id,
      beforeBatchId: comparison?.before.id || null,
      createdAt: batch.createdAt,
      finishedAt: batch.finishedAt,
      status: outcome,
      failed,
      newIssues,
      scoreDrops,
      unverified,
      message,
      websites,
      warnings: comparison?.warnings || [],
    };
    schedule.runs = [...schedule.runs, run].slice(-50);
    if (
      outcome !== 'cancelled' &&
      (hasAlert || failed || outcome === 'interrupted' || comparisonError)
    ) {
      notify(schedule, {
        type: hasAlert ? 'regression' : 'failure',
        batchId: batch.id,
        beforeBatchId: run.beforeBatchId,
        message,
        websites: websites.filter((site) => site.scoreDrop || site.speedDrop || site.newIssues),
      });
    }
    schedule.lastStatus = outcome;
    schedule.lastError = batch.error || comparisonError;
    schedule.lastBatchId = batch.id;
    if (batch.status === 'completed' && !failed) schedule.baselineBatchId = batch.id;
    schedule.currentRunId = null;
    schedule.currentBatchId = null;
    schedule.updatedAt = iso(now());
  }
  async function reconcileDraft(draft, recovering = false) {
    const { projects } = await getWorkspace();
    let changed = false;
    const retained = draft.filter((s) => projects.some((p) => p.id === s.projectId));
    changed = retained.length !== draft.length;
    for (const schedule of retained.filter((s) => s.currentRunId)) {
      const batch = (await batches.list(schedule.projectId)).find(
        (b) => b.scheduleRunId === schedule.currentRunId,
      );
      if (batch && batch.status !== 'running') {
        await finishDraft(schedule, batch);
        changed = true;
      } else if (batch && schedule.currentBatchId !== batch.id) {
        schedule.currentBatchId = batch.id;
        changed = true;
      } else if (!batch && recovering) {
        const message =
          'Máy chủ dừng trước khi khởi tạo hàng đợi. Bấm Chạy lịch ngay hoặc chờ kỳ tiếp theo.';
        schedule.lastStatus = 'interrupted';
        schedule.lastError = message;
        schedule.currentRunId = null;
        schedule.currentBatchId = null;
        notify(schedule, {
          type: 'failure',
          batchId: null,
          beforeBatchId: null,
          message,
          websites: [],
        });
        changed = true;
      }
    }
    if (changed) await commit(retained);
  }
  const ready = (async () => {
    try {
      await batches.ready;
      const loaded = await storage.read();
      const seen = new Set();
      for (const s of loaded) {
        if (
          !validId(s.projectId) ||
          seen.has(s.projectId) ||
          !Number.isFinite(Date.parse(s.nextRunAt)) ||
          !Array.isArray(s.notifications) ||
          !Array.isArray(s.runs) ||
          (s.currentRunId && !validId(s.currentRunId)) ||
          typeof s.active !== 'boolean'
        )
          throw new Error('Dữ liệu lịch dự án không hợp lệ.');
        validateProjectSchedule({
          device: s.device,
          maxPages: s.maxPages,
          interval: s.interval,
          active: s.active,
        });
        seen.add(s.projectId);
      }
      schedules = loaded;
      await reconcileDraft(structuredClone(schedules), true);
    } catch (error) {
      startupError = error;
    }
  })();
  const checkReady = async () => {
    await ready;
    if (startupError) throw startupError;
  };
  return {
    ready,
    projectBusy: (id) => schedules.some((s) => s.projectId === id && Boolean(s.currentRunId)),
    async list() {
      await checkReady();
      const { projects } = await getWorkspace();
      return schedules
        .filter((s) => projects.some((p) => p.id === s.projectId))
        .map((s) => publicSchedule(s, projects));
    },
    async get(projectId) {
      await checkReady();
      const project = await projectFor(projectId);
      const s = schedules.find((s) => s.projectId === projectId);
      return s ? publicSchedule(s, [project]) : null;
    },
    async save(projectId, input, partial = false) {
      await checkReady();
      const values = validateProjectSchedule(input, partial);
      return serial(async () => {
        const project = await projectFor(projectId),
          draft = structuredClone(schedules);
        let schedule = draft.find((s) => s.projectId === projectId);
        if (partial && !schedule) throw fail('Chưa có lịch cho dự án này.', 'NOT_FOUND');
        if (!schedule) {
          schedule = {
            projectId,
            ...values,
            active: values.active ?? true,
            createdAt: iso(now()),
            updatedAt: iso(now()),
            nextRunAt: nextProjectRun(values.interval, now()),
            lastRunAt: null,
            lastBatchId: null,
            baselineBatchId: null,
            currentRunId: null,
            currentBatchId: null,
            lastStatus: 'never',
            lastError: null,
            runs: [],
            notifications: [],
          };
          draft.push(schedule);
        } else {
          if (
            schedule.currentRunId &&
            ['device', 'maxPages', 'interval'].some(
              (field) => values[field] !== undefined && values[field] !== schedule[field],
            )
          )
            throw busy();
          if (
            (values.interval && values.interval !== schedule.interval) ||
            (values.active === true && !schedule.active && schedule.nextRunAt <= iso(now()))
          )
            schedule.nextRunAt = nextProjectRun(values.interval || schedule.interval, now());
          Object.assign(schedule, values, { updatedAt: iso(now()) });
        }
        await commit(draft);
        return publicSchedule(schedule, [project]);
      });
    },
    async remove(projectId) {
      await checkReady();
      return serial(async () => {
        if (schedules.some((s) => s.projectId === projectId && s.currentRunId)) throw busy();
        await commit(schedules.filter((s) => s.projectId !== projectId));
      });
    },
    async read(projectId) {
      await checkReady();
      return serial(async () => {
        const project = await projectFor(projectId),
          draft = structuredClone(schedules),
          schedule = get(draft, projectId);
        schedule.notifications.forEach((alert) => {
          alert.readAt ||= iso(now());
        });
        await commit(draft);
        return publicSchedule(schedule, [project]);
      });
    },
    async due() {
      await checkReady();
      return schedules
        .filter((s) => s.active && !s.currentRunId && s.nextRunAt <= iso(now()))
        .sort((a, b) => a.nextRunAt.localeCompare(b.nextRunAt))
        .map((s) => ({ projectId: s.projectId, nextRunAt: s.nextRunAt }));
    },
    async run(projectId, { scheduled = false } = {}) {
      await checkReady();
      return serial(async () => {
        const project = await projectFor(projectId),
          draft = structuredClone(schedules),
          schedule = get(draft, projectId);
        if (scheduled && (!schedule.active || schedule.nextRunAt > iso(now()))) return null;
        if (stopped || schedule.currentRunId || batches.isActive() || isBusy()) throw busy();
        const previous = structuredClone(schedules);
        schedule.currentRunId = randomUUID();
        schedule.lastStatus = 'running';
        schedule.lastError = null;
        schedule.lastRunAt = iso(now());
        schedule.updatedAt = iso(now());
        schedule.nextRunAt = nextProjectRun(schedule.interval, now());
        await commit(draft);
        let batch;
        try {
          batch = await batches.start(
            projectId,
            { device: schedule.device, maxPages: schedule.maxPages },
            null,
            {
              scheduleRunId: schedule.currentRunId,
              trigger: scheduled ? 'schedule' : 'schedule-manual',
            },
          );
        } catch (error) {
          if (error.code === 'BUSY') await commit(previous);
          else {
            schedule.currentRunId = null;
            schedule.currentBatchId = null;
            schedule.lastStatus = 'error';
            schedule.lastError = String(error.message).slice(0, 500);
            notify(schedule, {
              type: 'failure',
              batchId: null,
              beforeBatchId: null,
              message: `Không khởi tạo được lượt theo lịch: ${schedule.lastError}`,
              websites: [],
            });
            await commit(draft);
          }
          throw error;
        }
        schedule.currentBatchId = batch.id;
        await commit(draft);
        return { schedule: publicSchedule(schedule, [project]), batch };
      });
    },
    async finish(batch) {
      await checkReady();
      if (!batch.scheduleRunId) return;
      return serial(async () => {
        const draft = structuredClone(schedules),
          schedule = draft.find(
            (s) => s.projectId === batch.projectId && s.currentRunId === batch.scheduleRunId,
          );
        if (schedule) {
          await finishDraft(schedule, batch);
          await commit(draft);
        }
      });
    },
    async reconcile() {
      await checkReady();
      return serial(() => reconcileDraft(structuredClone(schedules)));
    },
    async close() {
      stopped = true;
      await ready;
      await writes.catch(() => {});
    },
  };
}
