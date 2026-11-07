import { load } from 'cheerio';
import { SafeNetwork, AuditError, normalizeUrl, throwIfAborted, mapLimit } from './network.mjs';
import { inspectBrowser } from './browser.mjs';
import { inspectLighthouse } from './lighthouse.mjs';

const categoryNames = { performance: 'Tốc độ', mobile: 'Mobile', links: 'Liên kết', seo: 'SEO' };
const riskyPath =
  /\/(?:logout|log-out|signout|sign-out|delete|remove|unsubscribe|checkout|cart\/add)(?:\/|$)/i;

export function extractPage(response) {
  const $ = load(response.body.toString('utf8'));
  const base = (() => {
    try {
      const value = new URL($('base[href]').first().attr('href') || response.url, response.url);
      return ['http:', 'https:'].includes(value.protocol) ? value.href : response.url;
    } catch {
      return response.url;
    }
  })();
  const links = new Map();
  $('a[href]').each((_i, el) => {
    const raw = $(el).attr('href')?.trim();
    if (!raw || raw.startsWith('#')) return;
    try {
      const target = new URL(raw, base);
      if (
        !['https:', 'http:'].includes(target.protocol) ||
        target.username ||
        target.password ||
        riskyPath.test(target.pathname)
      )
        return;
      target.hash = '';
      links.set(target.href, {
        url: target.href,
        text: $(el).text().replace(/\s+/g, ' ').trim().slice(0, 120),
        source: response.url,
        internal: target.origin === new URL(response.url).origin,
      });
    } catch {}
  });
  const images = $('img').toArray();
  const missingAlt = images.filter((el) => $(el).attr('alt') === undefined);
  const noDimensions = images.filter((el) => !$(el).attr('width') || !$(el).attr('height'));
  const title = $('title').first().text().trim();
  const description = $('meta[name="description" i]').first().attr('content')?.trim() || '';
  const heading = $('h1')
    .toArray()
    .map((el) => $(el).text().replace(/\s+/g, ' ').trim());
  const robotsMeta = $('meta[name="robots" i]')
    .map((_i, el) => $(el).attr('content'))
    .get()
    .join(', ');
  return {
    url: response.url,
    status: response.status,
    title,
    description,
    h1: heading,
    canonical: $('link[rel="canonical" i]').first().attr('href') || null,
    language: $('html').attr('lang') || null,
    viewport: $('meta[name="viewport" i]').first().attr('content') || null,
    noindex: /\bnoindex\b/i.test(`${robotsMeta}, ${response.headers['x-robots-tag'] || ''}`),
    images: images.length,
    missingAlt: missingAlt.length,
    missingAltExamples: missingAlt.slice(0, 5).map((el) => $(el).attr('src') || '(không có src)'),
    noDimensions: noDimensions.length,
    links: [...links.values()],
    ogTitle: $('meta[property="og:title"]').first().attr('content') || null,
    ogImage: $('meta[property="og:image"]').first().attr('content') || null,
    structuredData: $('script[type="application/ld+json"]').length,
    bytes: response.bytes,
    ttfb: response.ttfb,
    duration: response.duration,
    cacheControl: response.headers['cache-control'] || null,
  };
}

export function parseRobots(text, url) {
  const groups = [];
  let group = null;
  let hasRules = false;
  const sitemaps = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split('#')[0].trim();
    const match = /^([^:]+):\s*(.*)$/.exec(line);
    if (!match) continue;
    const key = match[1].toLowerCase().trim();
    const value = match[2].trim();
    if (key === 'sitemap') {
      try {
        const sitemap = new URL(value, url);
        if (sitemap.origin === new URL(url).origin) sitemaps.push(sitemap.href);
      } catch {}
    }
    if (key === 'user-agent') {
      if (!group || hasRules) {
        group = { agents: [], rules: [] };
        groups.push(group);
        hasRules = false;
      }
      group.agents.push(value.toLowerCase());
    } else if (group && ['disallow', 'allow'].includes(key)) {
      hasRules = true;
      if (value) group.rules.push({ path: value, allow: key === 'allow' });
    }
  }
  const specific = groups.filter((g) =>
    g.agents.some((a) => a !== '*' && 'websiteauditkit'.startsWith(a)),
  );
  const rules = (specific.length ? specific : groups.filter((g) => g.agents.includes('*'))).flatMap(
    (g) => g.rules,
  );
  return { rules, sitemaps };
}

