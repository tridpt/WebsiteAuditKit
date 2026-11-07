import { randomUUID } from 'node:crypto';
import { compareReports } from './comparison.mjs';
import { normalizeUrl, AuditError } from './network.mjs';
import { readMonitors, saveMonitors, withMonitorsLock, readReport, validId } from './store.mjs';

export const monitorIntervals = { daily: 24 * 60 * 60 * 1000, weekly: 7 * 24 * 60 * 60 * 1000 };
export const monitorIntervalLabels = { daily: 'Mỗi ngày', weekly: 'Mỗi tuần' };

export function nextMonitorRun(interval, from = new Date()) {
  const duration = monitorIntervals[interval];
  if (!duration) throw new AuditError('Chu kỳ theo dõi không hợp lệ.', 'INVALID_MONITOR');
  return new Date(new Date(from).getTime() + duration).toISOString();
}

export function validateMonitorInput(input, { partial = false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new AuditError('Thông tin theo dõi không hợp lệ.', 'INVALID_MONITOR');
  const output = {};
  if (!partial || input.name !== undefined) {
    if (
      typeof input.name !== 'string' ||
      input.name.trim().length < 1 ||
      input.name.trim().length > 80
    )
      throw new AuditError('Tên dự án cần dài từ 1 đến 80 ký tự.', 'INVALID_MONITOR');
    output.name = input.name.trim();
  }
  if (!partial || input.url !== undefined) output.url = normalizeUrl(input.url);
  if (!partial || input.device !== undefined) {
    if (!['mobile', 'desktop'].includes(input.device))
      throw new AuditError('Thiết bị theo dõi không hợp lệ.', 'INVALID_MONITOR');
    output.device = input.device;
  }
  if (!partial || input.maxPages !== undefined) {
    const maxPages = Number(input.maxPages);
    if (![1, 5, 10].includes(maxPages))
      throw new AuditError('Chọn tối đa 1, 5 hoặc 10 trang.', 'INVALID_MONITOR');
    output.maxPages = maxPages;
  }
  if (!partial || input.interval !== undefined) {
    if (!Object.hasOwn(monitorIntervals, input.interval))
      throw new AuditError('Chu kỳ theo dõi không hợp lệ.', 'INVALID_MONITOR');
    output.interval = input.interval;
  }
  if (input.active !== undefined) {
    if (typeof input.active !== 'boolean')
      throw new AuditError('Trạng thái theo dõi không hợp lệ.', 'INVALID_MONITOR');
    output.active = input.active;
  }
  return output;
}

function publicMonitor(monitor, runningIds = new Set()) {
  return {
    ...monitor,
    running: monitor.lastStatus === 'running' || runningIds.has(monitor.id),
    unreadAlerts: (monitor.notifications || []).filter((notification) => !notification.readAt)
      .length,
    intervalLabel: monitorIntervalLabels[monitor.interval],
  };
}

export async function listMonitors(runningIds = new Set()) {
  return (await readMonitors())
    .filter((monitor) => validId(monitor.id))
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
    .map((monitor) => publicMonitor(monitor, runningIds));
}

export async function getMonitor(id) {
  if (!validId(id)) return null;
  return (await readMonitors()).find((monitor) => monitor.id === id) || null;
}

export async function createMonitor(input) {
  const values = validateMonitorInput(input);
  const now = new Date();
  const monitor = {
    id: randomUUID(),
    ...values,
    active: values.active ?? true,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    nextRunAt: nextMonitorRun(values.interval, now),
    lastRunAt: null,
    lastReportId: null,
    previousReportId: null,
    lastScore: null,
    lastStatus: 'never',
    lastError: null,
    alert: null,
    runs: [],
    notifications: [],
  };
  return withMonitorsLock(async () => {
    const monitors = await readMonitors();
    monitors.push(monitor);
    await saveMonitors(monitors);
    return monitor;
  });
}

export async function updateMonitor(id, patch) {
  const values = validateMonitorInput(patch, { partial: true });
  return withMonitorsLock(async () => {
    const monitors = await readMonitors();
    const monitor = monitors.find((item) => item.id === id);
    if (!monitor) return null;
    const priorInterval = monitor.interval;
    if (
      monitor.lastStatus === 'running' &&
      ['url', 'device', 'maxPages'].some(
        (field) => values[field] !== undefined && values[field] !== monitor[field],
      )
    )
      throw new AuditError(
        'Chờ lượt đang chạy hoàn tất trước khi đổi URL, thiết bị hoặc phạm vi.',
        'BUSY',
      );
    const targetChanged = values.url !== undefined && values.url !== monitor.url;
    Object.assign(monitor, values);
    if (targetChanged) {
      monitor.lastReportId = null;
      monitor.previousReportId = null;
      monitor.lastScore = null;
      monitor.lastRunAt = null;
      monitor.lastStatus = 'never';
      monitor.lastError = null;
      monitor.alert = null;
      monitor.runs = [];
      monitor.notifications = [];
      monitor.nextRunAt = nextMonitorRun(monitor.interval);
    }
    if (values.interval && values.interval !== priorInterval)
      monitor.nextRunAt = nextMonitorRun(values.interval);
    if (values.active === true && (!monitor.nextRunAt || new Date(monitor.nextRunAt) <= new Date()))
      monitor.nextRunAt = nextMonitorRun(monitor.interval);
    monitor.updatedAt = new Date().toISOString();
    await saveMonitors(monitors);
    return monitor;
  });
}

export async function deleteMonitor(id) {
  return withMonitorsLock(async () => {
    const monitors = await readMonitors();
    if (monitors.some((monitor) => monitor.id === id && monitor.lastStatus === 'running'))
      throw new AuditError('Lượt theo dõi đang chạy. Hãy chờ hoàn tất rồi xóa.', 'BUSY');
    const next = monitors.filter((monitor) => monitor.id !== id);
    if (next.length === monitors.length) return false;
    await saveMonitors(next);
    return true;
  });
}

export async function claimMonitorRun(id, startedAt = new Date(), { scheduled = false } = {}) {
  return withMonitorsLock(async () => {
    const monitors = await readMonitors();
    const monitor = monitors.find((item) => item.id === id);
    if (!monitor) return null;
    if (
      scheduled &&
      (!monitor.active ||
        !monitor.nextRunAt ||
        new Date(monitor.nextRunAt).getTime() > new Date(startedAt).getTime())
    )
      return null;
    if (monitor.lastStatus === 'running')
      throw new AuditError('Lượt theo dõi này đang chạy.', 'BUSY');
    monitor.lastRunAt = new Date(startedAt).toISOString();
    monitor.lastStatus = 'running';
    monitor.lastError = null;
    monitor.nextRunAt = nextMonitorRun(monitor.interval, startedAt);
    monitor.updatedAt = new Date().toISOString();
    await saveMonitors(monitors);
    return monitor;
  });
}

export async function finishMonitorRun(id, report, finishedAt = new Date()) {
  return withMonitorsLock(async () => {
    const monitors = await readMonitors();
    const monitor = monitors.find((item) => item.id === id);
    if (!monitor) return null;
    const previous = monitor.lastReportId ? await readReport(monitor.lastReportId) : null;
    const diff = previous ? compareReports(previous, report) : null;
    const totalScore = diff?.scoreChanges.find((change) => change.id === 'total');
    const speedScore = diff?.scoreChanges.find((change) => change.id === 'performance');
    const scoreDelta = totalScore?.delta ?? null;
    const speedDrop =
      speedScore?.delta != null && speedScore.delta <= -5 ? Math.abs(speedScore.delta) : 0;
    const newIssues = diff?.counts.new || 0;
    const brokenLinks =
      diff?.changes.new.filter(
        (finding) => finding.rule === 'link-health' && finding.after === 'fail',
      ).length || 0;
    const seoIssues = diff?.changes.new.filter((finding) => finding.category === 'seo').length || 0;
    const scoreDrop = scoreDelta != null && scoreDelta <= -5;
    const hasAlert = Boolean(scoreDrop || speedDrop || brokenLinks || seoIssues);
    const alert = diff
      ? {
          at: new Date(finishedAt).toISOString(),
          hasAlert,
          scoreDelta,
          scoreReason: totalScore?.reason || null,
          scoreDrop: scoreDrop ? Math.abs(scoreDelta) : 0,
          speedDrop,
          newIssues,
          brokenLinks,
          seoIssues,
          resolvedIssues: diff.counts.resolved,
          unverifiedIssues: diff.counts.unverified,
          message: hasAlert
            ? [
                scoreDrop ? `Điểm giảm ${Math.abs(scoreDelta)} điểm` : '',
                speedDrop ? `Tốc độ giảm ${speedDrop} điểm` : '',
                brokenLinks ? `${brokenLinks} lỗi liên kết mới` : '',
                seoIssues ? `${seoIssues} lỗi SEO mới` : '',
              ]
                .filter(Boolean)
                .join(' · ')
            : 'Không có cảnh báo mới.',
        }
      : null;
    monitor.previousReportId = previous?.id || null;
    monitor.lastReportId = report.id;
    monitor.lastScore = report.score;
    monitor.lastStatus = hasAlert ? 'alert' : 'healthy';
    monitor.lastError = null;
    monitor.alert = alert;
    if (hasAlert) {
      monitor.notifications = [
        ...(monitor.notifications || []),
        {
          id: randomUUID(),
          createdAt: new Date(finishedAt).toISOString(),
          readAt: null,
          type: 'regression',
          message: alert.message,
          reportId: report.id,
          previousReportId: monitor.previousReportId,
        },
      ].slice(-20);
    }
    monitor.runs = [
      ...(Array.isArray(monitor.runs) ? monitor.runs : []),
      {
        reportId: report.id,
        createdAt: report.createdAt,
        score: report.score,
        status: monitor.lastStatus,
        alert: hasAlert,
        baseline: !previous,
        comparable: Boolean(totalScore?.comparable),
        comparisonReason: totalScore?.reason || null,
        scoreSource: report.lighthouse?.available ? 'Lighthouse + Audit Kit' : 'Audit Kit',
      },
    ].slice(-12);
    monitor.updatedAt = new Date(finishedAt).toISOString();
    await saveMonitors(monitors);
    return { monitor, diff, alert };
  });
}

export async function failMonitorRun(id, error, finishedAt = new Date()) {
  return withMonitorsLock(async () => {
    const monitors = await readMonitors();
    const monitor = monitors.find((item) => item.id === id);
    if (!monitor) return null;
    monitor.lastStatus = 'error';
    monitor.lastError = String(error?.message || error || 'Không thể kiểm tra website.').slice(
      0,
      500,
    );
    if (error?.code !== 'ABORTED')
      monitor.notifications = [
        ...(monitor.notifications || []),
        {
          id: randomUUID(),
          createdAt: new Date(finishedAt).toISOString(),
          readAt: null,
          type: 'failure',
          message: `Lượt theo dõi không hoàn tất: ${monitor.lastError}`,
          reportId: null,
          previousReportId: null,
        },
      ].slice(-20);
    monitor.updatedAt = new Date(finishedAt).toISOString();
    await saveMonitors(monitors);
    return monitor;
  });
}

export async function dueMonitors(now = new Date()) {
  const timestamp = new Date(now).getTime();
  return (await readMonitors())
    .filter(
      (monitor) =>
        validId(monitor.id) &&
        monitor.active &&
        monitor.lastStatus !== 'running' &&
        monitor.nextRunAt &&
        new Date(monitor.nextRunAt).getTime() <= timestamp,
    )
    .sort((a, b) => a.nextRunAt.localeCompare(b.nextRunAt));
}

export async function markMonitorRead(id) {
  return withMonitorsLock(async () => {
    const monitors = await readMonitors();
    const monitor = monitors.find((item) => item.id === id);
    if (!monitor) return null;
    const now = new Date().toISOString();
    for (const notification of monitor.notifications || []) notification.readAt ||= now;
    await saveMonitors(monitors);
    return monitor;
  });
}

export async function recoverMonitorRuns() {
  return withMonitorsLock(async () => {
    const monitors = await readMonitors();
    let changed = false;
    for (const monitor of monitors) {
      if (monitor.lastStatus !== 'running') continue;
      monitor.lastStatus = 'error';
      monitor.lastError =
        'Máy chủ đã dừng trong lượt theo dõi trước. Sẽ thử lại theo lịch hoặc bấm Chạy ngay.';
      monitor.nextRunAt = new Date().toISOString();
      changed = true;
    }
    if (changed) await saveMonitors(monitors);
  });
}

export async function removeMonitorReport(id, removeReport) {
  return withMonitorsLock(async () => {
    const monitors = await readMonitors();
    await removeReport();
    let changed = false;
    for (const monitor of monitors) {
      const priorRuns = monitor.runs || [];
      const runs = priorRuns.flatMap((run, index) =>
        run.reportId === id
          ? []
          : [
              {
                ...run,
                ...(index > 0 && priorRuns[index - 1].reportId === id
                  ? { comparable: false, comparisonReason: 'Báo cáo đối chiếu đã bị xóa' }
                  : {}),
              },
            ],
      );
      const referenced =
        monitor.lastReportId === id ||
        monitor.previousReportId === id ||
        runs.length !== (monitor.runs || []).length ||
        (monitor.notifications || []).some(
          (item) => item.reportId === id || item.previousReportId === id,
        );
      if (!referenced) continue;
      changed = true;
      monitor.runs = runs;
      monitor.notifications = (monitor.notifications || []).map((item) => ({
        ...item,
        reportId: item.reportId === id ? null : item.reportId,
        previousReportId: item.previousReportId === id ? null : item.previousReportId,
      }));
      if (monitor.lastReportId === id) {
        const latest = runs.at(-1);
        monitor.lastReportId = latest?.reportId || null;
        monitor.lastScore = latest?.score ?? null;
        if (!['running', 'error'].includes(monitor.lastStatus))
          monitor.lastStatus = latest?.status || 'never';
        monitor.alert = null;
      }
      if (monitor.previousReportId === id || monitor.previousReportId === monitor.lastReportId)
        monitor.previousReportId = runs.at(-2)?.reportId || null;
      monitor.updatedAt = new Date().toISOString();
    }
    if (changed) await saveMonitors(monitors);
  });
}
