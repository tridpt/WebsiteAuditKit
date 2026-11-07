import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { runAudit } from './analyzer.mjs';
import { AuditError, normalizeUrl, SafeNetwork } from './network.mjs';
import {
  root,
  reportsDir,
  reportDir,
  readReport,
  listReports,
  saveReport,
  validId,
  withReportLock,
} from './store.mjs';
import { exportCsv, reportHtml } from './export.mjs';
import { createPdf } from './browser.mjs';
import { getBranding, updateBranding, validateBrandingInput } from './branding.mjs';
import { compareReports } from './comparison.mjs';
import { workspaceRoutes } from './workspace-routes.mjs';
import { createBatchManager, summarizeBatch } from './batch.mjs';
import { createProjectScheduleManager } from './project-schedules.mjs';
import { batchHtml, batchCsv, batchComparisonHtml, batchComparisonCsv } from './batch-export.mjs';
import { getWorkspace, assignResource, exportContext, validateTaskPatch } from './workspace.mjs';
import {
  claimMonitorRun,
  createMonitor,
  deleteMonitor,
  dueMonitors,
  failMonitorRun,
  finishMonitorRun,
  getMonitor,
  listMonitors,
  markMonitorRead,
  recoverMonitorRuns,
  removeMonitorReport,
  updateMonitor,
  validateMonitorInput,
} from './monitor.mjs';

