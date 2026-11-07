import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Check, ImagePlus, LoaderCircle, Palette, RotateCcw, Trash2, Upload } from 'lucide-react';
import type { Branding } from './types';

export const defaultBranding: Branding = {
  agencyName: 'Website Audit Kit',
  tagline: 'Hiểu website. Cải thiện mỗi ngày.',
  footer: 'Báo cáo được tạo bằng Website Audit Kit.',
  accentColor: '#28664f',
  logoDataUrl: null,
};

export function BrandingSettings({
  branding,
  onSave,
  onUseGlobal,
}: {
  branding: Branding;
  onSave: (branding: Branding) => Promise<void>;
  onUseGlobal?: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<Branding>({ ...branding });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const uploadVersion = useRef(0);
  useEffect(
    () => () => {
      uploadVersion.current++;
    },
    [],
  );

  function update<K extends keyof Branding>(key: K, value: Branding[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function uploadLogo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const version = ++uploadVersion.current;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setError('Chọn logo PNG, JPEG hoặc WebP.');
      return;
    }
    if (file.size > 300 * 1024) {
      setError('Logo cần nhỏ hơn hoặc bằng 300 KB.');
      return;
    }
    setUploading(true);
    setError('');
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () =>
          typeof reader.result === 'string'
            ? resolve(reader.result)
            : reject(new Error('Không đọc được logo.'));
        reader.onerror = () => reject(new Error('Không đọc được logo.'));
        reader.readAsDataURL(file);
      });
      const picture = new Image();
      picture.src = dataUrl;
      await picture.decode();
      if (picture.naturalWidth > 4096 || picture.naturalHeight > 4096)
        throw new Error('Logo cần tối đa 4096 pixel mỗi chiều.');
      if (version === uploadVersion.current) {
        setError('');
        update('logoDataUrl', dataUrl);
      }
    } catch (uploadError) {
      if (version === uploadVersion.current)
        setError(
          uploadError instanceof DOMException
            ? 'Không đọc được ảnh logo. Hãy chọn tệp PNG, JPEG hoặc WebP hợp lệ.'
            : (uploadError as Error).message,
        );
    } finally {
      if (version === uploadVersion.current) setUploading(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (!draft.agencyName.trim()) {
      setError('Nhập tên agency để hiển thị trên báo cáo.');
      return;
    }
    setSaving(true);
    try {
      await onSave({
        ...draft,
        agencyName: draft.agencyName.trim(),
        tagline: draft.tagline.trim(),
        footer: draft.footer.trim(),
      });
    } catch (saveError) {
      setError((saveError as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setDraft({ ...defaultBranding });
    setError('');
  }

  return (
    <form className="branding-settings" onSubmit={submit}>
      <p className="branding-lead">
        Đặt tên, logo và màu nhận diện để dùng khi xuất báo cáo gửi khách hàng.
      </p>
      <section
        className="branding-preview"
        aria-label="Xem trước nhận diện báo cáo"
        style={{ borderTopColor: draft.accentColor }}
      >
        <p className="branding-preview-label">Xem trước nhận diện</p>
        <div className="branding-preview-header">
          {draft.logoDataUrl ? (
            <img src={draft.logoDataUrl} alt="Xem trước logo" />
          ) : (
            <span className="branding-preview-mark">
              <Palette size={19} />
            </span>
          )}
          <div>
            <strong>{draft.agencyName || 'Tên agency của bạn'}</strong>
            {draft.tagline && <p>{draft.tagline}</p>}
          </div>
        </div>
        <h3>Báo cáo sức khỏe website</h3>
        <p className="branding-preview-summary">Tốc độ · Mobile · Liên kết · SEO</p>
        {draft.footer && <p className="branding-preview-footer">{draft.footer}</p>}
      </section>
      <fieldset className="branding-fields" disabled={saving || uploading}>
        <label>
          Tên agency
          <input
            aria-label="Tên agency"
            value={draft.agencyName}
            onChange={(event) => update('agencyName', event.target.value)}
            maxLength={80}
            required
          />
        </label>
        <label>
          Khẩu hiệu <span className="field-hint">tùy chọn</span>
          <input
            aria-label="Khẩu hiệu báo cáo"
            value={draft.tagline}
            onChange={(event) => update('tagline', event.target.value)}
            maxLength={160}
            placeholder="Ví dụ: Chiến lược số cho thương hiệu tốt hơn"
          />
        </label>
        <label>
          Dòng chân trang <span className="field-hint">tùy chọn</span>
          <input
            aria-label="Dòng chân trang báo cáo"
            value={draft.footer}
            onChange={(event) => update('footer', event.target.value)}
            maxLength={180}
            placeholder="Thông tin liên hệ hoặc tên công ty"
          />
        </label>
        <label className="branding-color-field">
          Màu nhận diện
          <span className="branding-color-control">
            <input
              aria-label="Màu nhận diện báo cáo"
              type="color"
              value={draft.accentColor}
              onChange={(event) => update('accentColor', event.target.value)}
            />
            <code>{draft.accentColor.toUpperCase()}</code>
          </span>
        </label>
        <div className="branding-logo-field">
          <span>
            Logo <small>PNG, JPEG, WebP · 300 KB · tối đa 4096 px</small>
          </span>
          <div className="branding-logo-actions">
            <label className="button secondary branding-upload">
              {uploading ? <LoaderCircle size={14} className="spin" /> : <Upload size={14} />}
              {uploading ? 'Đang đọc logo…' : draft.logoDataUrl ? 'Đổi logo' : 'Tải logo'}
              <input
                aria-label="Tải logo agency"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={uploadLogo}
              />
            </label>
            {draft.logoDataUrl && (
              <button
                className="text-button"
                type="button"
                onClick={() => update('logoDataUrl', null)}
              >
                <Trash2 size={13} />
                Xóa logo
              </button>
            )}
          </div>
        </div>
      </fieldset>
      {error && (
        <p className="branding-error" role="alert">
          {error}
        </p>
      )}
      <div className="branding-actions">
        {onUseGlobal && (
          <button
            className="button secondary"
            type="button"
            disabled={saving || uploading}
            onClick={async () => {
              setSaving(true);
              setError('');
              try {
                await onUseGlobal();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setSaving(false);
              }
            }}
          >
            Dùng cấu hình chung
          </button>
        )}
        <button
          className="button secondary"
          type="button"
          disabled={saving || uploading}
          onClick={reset}
        >
          <RotateCcw size={14} />
          Dùng mặc định
        </button>
        <button className="button primary" type="submit" disabled={saving || uploading}>
          {saving ? <LoaderCircle size={14} className="spin" /> : <Check size={14} />}Lưu cấu hình
        </button>
      </div>
      <p className="branding-note">
        <ImagePlus size={14} /> Logo và thông tin này chỉ lưu trên máy chạy ứng dụng, rồi được đưa
        vào các bản xuất mới.
      </p>
    </form>
  );
}
