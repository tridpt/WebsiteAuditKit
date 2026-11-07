import { randomUUID } from 'node:crypto';

// Synthetic data for export and UI checks; never written to the user's audit history.
export function brandingReport() {
  const url = 'https://client.example/';
  const categories = ['performance', 'mobile', 'links', 'seo'];
  const titles = [
    'Ảnh đầu trang tải còn chậm',
    'Một số vùng bấm hơi nhỏ',
    'Liên kết cũ trả về HTTP 404',
    'Trang dịch vụ còn thiếu mô tả tìm kiếm',
    'Giảm dung lượng tài nguyên hình ảnh',
    'Kiểm tra nội dung tràn trên màn hình nhỏ',
    'Cập nhật liên kết chuyển hướng',
    'Bổ sung mô tả cho ảnh nội dung',
  ];
  return {
    id: randomUUID(),
    url,
    requestedUrl: url,
    title: 'client.example',
    createdAt: '2026-10-24T03:30:00.000Z',
    duration: 12000,
    device: 'mobile',
    maxPages: 5,
    score: 72,
    categories: Object.fromEntries(
      categories.map((id, index) => [
        id,
        {
          id,
          name: ['Tốc độ', 'Mobile', 'Liên kết', 'SEO'][index],
          score: [65, 78, 70, 75][index],
          passed: 2,
          total: 4,
        },
      ]),
    ),
    checks: titles.map((title, index) => ({
      id: `fixture-${index}`,
      category: categories[index % 4],
      title,
      status: index < 4 ? 'fail' : 'warn',
      severity: index < 4 ? 'high' : 'medium',
      description:
        'Kiểm tra phát hiện nội dung cần cải thiện trên trang được khảo sát. Bằng chứng bên dưới giúp xác định vị trí và ưu tiên công việc cho lần cập nhật website tiếp theo.',
      recommendation:
        'Kiểm tra tài nguyên và nội dung được liệt kê, cập nhật trang đang hoạt động rồi chạy lại phép kiểm tra với cùng thiết bị và phạm vi để đối chiếu kết quả.',
      evidence: [`Bằng chứng kiểm thử ${index + 1}`, `${url}dich-vu/tai-nguyen-${index + 1}`],
      urls: [url],
      weight: 5,
      effort: '30 phút',
      done: index === 0,
    })),
    pages: [
      {
        url,
        title: 'Website kiểm thử',
        description: 'Dữ liệu giả lập cho kiểm thử',
        status: 200,
        ttfb: 100,
        bytes: 1024,
        h1: ['Xin chào'],
        images: 2,
        missingAlt: 1,
      },
    ],
    links: [],
    browser: { available: false, performance: null, mobile: null, desktop: null },
    lighthouse: { available: false, error: 'Dữ liệu giả lập cho kiểm thử bản xuất.' },
    scope: {
      requestedPages: 5,
      scannedPages: 1,
      discoveredLinks: 0,
      checkedLinks: 0,
      skippedLinks: 0,
      mobilePages: 0,
      requests: 1,
      bytes: 1024,
    },
    methodology:
      'Báo cáo kiểm thử thương hiệu với dữ liệu giả lập; không phải kết quả đo một website thật.',
    warnings: [],
  };
}

export function csvRows(csv) {
  const rows = [];
  let row = [],
    cell = '',
    quoted = false;
  const text = csv.replace(/^\uFEFF/, '');
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index++;
      } else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if (char === '\n' && !quoted) {
      row.push(cell.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      cell = '';
    } else cell += char;
  }
  row.push(cell);
  rows.push(row);
  return rows;
}
