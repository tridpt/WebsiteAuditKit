import http from 'node:http';
import { once } from 'node:events';
import zlib from 'node:zlib';

export async function startFixture() {
  const requests = [];
  let variant = 'initial';
  const html = (title, body, description = '') =>
    `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>${description ? `<meta name="description" content="${description}">` : ''}<link rel="canonical" href="/"><link rel="stylesheet" href="/unused.css"><style>body{font:16px system-ui;background:#f0f4ec;color:#294333;margin:0;padding:32px}main{max-width:800px;margin:auto}h1{font-size:40px}a{color:#25654a;display:inline-block;padding:14px}small{font-size:10px}button{font:inherit;padding:14px;background:#31654e;color:white;border:0;border-radius:6px}.overflow{width:1100px;height:20px;background:#c5d7b3}img{max-width:100%}</style></head><body><main>${body}</main></body></html>`;
  const fixture = http.createServer((req, res) => {
    requests.push({ method: req.method, url: req.url });
    if (req.url === '/unused.css') {
      res.setHeader('Content-Type', 'text/css');
      return res.end(
        Array.from(
          { length: 2200 },
          (_, i) => `.unused-fixture-${i} { color: #123456; background: #ffffff; padding: 20px; }`,
        ).join('\n'),
      );
    }
    if (req.url === '/robots.txt') {
      res.setHeader('Content-Type', 'text/plain');
      return res.end('User-agent: *\nDisallow: /private\n');
    }
    if (req.url === '/sitemap.xml') {
      res.setHeader('Content-Type', 'application/xml');
      return res.end(
        '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>',
      );
    }
    if (req.url === '/redirect') {
      res.writeHead(301, { Location: '/about' });
      return res.end();
    }
    if (req.url === '/private') {
      res.statusCode = 200;
      return res.end('This must not be crawled.');
    }
    if (req.url === '/restricted') {
      res.statusCode = 403;
      return res.end('Denied');
    }
    if (req.url === '/missing' && variant === 'initial') {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/html');
      return res.end('<h1>Not found</h1>');
    }
    if (req.url === '/pixel.svg') {
      res.setHeader('Content-Type', 'image/svg+xml');
      return res.end(
        '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="60"><rect width="100" height="60" fill="#97af80"/></svg>',
      );
    }
    if (req.url === '/gzip') {
      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Content-Encoding', 'gzip');
      return res.end(
        zlib.gzipSync(
          html('A compressed response with a proper title', '<h1>Compressed page</h1>'),
        ),
      );
    }
    if (req.url === '/slow')
      return setTimeout(() => {
        if (!res.destroyed) {
          res.setHeader('Content-Type', 'text/html');
          res.end(html('Slow website for cancellation verification', '<h1>Slow page</h1>'));
        }
      }, 2000).unref();
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (req.url === '/about')
      return res.end(
        html(
          'Giới thiệu về một website mẫu',
          variant === 'fixed'
            ? '<h1>Về chúng tôi</h1><h1>Thêm H1 để xác minh lỗi mới</h1><a href="/">Trang chủ</a><img src="/pixel.svg" alt="Giới thiệu">'
            : '<h1>Về chúng tôi</h1><a href="/">Trang chủ</a><img src="/pixel.svg"><small>Chữ nhỏ cần được cải thiện.</small>',
          variant === 'fixed'
            ? 'Trang giới thiệu với mô tả đầy đủ, giúp kiểm chứng lỗi SEO đã được sửa bằng một lượt quét mới trên cùng URL và cùng thiết bị.'
            : '',
        ),
      );
    if (req.url === '/layout')
      return res.end(
        html(
          'Kiểm tra bố cục mobile và desktop',
          '<h1>Trang có tràn màn hình</h1><div class="overflow">Nội dung rộng cố định</div>',
        ),
      );
    return res.end(
      html(
        'Một website mẫu để kiểm tra chất lượng',
        '<h1>Những thay đổi nhỏ. Một website tốt hơn.</h1><p>Trang kiểm thử có chủ đích: mô tả SEO, ảnh thiếu alt, liên kết lỗi và liên kết bị chặn.</p><a href="/about">Giới thiệu</a><a href="/missing">Liên kết lỗi</a><a href="/redirect">Chuyển hướng</a><a href="/restricted">Liên kết cần xác minh</a><a href="/private">Robots chặn</a><a href="/layout">Bố cục</a><img width="100" height="60" src="/pixel.svg" alt="Minh họa"/><button>Liên hệ ngay</button><script>const a=document.createElement("a");a.href="/dynamic-link";a.textContent="Link tạo bằng JavaScript";document.body.append(a)</script>',
        'Website thử nghiệm giúp xác minh đầy đủ quy trình audit: kiểm tra tốc độ, giao diện điện thoại, mã HTTP của liên kết và SEO trên nhiều trang.',
      ),
    );
  });
  fixture.listen(0, '127.0.0.1');
  await once(fixture, 'listening');
  return {
    fixture,
    url: `http://127.0.0.1:${fixture.address().port}`,
    requests,
    setVariant: (value) => {
      variant = value;
    },
  };
}
