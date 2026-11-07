export const escapeHtml = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );

const names = { performance: 'Tốc độ', mobile: 'Mobile', links: 'Liên kết', seo: 'SEO' };
const levels = { high: 'Cao', medium: 'Vừa', low: 'Thấp' };
const fallbackBranding = {
  agencyName: 'Website Audit Kit',
  tagline: 'Hiểu website. Cải thiện mỗi ngày.',
  footer: 'Báo cáo được tạo bằng Website Audit Kit.',
  accentColor: '#28664f',
  logoDataUrl: null,
};

function brandingValues(branding = {}) {
  const merged = { ...fallbackBranding, ...branding };
  return {
    agencyName: String(merged.agencyName || fallbackBranding.agencyName),
    tagline: String(merged.tagline || ''),
    footer: String(merged.footer || ''),
    accentColor: /^#[0-9a-f]{6}$/i.test(merged.accentColor)
      ? merged.accentColor
      : fallbackBranding.accentColor,
    logoDataUrl:
      typeof merged.logoDataUrl === 'string' &&
      /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(merged.logoDataUrl)
        ? merged.logoDataUrl
        : null,
  };
}

export function exportCsv(report, branding, context = null) {
  const brand = brandingValues(branding);
  const cell = (value) => {
    let text = String(value ?? '');
    if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  return (
    '\uFEFF' +
    [
      [
        'Hạng mục',
        'Mức ưu tiên',
        'Việc cần sửa',
        'Hướng khắc phục',
        'Bằng chứng',
        'URL',
        'Ước lượng',
        'Đã hoàn thành',
        'Đơn vị xuất báo cáo',
        'Khẩu hiệu',
        'Chân trang',
        'Khách hàng',
        'Dự án',
        'Người phụ trách',
        'Hạn sửa',
        'Trạng thái công việc',
      ],
      ...report.checks
        .filter((c) => ['warn', 'fail'].includes(c.status))
        .map((c) => [
          names[c.category],
          levels[c.severity],
          c.title,
          c.recommendation,
          c.evidence.join('\n'),
          c.urls.join('\n'),
          c.effort,
          c.done ? 'Có' : 'Chưa',
          brand.agencyName,
          brand.tagline,
          brand.footer,
          context?.client?.name || '',
          context?.project?.name || '',
          c.assignee || '',
          c.dueDate || '',
          c.done ? 'Đã xong' : c.workflow === 'doing' ? 'Đang làm' : 'Chưa làm',
        ]),
    ]
      .map((row) => row.map(cell).join(','))
      .join('\r\n')
  );
}

export function reportHtml(report, branding, context = null) {
  const e = escapeHtml;
  const brand = brandingValues(branding);
  const issues = report.checks
    .filter((c) => ['warn', 'fail'].includes(c.status))
    .sort(
      (a, b) =>
        ['high', 'medium', 'low'].indexOf(a.severity) -
        ['high', 'medium', 'low'].indexOf(b.severity),
    );
  const date = new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Bangkok',
  }).format(new Date(report.createdAt));
  const lh = report.lighthouse;
  const lighthouseHtml = lh?.available
    ? `<h2>Hiệu năng Lighthouse ${e(lh.version)}</h2>
    <div class="note"><p><b>${e(lh.score)}/100 · ${e(lh.device)}</b> · Throttling mô phỏng · Đo cục bộ qua cầu nối HTTP.</p>
    <p>${Object.entries(lh.metrics)
      .map(
        ([name, value]) =>
          `${e(name.toUpperCase())}: ${value == null ? '—' : e(name === 'cls' ? Number(value).toFixed(3) : Math.round(value) + ' ms')}`,
      )
      .join(' · ')}</p>
    <p>Không phải dữ liệu CrUX hoặc INP thực tế. TTFB trong danh sách kiểm tra là phép đo HTTP riêng.</p></div>
    <h3>Cơ hội tối ưu</h3><p class="muted">Ước lượng có thể trùng nhau, không cộng dồn thời gian tiết kiệm.</p>
    ${lh.opportunities.length ? lh.opportunities.map((a) => `<article><h3>${e(a.title)}</h3><p>${e(a.displayValue)}</p><p>${e(a.description.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'))}</p>${a.resources.length ? `<div class="evidence">${a.resources.map((r) => e(r.url)).join('<br>')}</div>` : ''}</article>`).join('') : '<p>Không có cơ hội tiết kiệm được Lighthouse định lượng trong lần đo này.</p>'}`
    : `<p class="note">${lh?.error ? `Chưa đo được Lighthouse: ${e(lh.error)}` : 'Báo cáo này chưa có dữ liệu Lighthouse.'} Điểm Tốc độ dùng các kiểm tra Website Audit Kit.</p>`;
  const logo = brand.logoDataUrl
    ? `<img class="brand-logo" src="${e(brand.logoDataUrl)}" alt="" />`
    : '';
  const contextLine = context
    ? `<p class="muted">Khách hàng: ${e(context.client.name)} · Dự án: ${e(context.project.name)}</p>`
    : '';
  const styles = `*{box-sizing:border-box}
    body{font-family:'Segoe UI',Arial,sans-serif;color:#25362e;background:#fff;margin:0;line-height:1.65;font-size:12px;overflow-wrap:anywhere}
    main{max-width:960px;padding:32px;margin:auto}
    header{border-bottom:3px solid var(--accent);padding-bottom:22px;margin-bottom:24px}
    .brand-line{display:flex;align-items:center;gap:10px}.brand-line>div{min-width:0}
    .brand-logo{width:auto;max-width:130px;height:44px;border-radius:7px;object-fit:contain;flex-shrink:0}
    .brand{font-weight:700;letter-spacing:.5px;font-size:14px}.tagline{color:#606d65;font-size:11px;margin-top:2px}
    h1{font-size:30px;margin:14px 0 3px;line-height:1.3}h2{font-size:20px;margin:26px 0 12px}p{margin:6px 0}.muted{color:#606d65}
    .score{font-size:34px;font-weight:700}.categories{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:20px 0}
    .category{border:1px solid #dce5dd;border-radius:10px;padding:12px}.category strong{display:block;font-size:25px}.category small{font-size:12px}
    article{border:1px solid #dce5dd;border-radius:8px;padding:15px;margin:12px 0;break-inside:avoid}h3{font-size:15px;margin:5px 0}
    .tag{font-size:10px;color:#925021;background:#fff1df;padding:3px 8px;border-radius:8px}
    .evidence{background:#f6f7f4;padding:10px;border-radius:5px;font-family:Consolas,monospace;font-size:10px;overflow-wrap:anywhere}
    .note{background:#f3f6f1;padding:15px;border-left:3px solid var(--accent);break-inside:avoid}
    footer{border-top:1px solid #dce5dd;margin-top:25px;padding-top:12px;color:#606d65}ul{padding-left:20px}
    @media screen and (max-width:560px){main{padding:22px 18px}.categories{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}h1{font-size:25px}}
    @media print{main{padding:0;max-width:none}h2{break-after:avoid}.category{break-inside:avoid}}`;
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'none'"><title>${e(brand.agencyName)} — Báo cáo — ${e(report.title)}</title><style>${styles}</style></head><body><main style="--accent:${e(brand.accentColor)}"><header><div class="brand-line">${logo}<div><div class="brand">${e(brand.agencyName)}</div>${brand.tagline ? `<div class="tagline">${e(brand.tagline)}</div>` : ''}</div></div><h1>Báo cáo sức khỏe website</h1><p>${e(report.url)}</p>${contextLine}<p class="muted">${e(date)} · ${report.device === 'mobile' ? 'Mobile' : 'Desktop'} · ${report.scope.scannedPages} trang · ${report.scope.checkedLinks} liên kết</p></header>
  <p><span class="score">${report.score ?? '—'}</span> / 100 điểm</p><div class="categories">${Object.values(
    report.categories,
  )
    .map(
      (c) =>
        `<div class="category">${e(c.name)}<strong>${c.score ?? '—'}<small> / 100</small></strong>${c.source === 'Lighthouse' ? 'Lighthouse' : `${c.passed}/${c.total} kiểm tra đạt`}</div>`,
    )
    .join('')}</div>
  ${lighthouseHtml}
  <h2>${issues.length} việc cần cải thiện</h2><p class="muted">${issues.filter((c) => c.done).length} việc đã được đánh dấu hoàn thành. Điểm chỉ cập nhật khi kiểm tra lại website.</p>
  ${issues.length ? issues.map((c, i) => `<article><span class="tag">Ưu tiên ${levels[c.severity].toLowerCase()} · ${names[c.category]} · ${e(c.effort)}</span><h3>${i + 1}. ${e(c.title)} ${c.done ? '✓' : ''}</h3>${c.assignee || c.dueDate || c.workflow ? `<p class="muted">Người phụ trách: ${e(c.assignee || 'Chưa gán')} · Hạn sửa: ${e(c.dueDate || 'Chưa đặt')} · ${c.done ? 'Đã xong' : c.workflow === 'doing' ? 'Đang làm' : 'Chưa làm'}</p>` : ''}<p>${e(c.description)}</p><p><b>Cách sửa:</b> ${e(c.recommendation)}</p>${c.evidence.length ? `<div class="evidence">${c.evidence.map(e).join('<br>')}</div>` : ''}${c.urls.length ? `<p class="muted">Trang liên quan: ${c.urls.map(e).join(', ')}</p>` : ''}</article>`).join('') : '<p>Không phát hiện việc cần sửa trong các kiểm tra đã thực hiện.</p>'}
  <h2>Các kiểm tra đã đạt</h2><ul>${report.checks
    .filter((c) => c.status === 'pass')
    .map((c) => `<li>${e(c.title)} — ${e(c.description)}</li>`)
    .join('')}</ul>
  <h2>Phạm vi & phương pháp</h2><div class="note"><p>${e(report.methodology)}</p><p>Đọc ${report.scope.scannedPages}/${report.scope.requestedPages} trang tối đa. Phát hiện ${report.scope.discoveredLinks} liên kết, kiểm tra ${report.scope.checkedLinks}, chưa thử ${report.scope.skippedLinks}. Mobile: ${report.scope.mobilePages} trang.</p>${report.warnings.map((w) => `<p>• ${e(w)}</p>`).join('')}</div>
  <footer>${brand.footer ? `<p>${e(brand.footer)}</p>` : ''}<p>Báo cáo tạo trên máy chạy ứng dụng · ${e(report.id)}</p></footer></main></body></html>`;
}
