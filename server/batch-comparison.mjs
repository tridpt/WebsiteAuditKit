import { AuditError } from './network.mjs';
import { readReport, validId } from './store.mjs';
import { getWorkspace } from './workspace.mjs';
import { compareReports } from './comparison.mjs';

const terminal = new Set(['completed', 'partial', 'cancelled', 'interrupted']);
const emptyChanges = () => ({ new: [], persistent: [], resolved: [], unverified: [] });
const canonical = (value) => {
  const url = new URL(value);
  url.hash = '';
  return url.href;
};
const batchInfo = ({ id, createdAt, finishedAt, status, device, maxPages }) => ({
  id,
  createdAt,
  finishedAt,
  status,
  device,
  maxPages,
});

function snapshot(item, report) {
  return {
    reportId: report?.id || null,
    status: item?.status || 'missing',
    score: report?.score ?? null,
    createdAt: report?.createdAt || null,
    device: report?.device || null,
    source: report
      ? report.lighthouse?.available
        ? `Lighthouse ${report.lighthouse.version || ''}`.trim()
        : 'Website Audit Kit'
      : null,
    scope: report?.scope || null,
    reportMissing: item?.status === 'completed' && !report,
    error: item?.error || null,
  };
}

function unavailableReason(beforeItem, afterItem, before, after) {
  if (!beforeItem) return 'URL này chưa nằm trong lần trước; chưa có mốc để đối chiếu.';
  if (!afterItem) return 'URL này không nằm trong lần sau; chưa chứng minh vấn đề đã được sửa.';
  if (!before)
    return beforeItem.status === 'completed'
      ? 'Báo cáo lần trước đã xóa hoặc gỡ khỏi dự án.'
      : 'Lần trước chưa kiểm tra thành công URL này.';
  if (!after)
    return afterItem.status === 'completed'
      ? 'Báo cáo lần sau đã xóa hoặc gỡ khỏi dự án.'
      : 'Lần sau chưa kiểm tra thành công URL này.';
  if (before.id === after.id) return 'Lần sau giữ lại cùng báo cáo; chưa có phép đo mới.';
  if (after.createdAt <= before.createdAt)
    return 'Lần sau không có mốc đo mới hơn lần trước; chưa có phép đo mới để đối chiếu.';
  return null;
}

// Keep known problems visible when a URL was not measured again. A missing
// report, changed project membership or retry is never evidence of a fix.
function unverifiedChanges(before, after, reason) {
  const findings = (report) =>
    report
      ? new Map(
          Object.values(compareReports(report, report).changes)
            .flat()
            .map((finding) => [finding.id, finding]),
        )
      : new Map();
  const old = findings(before),
    next = findings(after);
  const changes = emptyChanges();
  changes.unverified = [...new Set([...old.keys(), ...next.keys()])].map((id) => {
    const a = old.get(id),
      b = next.get(id);
    return {
      ...(b || a),
      before: a?.before || (before ? 'unknown' : 'unmeasured'),
      after: b?.after || (after ? 'unknown' : 'unmeasured'),
      evidenceBefore: a?.evidenceBefore || [],
      evidenceAfter: b?.evidenceAfter || [],
      reason,
    };
  });
  return changes;
}

const dayParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Bangkok',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
function periodKey(value, interval) {
  const parts = Object.fromEntries(
    dayParts.formatToParts(new Date(value)).map(({ type, value }) => [type, value]),
  );
  const day = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
  if (interval === 'monthly') return `${parts.year}-${parts.month}`;
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return day.toISOString().slice(0, 10);
}
function periodsUntil(end, interval) {
  const key = periodKey(end, interval);
  const last = new Date(`${key}${interval === 'monthly' ? '-01' : ''}T00:00:00Z`);
  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(last);
    if (interval === 'monthly') date.setUTCMonth(date.getUTCMonth() - (11 - index));
    else date.setUTCDate(date.getUTCDate() - 7 * (11 - index));
    const iso = date.toISOString().slice(0, interval === 'monthly' ? 7 : 10);
    const label =
      interval === 'monthly'
        ? `${iso.slice(5, 7)}/${iso.slice(0, 4)}`
        : `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
    return { key: iso, label };
  });
}

async function buildTrends(history, afterBatch, reportFor, urls) {
  const runs = history
    .filter(
      (batch) =>
        batch.projectId === afterBatch.projectId &&
        terminal.has(batch.status) &&
        batch.createdAt <= afterBatch.createdAt,
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(-100);
  const events = new Map(urls.map((url) => [url, []]));
  for (const batch of runs) {
    await Promise.all(
      urls.map(async (url) => {
        const item = batch.items.find((item) => canonical(item.url) === url);
        const report = await reportFor(item);
        const list = events.get(url);
        if (report && list.some((event) => event.report?.id === report.id)) return;
        list.push({
          batchId: batch.id,
          report,
          at: report?.createdAt || batch.finishedAt || batch.createdAt,
          reason: !item
            ? 'URL không nằm trong lần kiểm tra này.'
            : item.status === 'completed'
              ? 'Báo cáo đã xóa hoặc gỡ khỏi dự án.'
              : 'Lượt kiểm tra không có kết quả.',
        });
      }),
    );
  }
  const trends = {};
  for (const interval of ['weekly', 'monthly']) {
    const periods = periodsUntil(afterBatch.finishedAt || afterBatch.createdAt, interval);
    trends[interval] = {
      periods,
      series: urls.map((url) => {
        const byPeriod = new Map();
        for (const event of events.get(url).sort((a, b) => a.at.localeCompare(b.at)))
          byPeriod.set(periodKey(event.at, interval), event);
        let previous = null;
        const points = periods.map((period) => {
          const event = byPeriod.get(period.key);
          const report = event?.report;
          const scoreChange =
            previous && report && report.id !== previous.id
              ? compareReports(previous, report).scoreChanges.find(
                  (change) => change.id === 'total',
                )
              : null;
          const point = {
            period: period.key,
            batchId: event?.batchId || null,
            reportId: report?.id || null,
            measuredAt: report?.createdAt || null,
            score: report?.score ?? null,
            comparable: Boolean(scoreChange?.comparable),
            reason: !report
              ? event?.reason || 'Chưa có lần đo trong kỳ.'
              : scoreChange?.reason || null,
            source: snapshot(null, report).source,
          };
          previous = report || null;
          return point;
        });
        return { url, points };
      }),
    };
  }
  return trends;
}

export async function compareBatchRuns(beforeBatch, afterBatch, history = []) {
  if (!beforeBatch || !afterBatch || beforeBatch.projectId !== afterBatch.projectId)
    throw new AuditError('Chọn hai lần kiểm tra trong cùng một dự án.', 'INVALID_BATCH');
  if (beforeBatch.id === afterBatch.id)
    throw new AuditError('Chọn hai lần kiểm tra khác nhau.', 'INVALID_BATCH');
  if (!terminal.has(beforeBatch.status) || !terminal.has(afterBatch.status))
    throw new AuditError('Chờ hai lần kiểm tra hoàn tất hoặc hủy trước khi so sánh.', 'BUSY');
  if (beforeBatch.createdAt >= afterBatch.createdAt)
    throw new AuditError('Chọn lần trước cũ hơn lần sau.', 'INVALID_BATCH');
  const state = await getWorkspace();
  const project = state.projects.find((item) => item.id === beforeBatch.projectId);
  const client = state.clients.find((item) => item.id === project?.clientId);
  if (!project || !client) throw new AuditError('Không tìm thấy dự án.', 'NOT_FOUND');
  const cache = new Map();
  const reportFor = async (item) => {
    if (
      item?.status !== 'completed' ||
      !validId(item.reportId) ||
      state.reports[item.reportId] !== project.id
    )
      return null;
    if (!cache.has(item.reportId)) cache.set(item.reportId, readReport(item.reportId));
    return cache.get(item.reportId);
  };
  const beforeItems = new Map(beforeBatch.items.map((item) => [canonical(item.url), item]));
  const afterItems = new Map(afterBatch.items.map((item) => [canonical(item.url), item]));
  const urls = [...new Set([...beforeItems.keys(), ...afterItems.keys()])].sort();
  const websites = await Promise.all(
    urls.map(async (url) => {
      const beforeItem = beforeItems.get(url),
        afterItem = afterItems.get(url);
      const [before, after] = await Promise.all([reportFor(beforeItem), reportFor(afterItem)]);
      const reason = unavailableReason(beforeItem, afterItem, before, after);
      const comparison = reason ? null : compareReports(before, after);
      const score = comparison?.scoreChanges.find((change) => change.id === 'total');
      const changes = comparison?.changes || unverifiedChanges(before, after, reason);
      const counts =
        comparison?.counts ||
        Object.fromEntries(Object.entries(changes).map(([key, items]) => [key, items.length]));
      const status = !beforeItem
        ? 'added'
        : !afterItem
          ? 'removed'
          : !score?.comparable
            ? 'unverified'
            : score.delta > 0
              ? 'improved'
              : score.delta < 0
                ? 'regressed'
                : 'unchanged';
      return {
        url,
        before: snapshot(beforeItem, before),
        after: snapshot(afterItem, after),
        status,
        scoreDelta: score?.delta ?? null,
        scoreComparable: Boolean(score?.comparable),
        scoreReason: reason || score?.reason || null,
        counts,
        warnings: comparison?.warnings || [],
        changes,
        scoreChanges: comparison?.scoreChanges || [],
      };
    }),
  );
  const warnings = new Set();
  if (beforeBatch.device !== afterBatch.device)
    warnings.add('Hai lần kiểm tra dùng thiết bị khác nhau; không tính chênh lệch tổng điểm.');
  if (beforeBatch.maxPages !== afterBatch.maxPages)
    warnings.add('Giới hạn số trang khác nhau; chỉ đối chiếu các URL đã được kiểm tra lại.');
  if (beforeBatch.status !== 'completed' || afterBatch.status !== 'completed')
    warnings.add(
      'Một hoặc cả hai lần kiểm tra chưa hoàn tất toàn bộ website. Website thiếu kết quả không được coi là đã sửa.',
    );
  if (websites.some((site) => site.before.reportMissing || site.after.reportMissing))
    warnings.add('Có báo cáo đã xóa hoặc gỡ khỏi dự án; dữ liệu đó không được dùng để đối chiếu.');
  if (
    websites.some(
      (site) =>
        site.before.reportId &&
        site.after.reportId &&
        site.before.createdAt >= site.after.createdAt,
    )
  )
    warnings.add('Có website giữ lại kết quả cũ. Để xác minh thay đổi, cần một lượt đo mới.');
  websites.forEach((site) => site.warnings.forEach((warning) => warnings.add(warning)));
  return {
    before: batchInfo(beforeBatch),
    after: batchInfo(afterBatch),
    project: { id: project.id, name: project.name },
    client: { id: client.id, name: client.name },
    warnings: [...warnings],
    websites,
    trends: await buildTrends(
      history.length ? history : [beforeBatch, afterBatch],
      afterBatch,
      reportFor,
      urls,
    ),
    totals: {
      websites: websites.length,
      common: websites.filter((site) => beforeItems.has(site.url) && afterItems.has(site.url))
        .length,
      ...Object.fromEntries(
        ['improved', 'regressed', 'unchanged', 'unverified', 'added', 'removed'].map((status) => [
          status,
          websites.filter((site) => site.status === status).length,
        ]),
      ),
      newIssues: websites.reduce((sum, site) => sum + site.counts.new, 0),
      persistentIssues: websites.reduce((sum, site) => sum + site.counts.persistent, 0),
      resolvedIssues: websites.reduce((sum, site) => sum + site.counts.resolved, 0),
      unverifiedIssues: websites.reduce((sum, site) => sum + site.counts.unverified, 0),
    },
  };
}