export function createApp({
  auditRunner = runAudit,
  monitorPollMs = 60_000,
  startupDelayMs = 2_000,
  scheduleNow = () => new Date(),
} = {}) {
  const app = express();
  const jobs = new Map();
  let exportingPdf = false;
  let startingAudit = false;
  let schedulingMonitors = false;
  let closing = false;
  let monitorStartupError = null;
  const monitorReady = recoverMonitorRuns().catch((error) => {
    monitorStartupError = error;
  });
  const runningJobs = () => [...jobs.values()].filter((job) => job.status === 'running');
  const runningMonitorIds = () =>
    new Set(
      runningJobs()
        .map((job) => job.monitorId)
        .filter(Boolean),
    );
  const monitorList = async () =>
    (await listMonitors(runningMonitorIds())).map((monitor) => {
      const current = runningJobs().find((job) => job.monitorId === monitor.id);
      return {
        ...monitor,
        currentJob: current
          ? { id: current.id, progress: current.progress, message: current.message }
          : null,
      };
    });

  async function createAuditJob({
    inputUrl,
    device,
    maxPages,
    monitorId = null,
    projectId = null,
    batchId = null,
  }) {
    const url = normalizeUrl(inputUrl);
    const pageLimit = Number(maxPages ?? 5);
    if (![1, 5, 10].includes(pageLimit))
      throw new AuditError('Chọn tối đa 1, 5 hoặc 10 trang.', 'INVALID_AUDIT');
    if (!['mobile', 'desktop'].includes(device))
      throw new AuditError('Thiết bị không hợp lệ.', 'INVALID_AUDIT');
    const guard = new SafeNetwork();
    try {
      await guard.validate(url);
    } finally {
      await guard.close();
    }
    if (closing)
      throw new AuditError('Máy chủ đang dừng. Hãy mở lại ứng dụng để tiếp tục.', 'ABORTED');
    const workspace = await getWorkspace();
    const selectedProject = monitorId ? workspace.monitors[monitorId] || null : projectId;
    if (
      selectedProject !== null &&
      (!validId(selectedProject) ||
        !workspace.projects.some((project) => project.id === selectedProject))
    )
      throw new AuditError('Dự án không còn tồn tại. Hãy chọn lại dự án.', 'INVALID_WORKSPACE');
    const id = randomUUID();
    const controller = new AbortController();
    const job = {
      id,
      url,
      device,
      maxPages: pageLimit,
      monitorId,
      projectId: selectedProject,
      batchId,
      status: 'running',
      progress: 1,
      message: monitorId ? 'Chuẩn bị lượt theo dõi…' : 'Chuẩn bị kiểm tra website…',
      startedAt: new Date().toISOString(),
      controller,
      error: null,
    };
    jobs.set(id, job);
    const timer = setTimeout(
      () =>
        controller.abort(
          new AuditError(
            'Lượt kiểm tra vượt quá 240 giây. Hãy thử lại với ít trang hơn.',
            'AUDIT_TIMEOUT',
          ),
        ),
      240000,
    );
    const execute = async () => {
      let report = null;
      let saved = false;
      try {
        await fs.mkdir(reportDir(id), { recursive: true });
        report = await auditRunner({
          id,
          url,
          device,
          maxPages: pageLimit,
          dir: reportDir(id),
          signal: controller.signal,
          onProgress: (progress, message) => {
            job.progress = Math.max(job.progress, progress);
            job.message = monitorId ? `Theo dõi: ${message}` : message;
          },
        });
        if (controller.signal.aborted) throw controller.signal.reason;
        if (monitorId) report.monitorId = monitorId;
        if (batchId) report.batchId = batchId;
        await saveReport(report);
        saved = true;
        if (selectedProject)
          await assignResource('reports', id, selectedProject, { allowMissing: true });
        if (monitorId) await finishMonitorRun(monitorId, report);
        job.status = 'completed';
        job.progress = 100;
        job.message = monitorId ? 'Lượt theo dõi đã hoàn tất.' : 'Báo cáo đã sẵn sàng.';
      } catch (error) {
        job.status =
          controller.signal.aborted && controller.signal.reason?.code === 'ABORTED'
            ? 'cancelled'
            : 'failed';
        job.error = error.message || 'Có lỗi khi kiểm tra website.';
        job.message = job.error;
        if (monitorId) await failMonitorRun(monitorId, error).catch(() => {});
        if (!saved) await fs.rm(reportDir(id), { recursive: true, force: true }).catch(() => {});
      } finally {
        clearTimeout(timer);
        job.finishedAt = new Date().toISOString();
        const expiry = setTimeout(() => jobs.delete(id), 60 * 60 * 1000);
        expiry.unref();
      }
    };
    Object.defineProperty(job, 'completion', { value: execute() });
    return job;
  }

  let projectSchedules;
  const batches = createBatchManager({
    createJob: createAuditJob,
    getJob: (id) => jobs.get(id),
    isBusy: () => closing || startingAudit || runningJobs().length > 0,
    onFinished: (batch) => projectSchedules?.finish(batch) || Promise.resolve(),
  });
  projectSchedules = createProjectScheduleManager({
    batches,
    isBusy: () => closing || startingAudit || runningJobs().length > 0,
    now: scheduleNow,
  });

  async function startMonitorJob(monitorId, { scheduled = false } = {}) {
    if (closing || startingAudit || runningJobs().length || batches.isActive())
      throw new AuditError('Một lượt kiểm tra đang chạy. Hãy chờ hoàn tất rồi thử lại.', 'BUSY');
    startingAudit = true;
    let claimed = false;
    try {
      await monitorReady;
      if (monitorStartupError) throw monitorStartupError;
      const monitor = await claimMonitorRun(monitorId, new Date(), { scheduled });
      if (!monitor) {
        if (scheduled) return null;
        throw new AuditError('Không tìm thấy lượt theo dõi.', 'NOT_FOUND');
      }
      claimed = true;
      return await createAuditJob({
        inputUrl: monitor.url,
        device: monitor.device,
        maxPages: monitor.maxPages,
        monitorId,
      });
    } catch (error) {
      if (claimed) await failMonitorRun(monitorId, error).catch(() => {});
      throw error;
    } finally {
      startingAudit = false;
    }
  }

  async function runDueMonitors() {
    if (
      closing ||
      schedulingMonitors ||
      startingAudit ||
      runningJobs().length ||
      batches.isActive()
    )
      return;
    schedulingMonitors = true;
    try {
      await monitorReady;
      if (closing) return;
      // One shared scheduler picks the oldest due item across website and project
      // schedules. Busy queues retain their due time until the audit slot is free.
      let projectDue = [];
      try {
        await projectSchedules.reconcile();
        projectDue = await projectSchedules.due();
      } catch (error) {
        console.error(`Không đọc được lịch dự án: ${error.message}`);
      }
      const due = monitorStartupError
        ? []
        : await dueMonitors().catch((error) => {
            console.error(`Không đọc được lịch website: ${error.message}`);
            return [];
          });
      if (projectDue.length && (!due.length || projectDue[0].nextRunAt <= due[0].nextRunAt))
        await projectSchedules.run(projectDue[0].projectId, { scheduled: true }).catch((error) => {
          if (error.code !== 'BUSY') console.error(`Không chạy được lịch dự án: ${error.message}`);
        });
      else if (due.length) await startMonitorJob(due[0].id, { scheduled: true }).catch(() => {});
    } catch (error) {
      console.error(`Không thể đọc lịch theo dõi: ${error.message}`);
    } finally {
      schedulingMonitors = false;
    }
  }
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    const host = (req.headers.host || '').replace(/:\d+$/, '');
    if (!['localhost', '127.0.0.1', '[::1]'].includes(host))
      return res.status(403).json({ error: 'Host không được phép.' });
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.headers.origin;
      if (origin) {
        try {
          const parsed = new URL(origin);
          if (
            !['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) ||
            !['4318', '5178', process.env.PORT || '4318'].includes(parsed.port)
          )
            return res.status(403).json({ error: 'Nguồn yêu cầu không được phép.' });
        } catch {
          return res.sendStatus(403);
        }
      }
      if (req.headers['sec-fetch-site'] === 'cross-site') return res.sendStatus(403);
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    if (req.path.startsWith('/api')) res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use('/api/branding', express.json({ limit: '440kb' }));
  app.use('/api/clients', express.json({ limit: '440kb' }));
  app.use(express.json({ limit: '16kb' }));
  app.get('/api/health', (_req, res) =>
    res.json({ ok: true, app: 'Website Audit Kit', version: '1.0.0' }),
  );
  workspaceRoutes(app, runningJobs, {
    projectBusy: (id) => batches.projectBusy(id) || projectSchedules.projectBusy(id),
    onDeleteProject: async (id) => {
      await projectSchedules.remove(id);
      await batches.removeProject(id);
    },
  });
  const batchRoute = (work) => async (req, res) => {
    try {
      await work(req, res);
    } catch (error) {
      res
        .status(
          error.code === 'NOT_FOUND'
            ? 404
            : error.code === 'BUSY'
              ? 409
              : [
                    'INVALID_BATCH',
                    'INVALID_SCHEDULE',
                    'INVALID_WORKSPACE',
                    'BLOCKED_URL',
                    'INVALID_URL',
                  ].includes(error.code)
                ? 400
                : 500,
        )
        .json({ error: error.message || 'Không thể xử lý lượt kiểm tra dự án.' });
    }
  };
  app.get(
    '/api/project-schedules',
    batchRoute(async (_req, res) => res.json(await projectSchedules.list())),
  );
  app.get(
    '/api/projects/:projectId/schedule',
    batchRoute(async (req, res) => res.json(await projectSchedules.get(req.params.projectId))),
  );
  app.put(
    '/api/projects/:projectId/schedule',
    batchRoute(async (req, res) =>
      res.json(await projectSchedules.save(req.params.projectId, req.body)),
    ),
  );
  app.patch(
    '/api/projects/:projectId/schedule',
    batchRoute(async (req, res) =>
      res.json(await projectSchedules.save(req.params.projectId, req.body, true)),
    ),
  );
  app.delete(
    '/api/projects/:projectId/schedule',
    batchRoute(async (req, res) => {
      await projectSchedules.remove(req.params.projectId);
      res.json({ ok: true });
    }),
  );
  app.post(
    '/api/projects/:projectId/schedule/run',
    batchRoute(async (req, res) =>
      res.status(202).json(await projectSchedules.run(req.params.projectId)),
    ),
  );
  app.post(
    '/api/projects/:projectId/schedule/read',
    batchRoute(async (req, res) => res.json(await projectSchedules.read(req.params.projectId))),
  );
  app.get(
    '/api/projects/:projectId/batches',
    batchRoute(async (req, res) => res.json(await batches.list(req.params.projectId))),
  );
  app.post(
    '/api/projects/:projectId/batches',
    batchRoute(async (req, res) =>
      res.status(202).json(await batches.start(req.params.projectId, req.body)),
    ),
  );
  app.get(
    '/api/projects/:projectId/batch-comparison',
    batchRoute(async (req, res) => {
      if (!validId(req.query.before) || !validId(req.query.after))
        throw new AuditError('Chọn hai lần kiểm tra để so sánh.', 'INVALID_BATCH');
      res.json(await batches.compare(req.params.projectId, req.query.before, req.query.after));
    }),
  );
  app.get(
    '/api/projects/:projectId/batch-comparison/export',
    batchRoute(async (req, res) => {
      if (!validId(req.query.before) || !validId(req.query.after))
        throw new AuditError('Chọn hai lần kiểm tra để so sánh.', 'INVALID_BATCH');
      const comparison = await batches.compare(
        req.params.projectId,
        req.query.before,
        req.query.after,
      );
      const client = (await getWorkspace()).clients.find(
        (item) => item.id === comparison.client.id,
      );
      const branding = client?.branding || (await getBranding());
      const format = req.query.format || 'pdf';
      const filename = `project-comparison-${comparison.before.id}-${comparison.after.id}`;
      const interval = req.query.interval || 'weekly';
      const url = req.query.url || comparison.websites[0]?.url || '';
      if (
        !['weekly', 'monthly'].includes(interval) ||
        typeof url !== 'string' ||
        (url && !comparison.websites.some((site) => site.url === url))
      )
        throw new AuditError(
          'Website hoặc khoảng thời gian xu hướng không hợp lệ.',
          'INVALID_BATCH',
        );
      const selectedTrend = { interval, url };
      if (format === 'json')
        return res
          .attachment(`${filename}.json`)
          .type('json')
          .send(JSON.stringify({ ...comparison, branding, selectedTrend }, null, 2));
      if (format === 'csv')
        return res
          .attachment(`${filename}.csv`)
          .type('text/csv; charset=utf-8')
          .send(batchComparisonCsv(comparison, branding));
      if (format === 'html')
        return res
          .attachment(`${filename}.html`)
          .type('html')
          .send(batchComparisonHtml(comparison, branding, selectedTrend));
      if (format === 'pdf') {
        if (exportingPdf)
          throw new AuditError('Một bản PDF đang được tạo. Vui lòng thử lại sau.', 'BUSY');
        exportingPdf = true;
        try {
          res
            .attachment(`${filename}.pdf`)
            .type('application/pdf')
            .send(
              await createPdf(batchComparisonHtml(comparison, branding, selectedTrend), {
                agencyName: branding.agencyName,
              }),
            );
        } finally {
          exportingPdf = false;
        }
        return;
      }
      throw new AuditError('Định dạng không hợp lệ.', 'INVALID_BATCH');
    }),
  );
  app.get(
    '/api/projects/:projectId/batches/:batchId',
    batchRoute(async (req, res) =>
      res.json(await batches.get(req.params.projectId, req.params.batchId)),
    ),
  );
  app.post(
    '/api/projects/:projectId/batches/:batchId/cancel',
    batchRoute(async (req, res) =>
      res.json(await batches.cancel(req.params.projectId, req.params.batchId)),
    ),
  );
  app.post(
    '/api/projects/:projectId/batches/:batchId/retry',
    batchRoute(async (req, res) =>
      res.status(202).json(await batches.start(req.params.projectId, {}, req.params.batchId)),
    ),
  );
  app.get(
    '/api/projects/:projectId/batches/:batchId/summary',
    batchRoute(async (req, res) =>
      res.json(await summarizeBatch(await batches.get(req.params.projectId, req.params.batchId))),
    ),
  );
  app.get(
    '/api/projects/:projectId/batches/:batchId/export',
    batchRoute(async (req, res) => {
      const batch = await batches.get(req.params.projectId, req.params.batchId);
      if (batch.status === 'running')
        throw new AuditError(
          'Chờ hàng đợi hoàn tất hoặc hủy trước khi xuất báo cáo tổng hợp.',
          'BUSY',
        );
      const summary = await summarizeBatch(batch);
      const client = (await getWorkspace()).clients.find((c) => c.id === summary.client.id);
      const branding = client?.branding || (await getBranding());
      const format = req.query.format || 'pdf';
      const filename = `project-audit-${batch.id}`;
      if (format === 'json')
        return res
          .attachment(`${filename}.json`)
          .type('json')
          .send(JSON.stringify({ ...summary, branding }, null, 2));
      if (format === 'csv')
        return res
          .attachment(`${filename}.csv`)
          .type('text/csv; charset=utf-8')
          .send(batchCsv(summary, branding));
      if (format === 'html')
        return res.attachment(`${filename}.html`).type('html').send(batchHtml(summary, branding));
      if (format === 'pdf') {
        if (exportingPdf)
          throw new AuditError('Một bản PDF đang được tạo. Vui lòng thử lại sau.', 'BUSY');
        exportingPdf = true;
        try {
          res
            .attachment(`${filename}.pdf`)
            .type('application/pdf')
            .send(
              await createPdf(batchHtml(summary, branding), { agencyName: branding.agencyName }),
            );
        } finally {
          exportingPdf = false;
        }
        return;
      }
      throw new AuditError('Định dạng không hợp lệ.', 'INVALID_BATCH');
    }),
  );
  app.get('/api/branding', async (_req, res) => res.json(await getBranding()));
  app.patch('/api/branding', async (req, res) => {
    try {
      const values = validateBrandingInput(req.body, { partial: true });
      res.json(await updateBranding(values));
    } catch (error) {
      res.status(400).json({ error: error.message || 'Không thể lưu cấu hình thương hiệu.' });
    }
  });
  app.use('/api/monitors', async (_req, _res, next) => {
    await monitorReady;
    if (monitorStartupError) return next(monitorStartupError);
    next();
  });

  app.get('/api/monitors', async (_req, res) => res.json(await monitorList()));
  app.post('/api/monitors', async (req, res) => {
    try {
      const values = validateMonitorInput(req.body);
      const projectId = req.body.projectId ?? null;
      if (
        projectId !== null &&
        !(await getWorkspace()).projects.some((project) => project.id === projectId)
      )
        throw new AuditError('Dự án không còn tồn tại.', 'INVALID_WORKSPACE');
      const guard = new SafeNetwork();
      try {
        await guard.validate(values.url);
      } finally {
        await guard.close();
      }
      const candidate = await createMonitor(values);
      if (projectId) {
        try {
          await assignResource('monitors', candidate.id, projectId);
        } catch (error) {
          await deleteMonitor(candidate.id);
          throw error;
        }
      }
      res.status(201).json((await monitorList()).find((item) => item.id === candidate.id));
    } catch (error) {
      res.status(400).json({ error: error.message || 'Không thể tạo lượt theo dõi.' });
    }
  });
  app.patch('/api/monitors/:id', async (req, res) => {
    try {
      const values = validateMonitorInput(req.body, { partial: true });
      const current = await getMonitor(req.params.id);
      if (!current) return res.status(404).json({ error: 'Không tìm thấy lượt theo dõi.' });
      if (runningMonitorIds().has(req.params.id) && req.body.url && req.body.url !== current.url)
        return res.status(409).json({ error: 'Không thể đổi URL khi lượt theo dõi đang chạy.' });
      if (values.url && values.url !== current.url) {
        const guard = new SafeNetwork();
        try {
          await guard.validate(values.url);
        } finally {
          await guard.close();
        }
      }
      const updated = await updateMonitor(req.params.id, values);
      if (!updated) return res.status(404).json({ error: 'Không tìm thấy lượt theo dõi.' });
      res.json((await monitorList()).find((item) => item.id === updated.id));
    } catch (error) {
      res
        .status(error.code === 'BUSY' ? 409 : 400)
        .json({ error: error.message || 'Không thể cập nhật lượt theo dõi.' });
    }
  });
  app.post('/api/monitors/:id/run', async (req, res) => {
    try {
      const job = await startMonitorJob(req.params.id);
      res.status(202).json({
        id: job.id,
        status: 'running',
        url: job.url,
        device: job.device,
        maxPages: job.maxPages,
        monitorId: req.params.id,
      });
    } catch (error) {
      const status = error.code === 'NOT_FOUND' ? 404 : error.code === 'BUSY' ? 409 : 400;
      res.status(status).json({ error: error.message || 'Không thể chạy lượt theo dõi.' });
    }
  });
  app.delete('/api/monitors/:id', async (req, res) => {
    try {
      if (!(await deleteMonitor(req.params.id)))
        return res.status(404).json({ error: 'Không tìm thấy lượt theo dõi.' });
      await assignResource('monitors', req.params.id, null);
      res.json({ ok: true });
    } catch (error) {
      res.status(error.code === 'BUSY' ? 409 : 400).json({ error: error.message });
    }
  });
  app.post('/api/monitors/:id/read', async (req, res) => {
    if (!(await markMonitorRead(req.params.id)))
      return res.status(404).json({ error: 'Không tìm thấy lượt theo dõi.' });
    res.json({ ok: true });
  });

  app.post('/api/audits', async (req, res) => {
    if (closing || startingAudit || runningJobs().length || batches.isActive())
      return res
        .status(409)
        .json({ error: 'Một lượt kiểm tra đang chạy. Hãy chờ hoàn tất hoặc hủy lượt hiện tại.' });
    startingAudit = true;
    try {
      const job = await createAuditJob({
        inputUrl: req.body.url,
        device: req.body.device || 'mobile',
        maxPages: req.body.maxPages ?? 5,
        projectId: req.body.projectId ?? null,
      });
      res.status(202).json({
        id: job.id,
        status: 'running',
        url: job.url,
        device: job.device,
        maxPages: job.maxPages,
      });
    } catch (error) {
      res.status(400).json({ error: error.message || 'Yêu cầu không hợp lệ.' });
    } finally {
      startingAudit = false;
    }
  });
  app.get('/api/jobs/:id', (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job)
      return res
        .status(404)
        .json({ error: 'Không tìm thấy lượt kiểm tra. Máy chủ có thể đã khởi động lại.' });
    const { controller, ...publicJob } = job;
    res.json(publicJob);
  });
  app.delete('/api/jobs/:id', (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job) return res.status(404).json({ error: 'Không tìm thấy lượt kiểm tra.' });
    if (job.status === 'running')
      job.controller.abort(new AuditError('Đã hủy lần kiểm tra.', 'ABORTED'));
    res.json({ ok: true });
  });
  app.get('/api/reports', async (_req, res) => res.json(await listReports()));
  app.get('/api/reports/compare', async (req, res) => {
    const { before, after } = req.query;
    if (!validId(before) || !validId(after) || before === after)
      return res.status(400).json({ error: 'Chọn hai báo cáo khác nhau để so sánh.' });
    const reports = await Promise.all([readReport(before), readReport(after)]);
    if (reports.some((r) => !r))
      return res.status(404).json({ error: 'Không tìm thấy báo cáo để so sánh.' });
    res.json(compareReports(...reports));
  });
  app.get('/api/reports/:id', async (req, res) => {
    const report = await readReport(req.params.id);
    if (!report) return res.status(404).json({ error: 'Không tìm thấy báo cáo.' });
    res.json(report);
  });
  app.patch('/api/reports/:id/checks/:checkId', async (req, res) => {
    let values;
    try {
      values = validateTaskPatch(req.body);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
    await withReportLock(req.params.id, async () => {
      const report = await readReport(req.params.id);
      if (!report) return res.status(404).json({ error: 'Không tìm thấy báo cáo.' });
      const check = report.checks.find(
        (c) => c.id === req.params.checkId && ['warn', 'fail'].includes(c.status),
      );
      if (!check) return res.status(404).json({ error: 'Không tìm thấy việc cần sửa.' });
      Object.assign(check, values);
      await saveReport(report);
      res.json({ id: check.id, ...values });
    });
  });
  app.delete('/api/reports/:id', async (req, res) => {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'ID không hợp lệ.' });
    await withReportLock(req.params.id, async () => {
      const report = await readReport(req.params.id);
      if (!report) return res.status(404).json({ error: 'Không tìm thấy báo cáo.' });
      await removeMonitorReport(req.params.id, () =>
        fs.rm(reportDir(req.params.id), { recursive: true, force: true }),
      );
      await assignResource('reports', req.params.id, null);
      res.json({ ok: true });
    });
  });
  app.get('/api/reports/:id/screenshots/:name', async (req, res) => {
    if (!validId(req.params.id) || !['mobile.png', 'desktop.png'].includes(req.params.name))
      return res.sendStatus(404);
    if (!(await readReport(req.params.id))) return res.sendStatus(404);
    res.sendFile(path.join(reportDir(req.params.id), req.params.name), (error) => {
      if (error && !res.headersSent) res.sendStatus(404);
    });
  });
  app.get('/api/reports/:id/export', async (req, res) => {
    const report = await readReport(req.params.id);
    if (!report) return res.status(404).json({ error: 'Không tìm thấy báo cáo.' });
    const { branding, context } = await exportContext(report.id);
    const format = req.query.format || 'json';
    const filename = `audit-${report.title.replace(/[^a-z\d.-]/gi, '-')}-${report.createdAt.slice(0, 10)}`;
    if (format === 'json')
      return res
        .attachment(`${filename}.json`)
        .type('json')
        .send(JSON.stringify({ ...report, branding, ...(context ? { context } : {}) }, null, 2));
    if (format === 'csv')
      return res
        .attachment(`${filename}-tasks.csv`)
        .type('text/csv; charset=utf-8')
        .send(exportCsv(report, branding, context));
    if (format === 'html')
      return res
        .attachment(`${filename}.html`)
        .type('html')
        .send(reportHtml(report, branding, context));
    if (format === 'pdf') {
      if (exportingPdf)
        return res.status(409).json({ error: 'Một bản PDF đang được tạo. Vui lòng thử lại sau.' });
      exportingPdf = true;
      try {
        return res
          .attachment(`${filename}.pdf`)
          .type('application/pdf')
          .send(
            await createPdf(reportHtml(report, branding, context), {
              agencyName: branding.agencyName,
            }),
          );
      } catch (error) {
        return res.status(503).json({ error: error.message });
      } finally {
        exportingPdf = false;
      }
    }
    res.status(400).json({ error: 'Định dạng không hợp lệ.' });
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Không tìm thấy API.' }));
  app.use(express.static(path.join(root, 'dist')));
  app.get('/{*path}', async (_req, res) => {
    try {
      await fs.access(path.join(root, 'dist', 'index.html'));
      res.sendFile(path.join(root, 'dist', 'index.html'));
    } catch {
      res
        .status(503)
        .type('text')
        .send('Frontend chưa build. Chạy npm run build hoặc npm run dev.');
    }
  });
  app.use((error, _req, res, _next) => {
    if (res.headersSent) return;
    res
      .status(
        error.type === 'entity.parse.failed' ? 400 : error.type === 'entity.too.large' ? 413 : 500,
      )
      .json({
        error:
          error.type === 'entity.parse.failed'
            ? 'JSON không hợp lệ.'
            : error.type === 'entity.too.large'
              ? 'Dữ liệu tải lên vượt quá giới hạn. Logo cần nhỏ hơn 300 KB.'
              : 'Không thể xử lý yêu cầu. Vui lòng thử lại.',
      });
  });
  const monitorTimer = setInterval(() => void runDueMonitors(), monitorPollMs);
  monitorTimer.unref();
  const startupTimer = setTimeout(() => void runDueMonitors(), startupDelayMs);
  startupTimer.unref();
  return {
    app,
    jobs,
    batches,
    projectSchedules,
    runDueWork: runDueMonitors,
    close: async () => {
      closing = true;
      clearInterval(monitorTimer);
      clearTimeout(startupTimer);
      for (const job of runningJobs())
        job.controller.abort(new AuditError('Máy chủ đã dừng.', 'ABORTED'));
      await projectSchedules.close();
      await batches.close();
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await fs.mkdir(reportsDir, { recursive: true });
  const { app, jobs, close } = createApp();
  const port = Number(process.env.PORT || 4318);
  const server = app.listen(port, '127.0.0.1', () =>
    console.log(`Website Audit Kit → http://127.0.0.1:${port}`),
  );
  async function stop() {
    await close();
    for (const job of jobs.values())
      job.controller.abort(new AuditError('Máy chủ đã dừng.', 'ABORTED'));
    server.close();
  }
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
