const pageRules = new Set([
  'title',
  'description',
  'h1',
  'alt',
  'canonical',
  'language',
  'indexable',
  'social',
  'duplicate-titles',
  'image-dimensions',
]);
const browserRules = new Set([
  'fcp',
  'lcp',
  'cls',
  'resources',
  'overflow',
  'small-text',
  'tap-targets',
]);
const names = {
  total: 'Tổng điểm',
  performance: 'Tốc độ',
  mobile: 'Mobile',
  links: 'Liên kết',
  seo: 'SEO',
};
const isIssue = (state) => ['fail', 'warn'].includes(state);
const key = (rule, url) => `${rule}\n${url}`;
const canonical = (value) => {
  try {
    const u = new URL(value);
    u.hash = '';
    return u.href;
  } catch {
    return value;
  }
};
const sameSet = (a, b) => a.size === b.size && [...a].every((item) => b.has(item));
const urls = (items = []) => new Set(items.map((item) => canonical(item.url)));

function performanceMethod(report) {
  const lh = report.lighthouse;
  return lh?.available
    ? JSON.stringify([lh.method, lh.version, lh.device, lh.settings])
    : 'audit-kit-browser-v1';
}

function observations(report) {
  const result = new Map();
  const add = (check, url, state = check.status, extra = {}) => {
    const entry = {
      rule: check.id,
      url: canonical(url),
      title: check.title,
      category: check.category,
      severity: check.severity,
      state,
      evidence: check.evidence || [],
      ...extra,
    };
    result.set(key(entry.rule, entry.url), entry);
  };
  for (const check of report.checks) {
    if (['broken-links', 'unknown-links', 'redirects', 'link-scope'].includes(check.id)) continue;
    if (pageRules.has(check.id)) {
      if (check.status === 'info') continue;
      const affected = new Set(check.urls.map(canonical));
      for (const page of report.pages) {
        const issue = isIssue(check.status) && affected.has(canonical(page.url));
        add(check, page.url, issue ? check.status : 'pass', {
          evidence: issue ? check.evidence.filter((line) => line.includes(page.url)) : [],
          requiredUrls:
            check.id === 'duplicate-titles' && issue
              ? report.pages.filter((p) => p.title === page.title).map((p) => canonical(p.url))
              : [],
        });
      }
      continue;
    }
    if (check.id.startsWith('lh-')) continue;
    let url = report.url;
    if (check.id === 'robots' || check.id === 'sitemap')
      url =
        report[check.id]?.url ||
        check.evidence?.find((line) => /^https?:/.test(line)) ||
        report.url;
    // An absent robots.txt is explicitly informational, and can clear an old access warning.
    const state =
      check.id === 'robots' && report.robots?.status === 404
        ? 'pass'
        : check.status === 'info'
          ? 'unknown'
          : check.status;
    add(check, url, state, {
      device: browserRules.has(check.id)
        ? check.category === 'mobile'
          ? 'mobile'
          : report.device
        : null,
      method: ['fcp', 'lcp', 'cls'].includes(check.id) ? performanceMethod(report) : null,
    });
  }
  for (const link of report.links || []) {
    add(
      {
        id: 'link-health',
        title: 'Trạng thái liên kết',
        category: 'links',
        severity: 'high',
        evidence: [
          link.status ? `HTTP ${link.status}` : link.error || 'Chưa có phản hồi',
          `Nguồn: ${link.source}`,
        ],
      },
      link.url,
      link.state === 'broken' ? 'fail' : link.state === 'ok' ? 'pass' : 'unknown',
    );
    if ((report.checks || []).some((c) => c.id === 'redirects'))
      add(
        {
          id: 'redirects',
          title: 'Liên kết chuyển hướng',
          category: 'links',
          severity: 'low',
          evidence: link.finalUrl ? [`${link.url} → ${link.finalUrl}`] : [],
        },
        link.url,
        link.state === 'unknown' ? 'unknown' : link.redirects?.length ? 'warn' : 'pass',
      );
  }
  if (report.lighthouse?.available) {
    for (const audit of report.lighthouse.audits || []) {
      if (!audit.opportunity) continue;
      add(
        {
          id: `lh-${audit.id}`,
          title: audit.title,
          category: 'performance',
          severity: 'medium',
          evidence: [audit.displayValue, ...audit.resources.map((r) => r.url)].filter(Boolean),
        },
        report.url,
        audit.scoreDisplayMode === 'notApplicable'
          ? 'pass'
          : audit.error || audit.score === null
            ? 'unknown'
            : audit.score < 1
              ? 'warn'
              : 'pass',
        { device: report.device, method: performanceMethod(report) },
      );
    }
  }
  return result;
}

function incompatibility(before, after) {
  if (before.device !== after.device) return 'Thiết bị đo khác nhau.';
  if (before.method !== after.method) return 'Nguồn hoặc cấu hình đo khác nhau.';
  return null;
}

function scoreRules(report, category) {
  const categories = category === 'total' ? Object.keys(report.categories) : [category];
  return new Set(
    categories.flatMap((id) =>
      id === 'performance' && report.lighthouse?.available
        ? ['performance:lighthouse']
        : report.checks
            .filter((c) => c.category === id && c.status !== 'info' && c.weight > 0)
            .map((c) => `${id}:${c.id}:${c.weight}`),
    ),
  );
}

