import { escapeHtml as e } from './export.mjs';
import { defaultBranding } from './branding.mjs';

const statuses = {
  improved: 'Cải thiện',
  regressed: 'Giảm điểm',
  unchanged: 'Không đổi',
  unverified: 'Chưa đủ dữ liệu',
  added: 'Website mới',
  removed: 'Không còn trong lần sau',
};
const changes = {
  new: 'Lỗi mới',
  persistent: 'Còn tồn tại',
  resolved: 'Đã sửa',
  unverified: 'Chưa xác minh',
};
const states = {
  fail: 'Lỗi',
  warn: 'Cảnh báo',
  pass: 'Đạt',
  unknown: 'Chưa xác minh',
  unmeasured: 'Chưa đo',
};
const date = (value) =>
  value
    ? new Intl.DateTimeFormat('vi-VN', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Asia/Bangkok',
      }).format(new Date(value))
    : 'Chưa có phép đo';
const delta = (value) => (value == null ? '—' : `${value > 0 ? '+' : ''}${value}`);
const cell = (value) => {
  const text = String(value ?? '');
  return `"${(/^[\s\uFEFF]*[=+\-@]/.test(text) ? "'" + text : text).replace(/"/g, '""')}"`;
};

export function batchComparisonCsv(comparison, branding = defaultBranding) {
  const rows = [
    [
      'Loại',
      'Khách hàng',
      'Dự án',
      'Website',
      'Trạng thái',
      'Điểm lần trước',
      'Điểm lần sau',
      'Chênh lệch',
      'So sánh điểm',
      'Lỗi mới',
      'Còn tồn tại',
      'Đã sửa',
      'Chưa xác minh',
      'Lần đo trước',
      'Lần đo sau',
      'Thương hiệu',
      'Kỳ xu hướng',
      'Loại kỳ',
      'Nguồn đo',
      'URL phát hiện',
      'Quy tắc',
      'Lý do',
    ],
  ];
  const identity = (kind, url, status) => [
    kind,
    comparison.client.name,
    comparison.project.name,
    url,
    status,
  ];
  for (const site of comparison.websites) {
    rows.push([
      ...identity('Website', site.url, statuses[site.status]),
      site.before.score,
      site.after.score,
      site.scoreDelta,
      site.scoreComparable ? 'Có' : 'Không',
      site.counts.new,
      site.counts.persistent,
      site.counts.resolved,
      site.counts.unverified,
      site.before.createdAt,
      site.after.createdAt,
      branding.agencyName,
      '',
      '',
      [site.before.source, site.after.source].filter(Boolean).join(' → '),
      '',
      '',
      site.scoreReason,
    ]);
    for (const bucket of Object.keys(changes)) {
      for (const finding of site.changes[bucket]) {
        rows.push([
          ...identity('Thay đổi', site.url, changes[bucket]),
          states[finding.before] || finding.before,
          states[finding.after] || finding.after,
          '',
          finding.title,
          bucket === 'new' ? 1 : 0,
          bucket === 'persistent' ? 1 : 0,
          bucket === 'resolved' ? 1 : 0,
          bucket === 'unverified' ? 1 : 0,
          site.before.createdAt,
          site.after.createdAt,
          branding.agencyName,
          '',
          '',
          '',
          finding.url,
          finding.rule,
          finding.reason,
        ]);
      }
    }
  }
  for (const interval of ['weekly', 'monthly']) {
    for (const series of comparison.trends[interval].series) {
      for (const point of series.points) {
        rows.push([
          ...identity('Xu hướng', series.url, point.score == null ? 'Chưa có điểm' : 'Có phép đo'),
          '',
          point.score,
          '',
          point.comparable ? 'Có' : 'Không',
          '',
          '',
          '',
          '',
          '',
          point.measuredAt,
          branding.agencyName,
          point.period,
          interval === 'weekly' ? 'Tuần' : 'Tháng',
          point.source,
          '',
          '',
          point.reason,
        ]);
      }
    }
  }
  return '\uFEFF' + rows.map((row) => row.map(cell).join(',')).join('\r\n');
}

