import { escapeHtml as e } from './export.mjs';
import { defaultBranding } from './branding.mjs';
import { batchLabels } from './batch.mjs';

const levels = { high: 'Cao', medium: 'Vừa', low: 'Thấp' };
const names = { performance: 'Tốc độ', mobile: 'Mobile', links: 'Liên kết', seo: 'SEO' };
const date = (value) =>
  value
    ? new Intl.DateTimeFormat('vi-VN', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Asia/Bangkok',
      }).format(new Date(value))
    : 'Chưa có';
const workflow = (check) =>
  check.done ? 'Đã xong' : check.workflow === 'doing' ? 'Đang làm' : 'Chưa làm';
const status = (site) =>
  site.reportMissing ? 'Báo cáo đã xóa hoặc gỡ khỏi dự án' : batchLabels[site.status];
export function batchCsv(summary, branding = defaultBranding) {
  const rows = [
    [
      'Loại',
      'Khách hàng',
      'Dự án',
      'Website',
      'Trạng thái',
      'Điểm',
      'Tốc độ',
      'Mobile',
      'Liên kết',
      'SEO',
      'Ưu tiên',
      'Công việc',
      'Cách sửa',
      'Người phụ trách',
      'Hạn sửa',
      'Trạng thái việc',
      'Lần đo',
      'Nguồn tốc độ',
      'Thương hiệu',
    ],
  ];
  for (const site of summary.websites) {
    rows.push([
      'Website',
      summary.client.name,
      summary.project.name,
      site.url,
      status(site),
      site.score ?? '',
      ...Object.keys(names).map((key) => site.categories?.[key]?.score ?? ''),
      '',
      site.error || '',
      '',
      '',
      '',
      '',
      site.createdAt || '',
      site.categories?.performance?.source || (site.reportId ? 'Website Audit Kit' : ''),
      branding.agencyName,
    ]);
  }
  for (const { url, check } of summary.tasks) {
    rows.push([
      'Công việc',
      summary.client.name,
      summary.project.name,
      url,
      check.status,
      '',
      '',
      '',
      '',
      '',
      levels[check.severity],
      check.title,
      check.recommendation,
      check.assignee || '',
      check.dueDate || '',
      workflow(check),
      '',
      '',
      branding.agencyName,
    ]);
  }
  return (
    '\uFEFF' +
    rows
      .map((row) =>
        row
          .map((cell) => {
            const text = String(cell ?? '');
            return `"${(/^[\s\uFEFF]*[=+\-@]/.test(text) ? "'" + text : text).replace(/"/g, '""')}"`;
          })
          .join(','),
      )
      .join('\r\n')
  );
}

