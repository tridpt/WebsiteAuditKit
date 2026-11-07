import dns from 'node:dns/promises';
import net from 'node:net';
import { performance } from 'node:perf_hooks';
import { gunzip, inflate, brotliDecompress } from 'node:zlib';
import { promisify } from 'node:util';
import { Agent, request } from 'undici';
import ipaddr from 'ipaddr.js';

const decompress = {
  gzip: promisify(gunzip),
  deflate: promisify(inflate),
  br: promisify(brotliDecompress),
};

export class AuditError extends Error {
  constructor(message, code = 'AUDIT_ERROR') {
    super(message);
    this.code = code;
  }
}

export function normalizeUrl(input) {
  if (typeof input !== 'string' || input.trim().length < 3 || input.length > 2048)
    throw new AuditError('Nhập URL website hợp lệ, ví dụ https://example.com.', 'INVALID_URL');
  let value = input.trim();
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(value)) value = `https://${value}`;
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new AuditError('URL không hợp lệ. Vui lòng kiểm tra lại tên miền.', 'INVALID_URL');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new AuditError(
      'Chỉ hỗ trợ URL HTTP/HTTPS không chứa thông tin đăng nhập.',
      'INVALID_URL',
    );
  if (!url.hostname || url.hostname.includes('%'))
    throw new AuditError('Tên miền không hợp lệ.', 'INVALID_URL');
  url.hash = '';
  return url.href;
}

export function isPublicAddress(address) {
  try {
    let parsed = ipaddr.parse(address);
    if (parsed.kind() === 'ipv6' && parsed.isIPv4MappedAddress()) parsed = parsed.toIPv4Address();
    return parsed.range() === 'unicast';
  } catch {
    return false;
  }
}

export function throwIfAborted(signal) {
  if (signal?.aborted)
    throw signal.reason instanceof Error
      ? signal.reason
      : new AuditError('Đã hủy lần kiểm tra.', 'ABORTED');
}

export class SafeNetwork {
  constructor({
    signal,
    allowLoopback = process.env.AUDIT_ALLOW_LOOPBACK === '1',
    maxRequests = 250,
    maxBytes = 35 * 1024 * 1024,
  } = {}) {
    this.signal = signal;
    this.allowLoopback = allowLoopback;
    this.maxRequests = maxRequests;
    this.maxBytes = maxBytes;
    this.requests = 0;
    this.bytes = 0;
    this.agents = new Map();
    this.dnsCache = new Map();
  }

  async validate(input) {
    throwIfAborted(this.signal);
    const url = new URL(normalizeUrl(input));
    const host = url.hostname.replace(/^\[|\]$/g, '');
    const loopbackName = host === 'localhost' || host === '127.0.0.1' || host === '::1';
    if (url.port && !['80', '443'].includes(url.port) && !(this.allowLoopback && loopbackName))
      throw new AuditError(
        'Chỉ hỗ trợ website công khai qua cổng HTTP/HTTPS tiêu chuẩn.',
        'BLOCKED_URL',
      );
    if (
      !this.allowLoopback &&
      (loopbackName ||
        /\.(local|localhost|internal|lan|home|test|invalid)$/i.test(host) ||
        (!host.includes('.') && !net.isIP(host)))
    )
      throw new AuditError(
        'Vui lòng dùng URL website công khai. Địa chỉ mạng nội bộ không được hỗ trợ.',
        'BLOCKED_URL',
      );
    let records = this.dnsCache.get(host);
    if (!records) {
      let dnsTimer;
      try {
        records = net.isIP(host)
          ? [{ address: host, family: net.isIP(host) }]
          : await Promise.race([
              dns.lookup(host, { all: true, verbatim: true }),
              new Promise((_, reject) => {
                dnsTimer = setTimeout(() => reject(new Error('DNS timeout')), 5000);
              }),
            ]);
      } catch {
        throw new AuditError(
          'Không tìm thấy tên miền. Vui lòng kiểm tra URL và kết nối Internet.',
          'DNS_ERROR',
        );
      } finally {
        clearTimeout(dnsTimer);
      }
      throwIfAborted(this.signal);
      if (!records.length) throw new AuditError('Tên miền không có địa chỉ IP.', 'DNS_ERROR');
      this.dnsCache.set(host, records);
    }
    for (const record of records) {
      const loopback = ['127.0.0.1', '::1'].includes(record.address);
      if (!isPublicAddress(record.address) && !(this.allowLoopback && loopbackName && loopback))
        throw new AuditError('URL trỏ tới địa chỉ riêng hoặc địa chỉ bị giới hạn.', 'BLOCKED_URL');
    }
    return { url, records };
  }