function trendHtml(comparison, options) {
  const interval = options.interval === 'monthly' ? 'monthly' : 'weekly';
  const trend = comparison.trends[interval];
  const series = trend.series.find((item) => item.url === options.url) || trend.series[0];
  if (!series) return '';
  const x = (index) => 42 + (index * 626) / Math.max(1, trend.periods.length - 1);
  const y = (score) => 180 - score * 1.5;
  const grids = [0, 25, 50, 75, 100]
    .map(
      (score) =>
        `<line x1="42" x2="668" y1="${y(score)}" y2="${y(score)}" stroke="#dfe7da"/><text x="30" y="${y(score) + 4}" text-anchor="end">${score}</text>`,
    )
    .join('');
  const points = series.points
    .map((point, index) => {
      const previous = series.points[index - 1];
      const line =
        point.score != null && previous?.score != null && point.comparable
          ? `<line x1="${x(index - 1)}" y1="${y(previous.score)}" x2="${x(index)}" y2="${y(point.score)}" stroke="#36745a" stroke-width="2.5"/>`
          : '';
      const dot =
        point.score != null
          ? `<circle cx="${x(index)}" cy="${y(point.score)}" r="5" fill="#36745a" stroke="white" stroke-width="2"/><text x="${x(index)}" y="${y(point.score) - 11}" text-anchor="middle" font-weight="700">${point.score}</text>`
          : `<text x="${x(index)}" y="197" text-anchor="middle">—</text>`;
      const label = [0, 3, 6, 9, 11].includes(index)
        ? `<text x="${x(index)}" y="218" text-anchor="middle">${e(interval === 'weekly' ? trend.periods[index].label.slice(0, 5) : trend.periods[index].label)}</text>`
        : '';
      return line + dot + label;
    })
    .join('');
  return `<div class="chart-block"><h2>Xu hướng điểm theo ${interval === 'weekly' ? 'tuần' : 'tháng'}</h2><p><b>${e(series.url)}</b></p><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 225" role="img" aria-label="Điểm từng kỳ của website đã chọn">${grids}${points}</svg><p class="muted">12 kỳ đến lần sau đã chọn, từ tối đa 100 lần kiểm tra gần nhất. Mỗi kỳ lấy phép đo cuối cùng; chỉ nối các kỳ liền nhau có kết quả tương thích. Dấu — là chưa có điểm. Tuần bắt đầu thứ Hai, UTC+7.</p></div>
    <table class="trend"><thead><tr><th>${interval === 'weekly' ? 'Tuần từ' : 'Tháng'}</th><th>Điểm</th><th>Lần đo / nguồn</th><th>Ghi chú</th></tr></thead><tbody>${series.points.map((point, index) => `<tr><td>${e(trend.periods[index].label)}</td><td><b>${point.score ?? '—'}</b></td><td>${e(date(point.measuredAt))}<br>${e(point.source || '')}</td><td>${e(point.reason || (point.comparable ? 'Có thể đối chiếu kỳ liền trước.' : 'Mốc đo trong kỳ.'))}</td></tr>`).join('')}</tbody></table>`;
}

function measurement(label, item) {
  return `<p><b>${label}:</b> ${e(date(item.createdAt))}${item.source ? ` · ${e(item.source)} · ${item.device === 'mobile' ? 'Mobile' : 'Desktop'}` : ''}${item.scope ? ` · ${item.scope.scannedPages} trang / ${item.scope.checkedLinks} liên kết` : ''}${item.error ? ` · ${e(item.error)}` : ''}</p>`;
}