export function isAllowedByRobots(url, rules) {
  const target = new URL(url);
  const path = `${target.pathname}${target.search}`;
  const matches = rules
    .filter((rule) => {
      const pattern = rule.path
        .replace(/[.+?^{}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\$$/, '$');
      try {
        return new RegExp(`^${pattern}`).test(path);
      } catch {
        return path.startsWith(rule.path);
      }
    })
    .sort((a, b) => b.path.length - a.path.length || Number(b.allow) - Number(a.allow));
  return !matches.length || matches[0].allow;
}

export function buildChecks({
  pages,
  links,
  browser,
  robots,
  sitemap,
  discoveredLinks,
  skippedLinks,
  lighthouse,
}) {
  const checks = [];
  const add = (
    id,
    category,
    title,
    status,
    severity,
    description,
    recommendation,
    evidence = [],
    urls = [],
    weight = 5,
    effort = '15 phút',
  ) =>
    checks.push({
      id,
      category,
      title,
      status,
      severity,
      description,
      recommendation,
      evidence,
      urls,
      weight,
      effort,
      done: false,
    });
  const pageCheck = (
    id,
    title,
    predicate,
    recommendation,
    severity = 'medium',
    weight = 6,
    detail = (p) => p.url,
  ) => {
    const affected = pages.filter(predicate);
    add(
      id,
      'seo',
      title,
      affected.length ? (severity === 'high' ? 'fail' : 'warn') : 'pass',
      severity,
      affected.length
        ? `${affected.length}/${pages.length} trang cần điều chỉnh.`
        : `Đạt trên ${pages.length} trang đã kiểm tra.`,
      recommendation,
      affected.map(detail).slice(0, 10),
      affected.map((p) => p.url),
      weight,
    );
  };
  const home = pages[0];
  add(
    'https',
    'seo',
    'Kết nối HTTPS',
    new URL(home.url).protocol === 'https:' ? 'pass' : 'fail',
    'high',
    new URL(home.url).protocol === 'https:'
      ? 'Trang đích sử dụng kết nối mã hóa HTTPS.'
      : 'Trang đích đang dùng HTTP.',
    'Cài chứng chỉ TLS hợp lệ và chuyển hướng mọi URL HTTP sang HTTPS.',
    [home.url],
    [home.url],
    10,
    '30 phút',
  );
  pageCheck(
    'title',
    'Tiêu đề trang rõ ràng',
    (p) => !p.title || p.title.length < 15 || p.title.length > 65,
    'Viết title riêng cho từng trang, khoảng 15–65 ký tự; đưa chủ đề chính lên đầu.',
    'high',
    10,
    (p) => `${p.url} — ${p.title ? `${p.title} (${p.title.length} ký tự)` : 'Thiếu thẻ <title>'}`,
  );
  pageCheck(
    'description',
    'Mô tả tìm kiếm',
    (p) => p.description.length < 70 || p.description.length > 165,
    'Thêm meta description riêng cho mỗi trang, khoảng 70–165 ký tự, mô tả đúng nội dung và lợi ích.',
    'medium',
    8,
    (p) =>
      `${p.url} — ${p.description ? `${p.description.length} ký tự` : 'Thiếu meta description'}`,
  );
  pageCheck(
    'h1',
    'Một tiêu đề H1 chính',
    (p) => p.h1.length !== 1 || !p.h1[0],
    'Thêm một H1 có ý nghĩa cho mỗi trang. Tổ chức các mục phụ bằng H2 và H3.',
    'medium',
    7,
    (p) => `${p.url} — ${p.h1.length} thẻ H1`,
  );
  pageCheck(
    'alt',
    'Văn bản thay thế cho ảnh',
    (p) => p.missingAlt > 0,
    'Thêm alt mô tả nội dung cho ảnh mang thông tin. Dùng alt="" cho ảnh trang trí.',
    'medium',
    7,
    (p) =>
      `${p.url} — ${p.missingAlt}/${p.images} ảnh thiếu alt: ${p.missingAltExamples.join(', ')}`,
  );
  pageCheck(
    'canonical',
    'URL chuẩn (canonical)',
    (p) =>
      !p.canonical ||
      (() => {
        try {
          return !['https:', 'http:'].includes(new URL(p.canonical, p.url).protocol);
        } catch {
          return true;
        }
      })(),
    'Thêm <link rel="canonical" href="URL chính thức"> trong <head> để chỉ rõ URL chuẩn.',
    'low',
    4,
  );
  pageCheck(
    'language',
    'Ngôn ngữ của trang',
    (p) => !p.language,
    'Khai báo thuộc tính lang trên thẻ <html>, ví dụ lang="vi" cho tiếng Việt.',
    'low',
    3,
  );
  pageCheck(
    'indexable',
    'Cho phép công cụ tìm kiếm lập chỉ mục',
    (p) => p.noindex,
    'Kiểm tra meta robots và X-Robots-Tag. Chỉ bỏ noindex nếu trang cần xuất hiện trên công cụ tìm kiếm.',
    'high',
    10,
    (p) => `${p.url} — phát hiện noindex`,
  );
  pageCheck(
    'social',
    'Ảnh và tiêu đề khi chia sẻ',
    (p) => !p.ogTitle || !p.ogImage,
    'Bổ sung og:title và og:image để liên kết có bản xem trước khi chia sẻ.',
    'low',
    3,
  );
  const duplicate = pages.filter(
    (p) => p.title && pages.filter((other) => other.title === p.title).length > 1,
  );
  add(
    'duplicate-titles',
    'seo',
    'Tiêu đề riêng cho từng trang',
    duplicate.length ? 'warn' : 'pass',
    'medium',
    duplicate.length
      ? `${duplicate.length} trang dùng chung tiêu đề.`
      : 'Không phát hiện tiêu đề trùng trong phạm vi đã quét.',
    'Viết title riêng để phân biệt chủ đề của từng trang.',
    duplicate.map((p) => `${p.url} — ${p.title}`),
    duplicate.map((p) => p.url),
    5,
  );
  add(
    'robots',
    'seo',
    'Tệp robots.txt',
    robots.available ? 'pass' : robots.status === 404 ? 'info' : 'warn',
    'low',
    robots.available
      ? 'Đã đọc robots.txt; crawler tuân theo các quy tắc Allow/Disallow đã đọc.'
      : robots.status === 404
        ? 'Không có robots.txt. Đây không phải lỗi và không ngăn Google lập chỉ mục.'
        : 'Chưa đọc được robots.txt. Các trang con không được thu thập khi không xác minh được quy tắc.',
    'Thêm robots.txt khi cần hướng dẫn crawler; không dùng tệp này để bảo vệ thông tin riêng tư.',
    [robots.url, `HTTP ${robots.status || 'không phản hồi'}`],
    [],
    2,
  );
  add(
    'sitemap',
    'seo',
    'Sitemap XML',
    sitemap.available ? 'pass' : sitemap.status === 404 ? 'warn' : 'info',
    'low',
    sitemap.available
      ? 'Đã phát hiện sitemap XML cùng website.'
      : 'Chưa xác minh được sitemap XML tại vị trí đã thử.',
    'Tạo sitemap chứa các URL muốn lập chỉ mục, khai báo đường dẫn trong robots.txt và gửi lên Search Console.',
    [sitemap.url, `HTTP ${sitemap.status || 'không phản hồi'}`],
    [],
    3,
    '30 phút',
  );
  add(
    'ttfb',
    'performance',
    'Thời gian phản hồi máy chủ (TTFB)',
    home.ttfb <= 800 ? 'pass' : home.ttfb <= 1800 ? 'warn' : 'fail',
    'high',
    `Phản hồi đầu tiên sau ${home.ttfb} ms, gồm DNS, kết nối và chuyển hướng.`,
    'Kiểm tra cache phía máy chủ, truy vấn dữ liệu và CDN. Mục tiêu tham khảo: TTFB ≤ 800 ms.',
    [`${home.ttfb} ms`, home.url],
    [home.url],
    10,
    '1–2 giờ',
  );
  add(
    'html-size',
    'performance',
    'Dung lượng HTML',
    home.bytes <= 100 * 1024 ? 'pass' : home.bytes <= 250 * 1024 ? 'warn' : 'fail',
    'medium',
    `HTML trang đầu: ${(home.bytes / 1024).toFixed(1)} KB (phản hồi không yêu cầu nén).`,
    'Giảm HTML thừa, chia nhỏ nội dung và bật Brotli/Gzip trên máy chủ.',
    [`${home.bytes} byte`],
    [home.url],
    5,
    '30 phút',
  );
  const dim = pages.filter((p) => p.noDimensions);
  add(
    'image-dimensions',
    'performance',
    'Kích thước ảnh được khai báo',
    dim.length ? 'warn' : 'pass',
    'medium',
    dim.length
      ? `${dim.reduce((n, p) => n + p.noDimensions, 0)} ảnh thiếu width hoặc height trong HTML.`
      : 'Các ảnh trong HTML đã có width và height.',
    'Khai báo width/height hoặc giữ tỉ lệ bằng aspect-ratio; xác minh ảnh có làm bố cục dịch chuyển khi tải.',
    dim.map((p) => `${p.url} — ${p.noDimensions} ảnh`),
    dim.map((p) => p.url),
    4,
    '30 phút',
  );
  if (lighthouse?.available || (browser.available && browser.performance)) {
    const metrics = lighthouse?.available ? lighthouse.metrics : browser.performance;
    const measurement = lighthouse?.available
      ? 'Lighthouse (mô phỏng cục bộ)'
      : 'phiên trình duyệt cục bộ';
    if (metrics.fcp !== null)
      add(
        'fcp',
        'performance',
        'Nội dung đầu tiên hiển thị (FCP)',
        metrics.fcp <= 1800 ? 'pass' : metrics.fcp <= 3000 ? 'warn' : 'fail',
        'high',
        `FCP ${Math.round(metrics.fcp)} ms — ${measurement}.`,
        'Giảm CSS/JavaScript chặn hiển thị, ưu tiên tài nguyên cần cho phần đầu trang.',
        [`${metrics.fcp} ms`],
        [home.url],
        7,
        '1–2 giờ',
      );
    if (metrics.lcp !== null)
      add(
        'lcp',
        'performance',
        'Nội dung lớn nhất hiển thị (LCP)',
        metrics.lcp <= 2500 ? 'pass' : metrics.lcp <= 4000 ? 'warn' : 'fail',
        'high',
        `LCP ${Math.round(metrics.lcp)} ms — ${measurement}.`,
        'Tối ưu ảnh lớn đầu trang bằng WebP/AVIF, tải đúng kích thước và ưu tiên ảnh LCP.',
        [`${metrics.lcp} ms`],
        [home.url],
        10,
        '1–2 giờ',
      );
    if (metrics.cls !== null)
      add(
        'cls',
        'performance',
        'Độ ổn định bố cục (CLS)',
        metrics.cls <= 0.1 ? 'pass' : metrics.cls <= 0.25 ? 'warn' : 'fail',
        'medium',
        `CLS ${Number(metrics.cls).toFixed(3)} — ${measurement}.`,
        'Dành trước không gian cho ảnh, quảng cáo, nội dung động; hạn chế chèn nội dung lên phía trên.',
        [String(metrics.cls)],
        [home.url],
        6,
        '1 giờ',
      );
    if (browser.available && browser.totalBytes != null)
      add(
        'resources',
        'performance',
        'Dung lượng tài nguyên đã tải',
        browser.totalBytes <= 2 * 1024 * 1024 ? 'pass' : 'warn',
        'medium',
        `${(browser.totalBytes / 1024 / 1024).toFixed(2)} MB được tải qua ${browser.resourceCount} yêu cầu trên các lượt render.`,
        'Nén ảnh, dùng định dạng hiện đại và loại bỏ JavaScript không sử dụng. Tổng này gồm cả lượt chụp mobile/desktop.',
        [`${browser.resourceCount} yêu cầu`, `${browser.totalBytes} byte`],
        [home.url],
        4,
        '1–2 giờ',
      );
  } else
    add(
      'browser-metrics',
      'performance',
      'Số liệu từ trình duyệt',
      'info',
      'low',
      browser.warning || 'Chưa đo được phiên trình duyệt.',
      'Cài Edge/Chrome hoặc Chromium, sau đó kiểm tra lại để có FCP, LCP và CLS.',
      [],
      [],
      0,
    );
  if (lighthouse?.available) {
    for (const audit of lighthouse.audits.filter((a) => a.opportunity)) {
      const status =
        audit.scoreDisplayMode === 'notApplicable'
          ? 'pass'
          : audit.error || audit.score === null
            ? 'info'
            : audit.score === 1
              ? 'pass'
              : audit.score < 0.5
                ? 'fail'
                : 'warn';
      add(
        `lh-${audit.id}`,
        'performance',
        audit.title,
        status,
        audit.savingsMs >= 500 ? 'high' : 'medium',
        `Lighthouse: ${audit.displayValue || (audit.scoreDisplayMode === 'notApplicable' ? 'Không áp dụng cho trang này.' : status === 'pass' ? 'Đã đạt.' : 'Cần kiểm tra tài nguyên liên quan.')}`,
        audit.description.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'),
        [audit.displayValue, ...audit.resources.map((r) => r.url)].filter(Boolean),
        [home.url],
        0,
        '1–2 giờ',
      );
    }
  }
  const mobile = browser.mobile;
  add(
    'viewport',
    'mobile',
    'Thiết lập viewport cho mobile',
    home.viewport && /width\s*=\s*device-width/i.test(home.viewport) ? 'pass' : 'fail',
    'high',
    home.viewport || 'Thiếu meta viewport phù hợp.',
    'Thêm <meta name="viewport" content="width=device-width, initial-scale=1"> trong <head>.',
    [home.viewport || 'Không có viewport'],
    [home.url],
    10,
  );
  if (mobile) {
    add(
      'overflow',
      'mobile',
      'Bố cục vừa màn hình',
      mobile.overflow ? 'fail' : 'pass',
      'high',
      mobile.overflow
        ? `Nội dung rộng ${mobile.scrollWidth}px, vượt khung nhìn ${mobile.width}px.`
        : `Không phát hiện cuộn ngang tại khung nhìn ${mobile.width}px.`,
      'Bỏ chiều rộng cố định, dùng max-width:100% cho ảnh/bảng và kiểm tra phần tử vượt khung.',
      mobile.overflowing,
      [home.url],
      10,
      '1 giờ',
    );
    add(
      'small-text',
      'mobile',
      'Cỡ chữ dễ đọc',
      mobile.smallTextCount ? 'warn' : 'pass',
      'medium',
      `${mobile.smallTextCount} phần tử chữ hiển thị có cỡ nhỏ hơn 12px.`,
      'Ưu tiên cỡ chữ nội dung khoảng 16px, kiểm tra khả năng đọc trên điện thoại thực tế.',
      mobile.smallTextExamples,
      [home.url],
      6,
      '30 phút',
    );
    add(
      'tap-targets',
      'mobile',
      'Vùng bấm đủ rộng',
      mobile.smallTargetCount ? 'warn' : 'pass',
      'medium',
      `${mobile.smallTargetCount}/${mobile.targetCount} vùng bấm có một chiều nhỏ hơn 24px. Đây là kiểm tra hình học sơ bộ, chưa xét mọi ngoại lệ WCAG.`,
      'Mở rộng vùng bấm hoặc thêm khoảng cách giữa các điều khiển. Mục tiêu tối thiểu tham khảo: 24 × 24px.',
      mobile.smallTargetExamples,
      [home.url],
      6,
      '1 giờ',
    );
  } else
    add(
      'mobile-render',
      'mobile',
      'Kiểm tra giao diện mobile',
      'info',
      'low',
      browser.warning || 'Chưa render được giao diện mobile.',
      'Kiểm tra lại sau khi cài trình duyệt để đánh giá tràn màn hình và vùng bấm.',
      [],
      [],
      0,
    );
  const broken = links.filter((l) => l.state === 'broken');
  const unknown = links.filter((l) => l.state === 'unknown');
  add(
    'broken-links',
    'links',
    'Liên kết trả về lỗi HTTP',
    !links.length ? 'info' : broken.length ? 'fail' : 'pass',
    'high',
    !links.length
      ? 'Chưa có liên kết đủ điều kiện để kiểm tra; không tính điểm hạng mục này.'
      : broken.length
        ? `${broken.length}/${links.length} liên kết đã thử trả về lỗi HTTP.`
        : `Không phát hiện lỗi HTTP trong ${links.length} liên kết đã thử.`,
    'Sửa URL sai, khôi phục trang còn dùng hoặc chuyển hướng 301 đến nội dung thay thế phù hợp.',
    broken.map((l) => `HTTP ${l.status}: ${l.url}`),
    broken.map((l) => l.source),
    12,
    '30 phút',
  );
  add(
    'unknown-links',
    'links',
    'Liên kết chưa xác minh',
    !links.length ? 'info' : unknown.length ? 'warn' : 'pass',
    'medium',
    unknown.length
      ? `${unknown.length} liên kết cần kiểm tra thủ công (timeout, hạn chế truy cập hoặc mạng).`
      : links.length
        ? 'Các liên kết đã thử đều có kết quả HTTP xác định.'
        : 'Chưa có dữ liệu kiểm tra liên kết.',
    'Mở các URL trong trình duyệt để xác minh; lỗi kết nối hoặc HTTP 403/429 chưa đủ kết luận link bị hỏng.',
    unknown.map((l) => `${l.url} — ${l.error || `HTTP ${l.status}`}`),
    unknown.map((l) => l.source),
    4,
  );
  const redirected = links.filter((l) => l.redirects?.length);
  add(
    'redirects',
    'links',
    'Liên kết chuyển hướng',
    !links.length ? 'info' : redirected.length ? 'warn' : 'pass',
    'low',
    `${redirected.length} liên kết có chuyển hướng trong phạm vi đã kiểm tra.`,
    'Cập nhật href tới URL đích cuối cùng để giảm thời gian điều hướng.',
    redirected.map((l) => `${l.url} → ${l.finalUrl}`),
    redirected.map((l) => l.source),
    3,
  );
  if (skippedLinks)
    add(
      'link-scope',
      'links',
      'Phạm vi kiểm tra liên kết',
      'info',
      'low',
      `Phát hiện ${discoveredLinks} URL; ${skippedLinks} URL chưa thử do giới hạn, robots.txt hoặc chính sách truy cập.`,
      'Tăng số trang hoặc chạy một lượt kiểm tra riêng cho các URL ngoài phạm vi.',
      [],
      [],
      0,
    );
  return checks;
}

export function scoreChecks(checks, lighthouse) {
  const categories = Object.fromEntries(
    Object.entries(categoryNames).map(([id, name]) => {
      const measured = checks.filter(
        (c) => c.category === id && c.status !== 'info' && c.weight > 0,
      );
      const weight = measured.reduce((n, c) => n + c.weight, 0);
      const score = weight
        ? Math.round(
            (measured.reduce(
              (n, c) => n + c.weight * (c.status === 'pass' ? 1 : c.status === 'warn' ? 0.5 : 0),
              0,
            ) /
              weight) *
              100,
          )
        : null;
      return [
        id,
        {
          id,
          name,
          score,
          passed: measured.filter((c) => c.status === 'pass').length,
          total: measured.length,
        },
      ];
    }),
  );
  if (lighthouse?.available) {
    categories.performance.score = lighthouse.score;
    categories.performance.source = 'Lighthouse';
  }
  const values = Object.values(categories).filter((c) => c.score !== null);
  return {
    score: values.length
      ? Math.round(values.reduce((n, c) => n + c.score, 0) / values.length)
      : null,
    categories,
  };
}

export async function runAudit({
  id,
  url: input,
  device,
  maxPages,
  dir,
  signal,
  onProgress,
  allowLoopback,
}) {
  const started = Date.now();
  const network = new SafeNetwork({ signal, allowLoopback });
  const warnings = [];
  const pages = [];
  const failedPages = [];
  try {
    const url = normalizeUrl(input);
    onProgress(7, 'Kết nối website và đọc trang đầu…');
    const home = await network.fetch(url, { accept: 'text/html,application/xhtml+xml' });
    if (home.status < 200 || home.status >= 400)
      throw new AuditError(
        `Website trả về HTTP ${home.status}. Vui lòng kiểm tra URL hoặc thử lại sau.`,
        'HTTP_ERROR',
      );
    if (!/text\/html|application\/xhtml\+xml/i.test(home.headers['content-type'] || ''))
      throw new AuditError(
        'URL này không trả về trang HTML. Hãy nhập URL của một trang website.',
        'NOT_HTML',
      );
    pages.push(extractPage(home));
    const origin = new URL(home.url).origin;
    onProgress(16, 'Đọc robots.txt, sitemap và khám phá các trang…');
    let robots = {
      available: false,
      status: 0,
      url: `${origin}/robots.txt`,
      rules: [],
      sitemaps: [],
    };
    try {
      const response = await network.fetch(robots.url, { timeout: 6000, maxBytes: 256 * 1024 });
      const valid =
        response.status === 200 &&
        new URL(response.url).origin === origin &&
        !/text\/html/i.test(response.headers['content-type'] || '');
      robots = {
        ...robots,
        available: valid,
        status: response.status,
        ...(valid ? parseRobots(response.body.toString(), robots.url) : {}),
      };
    } catch (error) {
      throwIfAborted(signal);
      warnings.push(`Không đọc được robots.txt: ${error.message}`);
    }
    let sitemap = {
      available: false,
      status: 0,
      url: robots.sitemaps[0] || `${origin}/sitemap.xml`,
    };
    let sitemapUrls = [];
    try {
      const response = await network.fetch(sitemap.url, { timeout: 6000, maxBytes: 1024 * 1024 });
      const body = response.body.toString();
      sitemap = {
        ...sitemap,
        status: response.status,
        available:
          response.status === 200 &&
          /<(?:[a-z]+:)?(?:urlset|sitemapindex)(?:\s|>)/i.test(body) &&
          new URL(response.url).origin === origin,
      };
      if (sitemap.available && /<urlset(?:\s|>)/i.test(body)) {
        const $ = load(body, { xmlMode: true });
        sitemapUrls = $('url > loc')
          .toArray()
          .slice(0, 100)
          .map((el) => $(el).text().trim());
      } else if (sitemap.available && /<sitemapindex(?:\s|>)/i.test(body)) {
        const $ = load(body, { xmlMode: true });
        const childSitemaps = $('sitemap > loc')
          .toArray()
          .slice(0, 3)
          .map((el) => $(el).text().trim());
        for (const childUrl of childSitemaps) {
          if (sitemapUrls.length >= 100) break;
          try {
            if (new URL(childUrl).origin !== origin) continue;
            const childRes = await network.fetch(childUrl, { timeout: 6000, maxBytes: 1024 * 1024 });
            const childBody = childRes.body.toString();
            if (childRes.status === 200 && /<urlset(?:\s|>)/i.test(childBody)) {
              const $child = load(childBody, { xmlMode: true });
              const found = $child('url > loc')
                .toArray()
                .slice(0, 100 - sitemapUrls.length)
                .map((el) => $child(el).text().trim());
              sitemapUrls.push(...found);
            }
          } catch {
            // Ignore unreadable child sitemaps
          }
        }
      }
    } catch (error) {
      throwIfAborted(signal);
      warnings.push(`Không đọc được sitemap: ${error.message}`);
    }
    const canCrawl = robots.available || robots.status === 404;
    const discovered = new Map(pages[0].links.map((l) => [l.url, l]));
    const queue = [...pages[0].links.filter((l) => l.internal).map((l) => l.url), ...sitemapUrls];
    const visited = new Set([home.url, url]);
    while (pages.length < maxPages && queue.length && canCrawl) {
      throwIfAborted(signal);
      const candidate = queue.shift();
      let target;
      try {
        target = new URL(candidate);
      } catch {
        continue;
      }
      target.hash = '';
      if (
        visited.has(target.href) ||
        target.origin !== origin ||
        target.search ||
        riskyPath.test(target.pathname) ||
        !isAllowedByRobots(target.href, robots.rules) ||
        /\.(?:pdf|zip|png|jpe?g|svg|webp|gif|mp4|mp3|css|js|xml)$/i.test(target.pathname)
      )
        continue;
      visited.add(target.href);
      try {
        const response = await network.fetch(target.href, {
          timeout: 8000,
          maxBytes: 2 * 1024 * 1024,
          accept: 'text/html',
        });
        if (
          response.status >= 200 &&
          response.status < 300 &&
          new URL(response.url).origin === origin &&
          /text\/html|application\/xhtml\+xml/i.test(response.headers['content-type'] || '')
        ) {
          if (pages.some((p) => p.url === response.url)) continue;
          const parsed = extractPage(response);
          pages.push(parsed);
          visited.add(response.url);
          for (const link of parsed.links) {
            if (!discovered.has(link.url)) discovered.set(link.url, link);
            if (link.internal && queue.length < 100) queue.push(link.url);
          }
        } else
          failedPages.push({
            url: target.href,
            status: response.status,
            reason: 'Không phải trang HTML cùng website trả về 2xx.',
          });
      } catch (error) {
        throwIfAborted(signal);
        failedPages.push({ url: target.href, reason: error.message });
      }
      onProgress(
        18 + Math.round((pages.length / maxPages) * 14),
        `Đã đọc ${pages.length}/${maxPages} trang tối đa…`,
      );
      if (visited.size >= 25) break;
    }
    if (!canCrawl && maxPages > 1)
      warnings.push('Chỉ kiểm tra trang đầu vì chưa xác minh được robots.txt.');
    onProgress(37, `Đang render ${device === 'mobile' ? 'mobile' : 'desktop'} và đo tốc độ…`);
    let browser;
    try {
      browser = await inspectBrowser({ url: home.url, network, device, dir, signal, onProgress });
    } catch (error) {
      throwIfAborted(signal);
      browser = {
        available: false,
        mobile: null,
        desktop: null,
        performance: null,
        warning: error.message,
      };
      warnings.push(error.message);
    }
    if (browser.warning && !warnings.includes(browser.warning)) warnings.push(browser.warning);
    onProgress(59, 'Lighthouse đang đo hiệu năng và tìm cơ hội tối ưu…');
    const lighthouse = await inspectLighthouse({ url: home.url, device, signal, allowLoopback });
    if (!lighthouse.available)
      warnings.push(
        `Chưa đo được Lighthouse: ${lighthouse.error}. Điểm tốc độ dùng các kiểm tra Website Audit Kit.`,
      );
    else {
      warnings.push(...lighthouse.warnings.map((w) => `Lighthouse: ${w}`));
      if (lighthouse.blockedResources || lighthouse.failedResources)
        warnings.push(
          `Lighthouse: ${lighthouse.blockedResources} yêu cầu bị chặn, ${lighthouse.failedResources} tài nguyên không tải được; điểm phản ánh nội dung tải được.`,
        );
    }
    for (const rendered of browser.links || []) {
      try {
        const target = new URL(rendered.url);
        if (
          !['http:', 'https:'].includes(target.protocol) ||
          target.username ||
          target.password ||
          riskyPath.test(target.pathname)
        )
          continue;
        target.hash = '';
        if (!discovered.has(target.href))
          discovered.set(target.href, {
            ...rendered,
            url: target.href,
            internal: target.origin === origin,
            rendered: true,
          });
      } catch {}
    }
    onProgress(67, 'Kiểm tra trạng thái HTTP của các liên kết…');
    const candidates = [...discovered.values()]
      .filter((l) => !l.internal || isAllowedByRobots(l.url, robots.rules))
      .slice(0, 40);
    let checked = 0;
    const links = await mapLimit(candidates, 4, async (link) => {
      throwIfAborted(signal);
      try {
        let response = await network.fetch(link.url, {
          method: 'HEAD',
          readBody: false,
          timeout: 6000,
        });
        if (response.status >= 400 && ![401, 403, 429].includes(response.status))
          response = await network.fetch(link.url, { readBody: false, timeout: 6000 });
        const unknown =
          [401, 403, 429].includes(response.status) ||
          response.status < 200 ||
          (response.status >= 300 && response.status < 400);
        return {
          ...link,
          status: response.status,
          finalUrl: response.url,
          redirects: response.redirects,
          state: unknown ? 'unknown' : response.status >= 400 ? 'broken' : 'ok',
        };
      } catch (error) {
        throwIfAborted(signal);
        return { ...link, status: null, state: 'unknown', error: error.message };
      } finally {
        checked++;
        onProgress(
          67 + Math.round((checked / Math.max(candidates.length, 1)) * 24),
          `Đã kiểm tra ${checked}/${candidates.length} liên kết…`,
        );
      }
    });
    onProgress(95, 'Sắp xếp việc cần sửa và hoàn tất báo cáo…');
    const checks = buildChecks({
      pages,
      links,
      browser,
      robots,
      sitemap,
      discoveredLinks: discovered.size,
      skippedLinks: discovered.size - candidates.length,
      lighthouse,
    });
    const { score, categories } = scoreChecks(checks, lighthouse);
    return {
      id,
      url: home.url,
      requestedUrl: url,
      title: home.url ? new URL(home.url).hostname : '',
      createdAt: new Date().toISOString(),
      duration: Date.now() - started,
      device,
      maxPages,
      score,
      categories,
      checks,
      pages,
      links,
      browser,
      lighthouse,
      robots,
      sitemap,
      warnings,
      failedPages,
      scope: {
        requestedPages: maxPages,
        scannedPages: pages.length,
        discoveredLinks: discovered.size,
        checkedLinks: links.length,
        skippedLinks: discovered.size - candidates.length,
        mobilePages: browser.mobile ? 1 : 0,
        requests: network.requests + (lighthouse.requests || 0),
        bytes: network.bytes + (lighthouse.bytes || 0),
      },
      methodology:
        (lighthouse.available
          ? `Điểm Tốc độ do Lighthouse ${lighthouse.version} tính cho trang đầu, thiết bị ${device}, throttling mô phỏng ${device === 'mobile' ? 'Slow 4G' : 'desktop'}. `
          : 'Chưa có Lighthouse; điểm Tốc độ dùng các kiểm tra nội bộ Website Audit Kit. ') +
        'Các hạng mục còn lại tính theo trọng số công khai trong JSON; điểm tổng là trung bình các hạng mục có dữ liệu. SEO đọc HTML máy chủ của các trang đã quét. Mobile chỉ đo trang đầu. Đo cục bộ qua cầu nối HTTP có giới hạn, không phải PageSpeed Insights hoặc dữ liệu người dùng thực tế (CrUX), không đo INP. Cầu nối dùng nội dung đã giải nén, bỏ qua kiểm tra nén văn bản, có thể làm khác dung lượng, cache, chuyển hướng và thời gian tài nguyên; điểm có thể thay đổi theo máy và mạng.',
    };
  } finally {
    await network.close();
  }
}