export function compareReports(first, second) {
  const [before, after] = [first, second].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const oldMap = observations(before);
  const newMap = observations(after);
  const changes = { new: [], persistent: [], resolved: [], unverified: [] };
  const oldPages = urls(before.pages),
    newPages = urls(after.pages);
  const oldLinks = urls(before.links),
    newLinks = urls(after.links);
  const samePages = sameSet(oldPages, newPages),
    sameLinks = sameSet(oldLinks, newLinks);
  const sameTarget = canonical(before.url) === canonical(after.url);
  const sameDevice = before.device === after.device;
  const sameMethod = performanceMethod(before) === performanceMethod(after);
  const warnings = [];
  if (!sameTarget || !sameDevice || !samePages || !sameLinks)
    warnings.push(
      'URL, thiết bị hoặc phạm vi kiểm tra khác nhau. Đối chiếu từng URL bên dưới; điểm chỉ có ý nghĩa tham khảo.',
    );
  if (!sameMethod)
    warnings.push(
      'Nguồn hoặc cấu hình đo hiệu năng khác nhau; không tính chênh lệch điểm tốc độ và tổng điểm.',
    );
  if (!samePages)
    warnings.push(
      'Danh sách trang đã quét khác nhau, dù số trang có thể bằng nhau. Trang chưa được quét lại không được coi là đã sửa.',
    );
  for (const id of new Set([...oldMap.keys(), ...newMap.keys()])) {
    const old = oldMap.get(id),
      next = newMap.get(id);
    if (![old, next].some((o) => o && (isIssue(o.state) || o.state === 'unknown'))) continue;
    if ((next || old).rule === 'redirects' && ![old, next].some((o) => o && isIssue(o.state)))
      continue;
    const current = next || old;
    let bucket, reason;
    if (!old || !next) {
      bucket = 'unverified';
      reason = !old
        ? 'Ghi nhận lần đầu; lần trước chưa kiểm tra URL hoặc quy tắc này.'
        : 'URL hoặc quy tắc này chưa được kiểm tra lại.';
    } else if (incompatibility(old, next)) {
      bucket = 'unverified';
      reason = incompatibility(old, next);
    } else if (old.state === 'unknown' || next.state === 'unknown') {
      bucket = 'unverified';
      reason = 'Có lần đo chưa xác minh được kết quả; cần kiểm tra lại.';
    } else if (isIssue(old.state) && !isIssue(next.state)) {
      const missing = (old.requiredUrls || []).some((url) => !newPages.has(url));
      bucket = missing ? 'unverified' : 'resolved';
      reason = missing
        ? 'Chưa quét lại đủ các trang từng có tiêu đề trùng.'
        : 'Cùng quy tắc trên URL này đã đạt trong lần kiểm tra mới.';
    } else if (!isIssue(old.state) && isIssue(next.state)) {
      const missing = (next.requiredUrls || []).some((url) => !oldPages.has(url));
      bucket = missing ? 'unverified' : 'new';
      reason = missing
        ? 'Lần trước chưa quét đủ các trang đang có tiêu đề trùng.'
        : 'Lần trước đã đạt; lần mới phát hiện vấn đề trên cùng URL.';
    } else {
      bucket = 'persistent';
      reason = 'Vấn đề vẫn được ghi nhận trong cả hai lần kiểm tra.';
    }
    changes[bucket].push({
      id,
      rule: current.rule,
      url: current.url,
      title: current.title,
      category: current.category,
      severity: current.severity,
      before: old?.state || 'unmeasured',
      after: next?.state || 'unmeasured',
      evidenceBefore: old?.evidence || [],
      evidenceAfter: next?.evidence || [],
      reason,
    });
  }
  const scoreChanges = Object.entries(names).map(([id, label]) => {
    const a = id === 'total' ? before.score : before.categories[id]?.score;
    const b = id === 'total' ? after.score : after.categories[id]?.score;
    const methodChanged = ['total', 'performance'].includes(id) && !sameMethod;
    const scopeChanged =
      !sameTarget ||
      (id === 'seo' && !samePages) ||
      (id === 'links' && !sameLinks) ||
      (id === 'performance' && !after.lighthouse?.available && !samePages) ||
      (id === 'performance' && !sameDevice) ||
      (id === 'total' && (!samePages || !sameLinks || !sameDevice));
    const rulesChanged = !sameSet(scoreRules(before, id), scoreRules(after, id));
    const comparable = a != null && b != null && !methodChanged && !scopeChanged && !rulesChanged;
    return {
      id,
      label,
      before: a ?? null,
      after: b ?? null,
      comparable,
      delta: comparable ? b - a : null,
      reason: comparable
        ? null
        : methodChanged
          ? 'Khác nguồn/cấu hình đo'
          : scopeChanged
            ? 'Khác phạm vi/thiết bị'
            : 'Thiếu dữ liệu hoặc khác bộ kiểm tra',
    };
  });
  const summary = (r) => ({
    id: r.id,
    title: r.title,
    url: r.url,
    createdAt: r.createdAt,
    device: r.device,
    scope: r.scope,
  });
  return {
    before: summary(before),
    after: summary(after),
    warnings,
    scoreChanges,
    changes,
    counts: Object.fromEntries(
      Object.entries(changes).map(([name, items]) => [name, items.length]),
    ),
    coverage: {
      commonPages: [...oldPages].filter((u) => newPages.has(u)).length,
      commonLinks: [...oldLinks].filter((u) => newLinks.has(u)).length,
    },
  };
}
