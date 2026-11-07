import { AuditError } from './network.mjs';
import { readBranding, saveBranding, withBrandingLock } from './store.mjs';

export const defaultBranding = {
  agencyName: 'Website Audit Kit',
  tagline: 'Hiểu website. Cải thiện mỗi ngày.',
  footer: 'Báo cáo được tạo bằng Website Audit Kit.',
  accentColor: '#28664f',
  logoDataUrl: null,
};

const colorPattern = /^#[0-9a-f]{6}$/i;
const imagePattern = /^data:image\/(png|jpeg|webp);base64,([a-z0-9+/]+={0,2})$/i;
const maxLogoBytes = 300 * 1024;

function invalid(message) {
  throw new AuditError(message, 'INVALID_BRANDING');
}

function imageDimensions(bytes, type) {
  if (
    type === 'png' &&
    bytes.length >= 45 &&
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    bytes.readUInt32BE(8) === 13 &&
    bytes.toString('ascii', 12, 16) === 'IHDR' &&
    bytes.toString('ascii', bytes.length - 8, bytes.length - 4) === 'IEND'
  ) {
    return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
  }
  if (
    type === 'jpeg' &&
    bytes.length > 12 &&
    bytes.readUInt16BE(0) === 0xffd8 &&
    bytes.readUInt16BE(bytes.length - 2) === 0xffd9
  ) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset++] !== 0xff) break;
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if ([0xd9, 0xda].includes(marker)) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) break;
      const size = bytes.readUInt16BE(offset);
      if (size < 2 || offset + size > bytes.length) break;
      if (
        [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(
          marker,
        ) &&
        size >= 8
      )
        return [bytes.readUInt16BE(offset + 5), bytes.readUInt16BE(offset + 3)];
      offset += size;
    }
  }
  if (
    type === 'webp' &&
    bytes.length >= 26 &&
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP' &&
    bytes.readUInt32LE(4) + 8 === bytes.length
  ) {
    const chunk = bytes.toString('ascii', 12, 16);
    const size = bytes.readUInt32LE(16);
    if (size + 20 > bytes.length) return null;
    if (chunk === 'VP8X' && size >= 10)
      return [bytes.readUIntLE(24, 3) + 1, bytes.readUIntLE(27, 3) + 1];
    if (chunk === 'VP8 ' && size >= 10 && bytes.toString('hex', 23, 26) === '9d012a')
      return [bytes.readUInt16LE(26) & 0x3fff, bytes.readUInt16LE(28) & 0x3fff];
    if (chunk === 'VP8L' && size >= 5 && bytes[20] === 0x2f) {
      const dimensions = bytes.readUInt32LE(21);
      return [(dimensions & 0x3fff) + 1, ((dimensions >>> 14) & 0x3fff) + 1];
    }
  }
  return null;
}

function normalizeLogo(value) {
  if (value === null || value === '') return null;
  const match = typeof value === 'string' && imagePattern.exec(value);
  if (!match) invalid('Logo cần là ảnh PNG, JPEG hoặc WebP được tải lên từ máy này.');
  if (match[2].length > Math.ceil(maxLogoBytes / 3) * 4)
    invalid('Logo cần nhỏ hơn hoặc bằng 300 KB.');
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > maxLogoBytes) invalid('Logo cần nhỏ hơn hoặc bằng 300 KB.');
  if (bytes.toString('base64') !== match[2]) invalid('Không đọc được logo.');
  const type = match[1].toLowerCase();
  const dimensions = imageDimensions(bytes, type);
  if (!dimensions) invalid('Không đọc được ảnh logo. Hãy chọn tệp PNG, JPEG hoặc WebP hợp lệ.');
  if (dimensions.some((size) => size < 1 || size > 4096))
    invalid('Logo cần có kích thước từ 1 đến 4096 pixel mỗi chiều.');
  return `data:image/${type};base64,${match[2]}`;
}

export function validateBrandingInput(input, { partial = false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    invalid('Thông tin thương hiệu không hợp lệ.');
  const output = {};
  if (!partial || input.agencyName !== undefined) {
    if (
      typeof input.agencyName !== 'string' ||
      input.agencyName.trim().length < 1 ||
      input.agencyName.trim().length > 80
    )
      invalid('Tên agency cần dài từ 1 đến 80 ký tự.');
    output.agencyName = input.agencyName.trim();
  }
  if (!partial || input.tagline !== undefined) {
    if (typeof input.tagline !== 'string' || input.tagline.length > 160)
      invalid('Khẩu hiệu cần tối đa 160 ký tự.');
    output.tagline = input.tagline.trim();
  }
  if (!partial || input.footer !== undefined) {
    if (typeof input.footer !== 'string' || input.footer.length > 180)
      invalid('Dòng chân trang cần tối đa 180 ký tự.');
    output.footer = input.footer.trim();
  }
  if (!partial || input.accentColor !== undefined) {
    if (typeof input.accentColor !== 'string' || !colorPattern.test(input.accentColor))
      invalid('Màu nhận diện cần dùng mã HEX gồm 6 ký tự.');
    output.accentColor = input.accentColor.toLowerCase();
  }
  if (!partial || input.logoDataUrl !== undefined)
    output.logoDataUrl = normalizeLogo(input.logoDataUrl);
  return output;
}

export async function getBranding() {
  const stored = await readBranding();
  if (!stored) return { ...defaultBranding };
  return { ...defaultBranding, ...validateBrandingInput(stored, { partial: true }) };
}

export async function updateBranding(patch) {
  const values = validateBrandingInput(patch, { partial: true });
  return withBrandingLock(async () => {
    const current = await getBranding();
    const next = { ...current, ...values };
    await saveBranding(next);
    return next;
  });
}
