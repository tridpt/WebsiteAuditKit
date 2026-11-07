import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { gzipSync } from 'node:zlib';
import { SafeNetwork, normalizeUrl, isPublicAddress } from '../server/network.mjs';

test('normalize URL and reject credentials or unsupported protocols', () => {
  assert.equal(normalizeUrl(' example.com/path#section '), 'https://example.com/path');
  for (const value of [
    'ftp://example.com',
    'file:///etc/passwd',
    'https://name:pass@example.com',
    '',
    'http://',
  ])
    assert.throws(() => normalizeUrl(value));
});

test('public address guard rejects private, metadata, reserved and mapped IPv6', () => {
  for (const ip of [
    '127.0.0.1',
    '10.0.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '0.0.0.0',
    '224.0.0.1',
    '::1',
    'fe80::1',
    'fc00::1',
    '::ffff:127.0.0.1',
  ])
    assert.equal(isPublicAddress(ip), false, ip);
  for (const ip of ['1.1.1.1', '8.8.8.8', '2606:4700:4700::1111'])
    assert.equal(isPublicAddress(ip), true, ip);
});

test('URL validation blocks numeric aliases and internal hosts before making a request', async () => {
  const network = new SafeNetwork({ allowLoopback: false });
  for (const url of [
    'http://localhost',
    'http://127.1',
    'http://2130706433',
    'http://0x7f000001',
    'http://[::ffff:127.0.0.1]',
    'http://169.254.169.254',
    'http://printer.local',
    'https://example.com:444',
  ])
    await assert.rejects(network.validate(url));
  await network.close();
});

test('fetch pins allowed addresses, limits bodies, checks redirects, and handles cancellation', async (t) => {
  const fixture = http.createServer((req, res) => {
    if (req.url === '/redirect-private') {
      res.writeHead(302, { Location: 'http://169.254.169.254/latest' });
      return res.end();
    }
    if (req.url === '/big') return res.end('x'.repeat(2048));
    if (req.url === '/gzip') {
      res.setHeader('Content-Encoding', 'gzip');
      return res.end(gzipSync('<h1>Compressed</h1>'));
    }
    res.setHeader('Content-Type', 'text/html');
    res.end('<h1>Hello</h1>');
  });
  fixture.listen(0, '127.0.0.1');
  await once(fixture, 'listening');
  t.after(() => fixture.close());
  const base = `http://127.0.0.1:${fixture.address().port}`;
  const network = new SafeNetwork({ allowLoopback: true });
  t.after(() => network.close());
  const response = await network.fetch(base);
  assert.equal(response.status, 200);
  assert.match(response.body.toString(), /Hello/);
  assert.equal((await network.fetch(`${base}/gzip`)).body.toString(), '<h1>Compressed</h1>');
  await assert.rejects(network.fetch(`${base}/big`, { maxBytes: 100 }), { code: 'BODY_LIMIT' });
  await assert.rejects(network.fetch(`${base}/redirect-private`), { code: 'BLOCKED_URL' });
  const controller = new AbortController();
  controller.abort(new Error('cancelled'));
  const cancelled = new SafeNetwork({ allowLoopback: true, signal: controller.signal });
  await assert.rejects(cancelled.fetch(base), /cancelled/);
  await cancelled.close();
});