export function batchComparisonHtml(comparison, branding = defaultBranding, options = {}) {
  const brand = { ...defaultBranding, ...branding };
  const accent = /^#[0-9a-f]{6}$/i.test(brand.accentColor)
    ? brand.accentColor
    : defaultBranding.accentColor;
  const logo =
    typeof brand.logoDataUrl === 'string' &&
    /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(brand.logoDataUrl)
      ? `<img src="${e(brand.logoDataUrl)}" alt=""/>`
      : '';
  const websites = comparison.websites
    .map((site) => {
      const findings = Object.keys(changes)
        .flatMap((bucket) =>
          site.changes[bucket].map(
            (finding) =>
              `<article class="finding"><span class="tag">${changes[bucket]}</span><h4>${e(finding.title)}</h4><p class="muted">${e(finding.url)} · ${e(finding.rule)}</p><p>${e(states[finding.before] || finding.before)} → ${e(states[finding.after] || finding.after)} · ${e(finding.reason)}</p>${[
                ['Bằng chứng trước', finding.evidenceBefore],
                ['Bằng chứng sau', finding.evidenceAfter],
              ]
                .filter(([, items]) => items?.length)
                .map(
                  ([label, items]) =>
                    `<div class="evidence"><b>${label}:</b><br>${items.map(e).join('<br>')}</div>`,
                )
                .join('')}</article>`,
          ),
        )
        .join('');
      return `<section class="site"><div class="site-summary"><div class="site-head"><div><h3>${e(site.url)}</h3><span class="tag">${e(statuses[site.status])}</span></div><span class="delta ${site.scoreDelta < 0 ? 'down' : ''}">${e(delta(site.scoreDelta))}</span></div><p>${site.before.score ?? '—'} → ${site.after.score ?? '—'} điểm · ${site.scoreComparable ? 'Có thể so sánh' : e(site.scoreReason || 'Chưa đủ dữ liệu')}</p><div class="muted">${measurement('Lần trước', site.before)}${measurement('Lần sau', site.after)}</div><p>${site.counts.new} lỗi mới · ${site.counts.persistent} còn tồn tại · ${site.counts.resolved} đã sửa · ${site.counts.unverified} chưa xác minh</p></div>${findings}</section>`;
    })
    .join('');
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'none'"><title>${e(brand.agencyName)} - So sánh ${e(comparison.project.name)}</title><style>
    *{box-sizing:border-box}body{margin:0;color:#25362e;background:#fff;font:12px/1.7 'Segoe UI',Arial,sans-serif;overflow-wrap:anywhere}main{max-width:960px;margin:auto;padding:32px}header{border-bottom:3px solid ${accent};padding-bottom:22px}.identity{display:flex;gap:12px;align-items:center}.identity>div{min-width:0}.identity img{max-width:130px;height:44px;object-fit:contain}.identity strong{font-size:15px}.muted,small{color:#58665e}h1{font-size:29px;line-height:1.3;margin:20px 0 10px}h2{font-size:19px;margin:27px 0 12px;break-after:avoid}h3{font-size:14px;margin:4px 0}h4{font-size:12px;margin:5px 0;break-after:avoid}p{margin:6px 0}.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:22px 0}.metrics>div,.site-summary{border:1px solid #dce5dd;border-radius:8px;padding:14px;break-inside:avoid}.metrics strong{display:block;font-size:25px}.note{border-left:3px solid ${accent};padding:12px 15px;background:#f3f6f1}.site{margin:22px 0}.site-head{display:flex;justify-content:space-between;gap:15px}.site-head>div{min-width:0}.delta{font-weight:700;font-size:24px;color:#28664f;white-space:nowrap}.down{color:#9c4e2f}.tag{display:inline-block;padding:2px 8px;background:#f6f1e5;color:#77521f;font-size:10px;border-radius:5px}.finding{margin:10px 0;padding:12px 14px;border:1px solid #e2e9df;border-radius:6px;break-inside:avoid}.evidence{background:#f6f8f3;padding:8px 10px;margin:7px 0;font-size:10px}.trend{border-collapse:collapse;width:100%;font-size:11px;table-layout:fixed}.trend th,.trend td{text-align:left;padding:8px;border-bottom:1px solid #e2e9df;vertical-align:top}.trend th{color:#4f6542;font-size:10px}.trend th:nth-child(1){width:17%}.trend th:nth-child(2){width:9%}.trend th:nth-child(3){width:32%}thead{display:table-header-group}tr{break-inside:avoid}.chart-block{break-inside:avoid;margin:25px 0 14px}.chart-block svg{display:block;width:100%;height:auto;max-height:230px;margin:10px 0;font:11px 'Segoe UI',Arial,sans-serif;fill:#536448}footer{border-top:1px solid #dce5dd;margin-top:25px;padding-top:12px;color:#58665e;font-size:10px}@media screen and (max-width:560px){main{padding:22px 18px}.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}h1{font-size:24px}}@media print{main{padding:0;max-width:none}}
    </style></head><body><main><header><div class="identity">${logo}<div><strong>${e(brand.agencyName)}</strong><div class="muted">${e(brand.tagline)}</div></div></div><h1>So sánh các lần kiểm tra dự án</h1><p><b>${e(comparison.project.name)}</b> · Khách hàng: ${e(comparison.client.name)}</p><p class="muted">Lần trước: ${e(date(comparison.before.createdAt))} · Lần sau: ${e(date(comparison.after.createdAt))}</p></header>
    <div class="metrics"><div><strong>${comparison.totals.improved}</strong>website cải thiện</div><div><strong>${comparison.totals.regressed}</strong>website giảm điểm</div><div><strong>${comparison.totals.resolvedIssues}</strong>lỗi đã sửa</div><div><strong>${comparison.totals.newIssues}</strong>lỗi mới</div></div>
    <div class="note"><p>${comparison.totals.websites} website · ${comparison.totals.unchanged} không đổi điểm · ${comparison.totals.unverified} chưa đủ dữ liệu · ${comparison.totals.added} mới · ${comparison.totals.removed} không còn trong lần sau.</p><p>${comparison.totals.persistentIssues} vấn đề còn tồn tại · ${comparison.totals.unverifiedIssues} chưa xác minh. Chỉ ghi đã sửa khi URL và quy tắc được kiểm tra lại và đạt.</p>${comparison.warnings.map((warning) => `<p>${e(warning)}</p>`).join('')}</div>
    ${trendHtml(comparison, options)}<h2>Đối chiếu từng website</h2>${websites || '<p>Chưa có website để đối chiếu.</p>'}
    <footer><p>${e(brand.footer)}</p><p>Xuất trên máy chạy ứng dụng · Lần trước ${e(comparison.before.id)} · Lần sau ${e(comparison.after.id)}</p></footer></main></body></html>`;
}