export function batchHtml(summary, branding = defaultBranding) {
  const brand = { ...defaultBranding, ...branding };
  const accent = /^#[0-9a-f]{6}$/i.test(brand.accentColor)
    ? brand.accentColor
    : defaultBranding.accentColor;
  const logo =
    typeof brand.logoDataUrl === 'string' &&
    /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(brand.logoDataUrl)
      ? `<img src="${e(brand.logoDataUrl)}" alt=""/>`
      : '';
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'none'"><title>${e(brand.agencyName)} - ${e(summary.project.name)}</title><style>
  *{box-sizing:border-box}body{margin:0;color:#25362e;background:#fff;font:12px/1.7 'Segoe UI',Arial,sans-serif;overflow-wrap:anywhere}main{max-width:960px;margin:auto;padding:32px}header{border-bottom:3px solid ${accent};padding-bottom:22px}.identity{display:flex;gap:12px;align-items:center}.identity>div{min-width:0}.identity img{max-width:130px;height:44px;object-fit:contain}.identity strong{font-size:15px}.muted,small{color:#606d65}h1{font-size:29px;line-height:1.3;margin:20px 0 10px}h2{font-size:19px;margin:27px 0 12px;break-after:avoid}h3{font-size:14px;margin:4px 0}p{margin:7px 0}.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:22px 0}.metrics>div,article{border:1px solid #dce5dd;border-radius:8px;padding:14px}.metrics strong{display:block;font-size:26px}.note{border-left:3px solid ${accent};padding:12px 15px;background:#f3f6f1;break-inside:avoid}article{margin:12px 0;break-inside:avoid}.site-head{display:flex;justify-content:space-between;gap:15px}.score{font-weight:700;font-size:24px;white-space:nowrap}.category{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:12px 0}.category>span{border-top:1px solid #e1e8df;padding-top:8px}.category b{display:block}.tag{display:inline-block;padding:2px 8px;background:#fff1df;color:#925021;font-size:10px;border-radius:6px}footer{border-top:1px solid #dce5dd;margin-top:25px;padding-top:12px;color:#606d65}.evidence{font-size:10px;background:#f6f7f4;padding:10px;border-radius:5px}@media screen and (max-width:560px){main{padding:22px 18px}.metrics,.category{grid-template-columns:repeat(2,minmax(0,1fr))}h1{font-size:24px}.site-head{flex-wrap:wrap}}@media print{main{padding:0;max-width:none}.metrics>div{break-inside:avoid}}
  </style></head><body><main><header><div class="identity">${logo}<div><strong>${e(brand.agencyName)}</strong><div class="muted">${e(brand.tagline)}</div></div></div><h1>Báo cáo tổng hợp dự án</h1><p><b>${e(summary.project.name)}</b></p><p>Khách hàng: ${e(summary.client.name)}</p><p class="muted">${e(date(summary.batch.createdAt))} · ${summary.batch.device === 'mobile' ? 'Mobile' : 'Desktop'} · Tối đa ${e(summary.batch.maxPages)} trang/website · ${e(batchLabels[summary.batch.status])}</p></header>
  <div class="metrics"><div><strong>${summary.totals.websites}</strong>website</div><div><strong>${summary.totals.available}</strong>có báo cáo</div><div><strong>${summary.totals.pending}</strong>việc còn lại</div><div><strong>${summary.totals.high}</strong>ưu tiên cao</div></div>
  <div class="note"><p>${summary.totals.incomplete ? `${summary.totals.incomplete} website chưa có kết quả. Website lỗi, bị hủy hoặc thiếu báo cáo không được coi là đạt.` : 'Đã có báo cáo cho mọi website trong lần kiểm tra này.'}</p><p>Điểm từng website là kết quả của lần đo ghi bên dưới. Không gộp thành điểm chung vì phạm vi và nguồn đo có thể khác nhau. Dấu hoàn thành công việc không thay đổi điểm.</p>${summary.batch.retryOf ? '<p>Lần thử lại giữ báo cáo của website đã hoàn tất trước đó; thời gian đo có thể khác nhau.</p>' : ''}${summary.batch.error ? `<p>${e(summary.batch.error)}</p>` : ''}</div>
  <h2>Kết quả từng website</h2><p class="muted">Xếp theo điểm tăng dần; website chưa có kết quả nằm cuối danh sách.</p>
  ${summary.websites
    .map(
      (site) =>
        `<article><div class="site-head"><div><h3>${e(site.url)}</h3><span>${e(status(site))}</span></div><span class="score">${site.score ?? '—'}<small> /100</small></span></div>${
          site.reportId
            ? `<p class="muted">Lần đo: ${e(date(site.createdAt))} · ${site.scope.scannedPages}/${site.scope.requestedPages} trang · ${site.scope.checkedLinks} liên kết</p><div class="category">${Object.entries(
                names,
              )
                .map(
                  ([id, label]) =>
                    `<span>${label}<b>${site.categories?.[id]?.score ?? '—'}/100</b></span>`,
                )
                .join(
                  '',
                )}</div><p>${site.pending} việc còn lại · ${site.high} ưu tiên cao · Nguồn tốc độ: ${e(site.categories?.performance?.source || 'Website Audit Kit')}</p>${site.lighthouse?.error ? `<p class="muted">Lighthouse: ${e(site.lighthouse.error)}</p>` : ''}<p class="muted">${e(site.methodology)}</p>${site.warnings.map((warning) => `<p class="muted">${e(warning)}</p>`).join('')}`
            : `<p>${e(site.error || 'Chưa có kết quả cho website này.')}</p>`
        }</article>`,
    )
    .join('')}
  <h2>Danh sách việc cần sửa</h2><p class="muted">Việc chưa hoàn tất được xếp trước, theo mức ưu tiên. Một vấn đề xuất hiện trên nhiều website vẫn được liệt kê riêng theo website.</p>
  ${summary.tasks.length ? summary.tasks.map(({ url, check }, i) => `<article><span class="tag">Ưu tiên ${e(levels[check.severity])} · ${e(names[check.category])}</span><h3>${i + 1}. ${e(check.title)}</h3><p class="muted">${e(url)}</p><p>Người phụ trách: ${e(check.assignee || 'Chưa gán')} · Hạn sửa: ${e(check.dueDate || 'Chưa đặt')} · ${e(workflow(check))}</p><p>${e(check.description)}</p><p><b>Cách sửa:</b> ${e(check.recommendation)}</p>${check.evidence?.length ? `<div class="evidence">${check.evidence.map(e).join('<br>')}</div>` : ''}</article>`).join('') : `<p>${summary.totals.available ? 'Không có việc cần sửa trong các báo cáo hiện có.' : 'Chưa có dữ liệu để tổng hợp công việc.'}</p>`}
  <footer><p>${e(brand.footer)}</p><p>Mã lần kiểm tra: ${e(summary.batch.id)} · Xuất trên máy chạy ứng dụng</p></footer></main></body></html>`;
}

export { batchComparisonHtml, batchComparisonCsv } from './batch-comparison-export.mjs';
