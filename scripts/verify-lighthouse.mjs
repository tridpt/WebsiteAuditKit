import assert from 'node:assert/strict';
import http from 'node:http';
import { gzipSync } from 'node:zlib';
import { once } from 'node:events';
import { inspectLighthouse } from '../server/lighthouse.mjs';

const requests = [];
const fixture = http.createServer((req, res) => {
  requests.push({ url: req.url, method: req.method });
  if (req.url === '/redirect-private') {
    res.writeHead(302, { Location: 'http://169.254.169.254/latest' });
    return res.end();
  }
  if (req.url === '/worker.js' || req.url === '/sw.js') {
    res.setHeader('Content-Type', 'text/javascript');
    return res.end(
      "fetch('/worker-write', {method:'POST'}).catch(()=>{});fetch('/worker-get').catch(()=>{});",
    );
  }
  res.setHeader('Content-Type', 'text/html');
  res.setHeader('Content-Encoding', 'gzip');
  res.end(
    gzipSync(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lighthouse network guard test</title></head><body>
    <h1>Compressed content rendered by Lighthouse</h1><p>A visible page for real FCP and LCP measurements.</p>
    <script>
      fetch('/state-write', {method:'POST'}).catch(()=>{});
      fetch('/redirect-private').catch(()=>{});
      try { new Worker('/worker.js'); } catch {}
      try { window.open('/popup-get'); } catch {}
      try { new WebSocket('ws://' + location.host + '/socket-write'); } catch {}
      navigator.serviceWorker?.register('/sw.js').catch(()=>{});
    </script></body></html>`),
  );
});
fixture.on('upgrade', (req, socket) => {
  requests.push({ url: req.url, method: 'UPGRADE' });
  socket.destroy();
});
fixture.listen(0, '127.0.0.1');
await once(fixture, 'listening');
const url = `http://127.0.0.1:${fixture.address().port}/`;
try {
  const result = await inspectLighthouse({ url, device: 'mobile', allowLoopback: true });
  assert.ok(result.available, result.error);
  assert.ok(result.metrics.fcp > 0 && result.metrics.lcp > 0);
  assert.ok(
    result.blockedResources >= 2,
    `POST and private redirect must be blocked: ${JSON.stringify({ blocked: result.blockedResources, requests })}`,
  );
  assert.ok(
    requests.every((request) => request.method === 'GET' || request.method === 'HEAD'),
    JSON.stringify(requests),
  );
  assert.ok(
    !requests.some((request) =>
      ['/state-write', '/worker-write', '/worker-get', '/popup-get', '/socket-write'].includes(
        request.url,
      ),
    ),
    JSON.stringify(requests),
  );
  console.log(
    'PASS: real Lighthouse renders gzip; POST, private redirects, worker/popup escape and WebSocket traffic are blocked.',
  );
  const controller = new AbortController();
  const cancelTimer = setTimeout(() => controller.abort(new Error('Cancel Lighthouse test')), 700);
  try {
    await assert.rejects(
      inspectLighthouse({ url, device: 'mobile', allowLoopback: true, signal: controller.signal }),
      /Cancel Lighthouse test/,
    );
  } finally {
    clearTimeout(cancelTimer);
  }
  console.log('PASS: cancellation propagates and closes the Lighthouse browser.');
  const fallback = await inspectLighthouse({
    url,
    device: 'mobile',
    allowLoopback: true,
    timeout: 500,
  });
  assert.equal(fallback.available, false);
  assert.match(fallback.error, /thời gian/);
  console.log(
    'PASS: Lighthouse timeout returns an explicit unavailable result for fallback scoring.',
  );
} finally {
  fixture.closeAllConnections();
  await new Promise((resolve) => fixture.close(resolve));
}