  async fetch(
    input,
    {
      method = 'GET',
      timeout = 10000,
      maxBytes = 3 * 1024 * 1024,
      readBody = true,
      accept = '*/*',
      userAgent = 'WebsiteAuditKit/1.0 (+local website quality audit)',
      redirects = 5,
    } = {},
  ) {
    const started = performance.now();
    const localSignal = AbortSignal.timeout(timeout);
    const signal = this.signal ? AbortSignal.any([this.signal, localSignal]) : localSignal;
    let current = input;
    let firstTtfb = null;
    const chain = [];
    for (let i = 0; i <= redirects; i++) {
      throwIfAborted(signal);
      const { url, records } = await this.validate(current);
      if (++this.requests > this.maxRequests)
        throw new AuditError('Đã đạt giới hạn số yêu cầu của lần kiểm tra.', 'REQUEST_LIMIT');
      const key = url.origin;
      if (!this.agents.has(key)) {
        const record = records.find((item) => item.family === 4) || records[0];
        this.agents.set(
          key,
          new Agent({
            connections: 4,
            connect: {
              timeout: 8000,
              lookup: (_host, opts, callback) =>
                opts.all ? callback(null, [record]) : callback(null, record.address, record.family),
            },
          }),
        );
      }
      let response;
      try {
        response = await request(url, {
          dispatcher: this.agents.get(key),
          method,
          signal,
          maxRedirections: 0,
          headersTimeout: timeout,
          bodyTimeout: timeout,
          headers: {
            'user-agent': userAgent,
            accept,
            'accept-encoding': 'identity',
          },
        });
      } catch (error) {
        throwIfAborted(this.signal);
        if (
          error.name === 'TimeoutError' ||
          error.name === 'AbortError' ||
          error.code?.includes('TIMEOUT')
        )
          throw new AuditError(
            'Website phản hồi quá chậm hoặc không thể kết nối trong thời gian cho phép.',
            'TIMEOUT',
          );
        throw new AuditError(
          `Không thể tải website (${error.code || 'lỗi kết nối'}).`,
          'FETCH_ERROR',
        );
      }
      firstTtfb ??= Math.round(performance.now() - started);
      const { statusCode: status, headers, body } = response;
      // Destroying an unread Undici body emits AbortError on the stream.
      body.on('error', () => {});
      if ([301, 302, 303, 307, 308].includes(status) && headers.location) {
        body.destroy();
        chain.push({ url: url.href, status });
        if (i === redirects)
          throw new AuditError('Website chuyển hướng quá nhiều lần.', 'REDIRECT_LIMIT');
        current = new URL(headers.location, url).href;
        continue;
      }
      const chunks = [];
      let size = 0;
      if (readBody && method !== 'HEAD') {
        try {
          for await (const chunk of body) {
            size += chunk.length;
            this.bytes += chunk.length;
            if (size > maxBytes || this.bytes > this.maxBytes) {
              body.destroy();
              throw new AuditError(
                'Tài nguyên vượt quá giới hạn dung lượng cho phép.',
                'BODY_LIMIT',
              );
            }
            chunks.push(chunk);
          }
        } catch (error) {
          throwIfAborted(this.signal);
          throw error;
        }
      } else body.destroy();
      let decoded = Buffer.concat(chunks);
      const encoding = String(headers['content-encoding'] || '')
        .toLowerCase()
        .trim();
      if (decoded.length && decompress[encoding]) {
        try {
          decoded = await decompress[encoding](decoded, { maxOutputLength: maxBytes });
        } catch {
          throw new AuditError(
            'Không giải nén được tài nguyên hoặc nội dung vượt giới hạn.',
            'BODY_LIMIT',
          );
        }
      }
      return {
        url: url.href,
        status,
        headers,
        body: decoded,
        bytes: size,
        ttfb: firstTtfb,
        duration: Math.round(performance.now() - started),
        redirects: chain,
      };
    }
  }

  async close() {
    await Promise.allSettled([...this.agents.values()].map((agent) => agent.destroy()));
  }
}

export async function mapLimit(items, concurrency, callback) {
  const output = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        output[index] = await callback(items[index], index);
      }
    }),
  );
  return output;
}
