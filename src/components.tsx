import { useState, type ReactNode } from 'react';
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Code2,
  ExternalLink,
  FileSearch,
  Gauge,
  Globe2,
  Info,
  Leaf,
  Link2,
  LoaderCircle,
  Monitor,
  Search,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Target,
  TriangleAlert,
  X,
} from 'lucide-react';
import type { Category, Check as CheckType, Job, Report } from './types';

export const categoryMeta = {
  performance: { label: 'Tốc độ', icon: Gauge, color: 'amber' },
  mobile: { label: 'Mobile', icon: Smartphone, color: 'green' },
  links: { label: 'Liên kết', icon: Link2, color: 'blue' },
  seo: { label: 'SEO', icon: Search, color: 'purple' },
};
export const categoryKeys = Object.keys(categoryMeta) as Category[];
export const severityLabels = { high: 'Ưu tiên cao', medium: 'Nên cải thiện', low: 'Tối ưu thêm' };
export const dateTime = (value: string) =>
  new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Asia/Bangkok',
  }).format(new Date(value));
export const scoreLabel = (score: number | null) =>
  score === null
    ? 'Chưa đo được'
    : score >= 90
      ? 'Rất tốt'
      : score >= 75
        ? 'Khá tốt'
        : score >= 50
          ? 'Cần cải thiện'
          : 'Cần chú ý';
export const scoreColor = (score: number | null) =>
  score !== null && score >= 90 ? 'green' : score !== null && score >= 50 ? 'amber' : 'red';

export function Brand() {
  return (
    <div className="brand">
      <span className="brand-symbol">
        <CheckCheck size={25} strokeWidth={2.2} />
      </span>
      <span>
        Website
        <span className="brand-second">
          Audit Kit<span className="brand-dot">.</span>
        </span>
      </span>
    </div>
  );
}

export function HeroArt() {
  return (
    <div className="hero-art" aria-hidden="true">
      <div className="orbit orbit-one" />
      <div className="orbit orbit-two" />
      <div className="orbit-dot" />
      <div className="art-window">
        <div className="art-dots">
          <i />
          <i />
          <i />
          <span />
        </div>
        <div className="art-content">
          <span className="art-check">
            <Check size={18} />
          </span>
          <div>
            <b />
            <i />
          </div>
          <svg viewBox="0 0 144 48">
            <path
              d="M1 40 25 33 45 36 67 19 86 24 108 9 142 2"
              fill="none"
              stroke="#39775a"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path d="M1 40 25 33 45 36 67 19 86 24 108 9 142 2V48H1Z" fill="url(#area)" />
            <defs>
              <linearGradient id="area" x1="0" x2="0" y1="0" y2="1">
                <stop stopColor="#bdd5ad" stopOpacity=".65" />
                <stop offset="1" stopColor="#bdd5ad" stopOpacity="0" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      </div>
      <span className="art-spark">
        <Sparkles size={19} />
      </span>
      <span className="art-label">
        <span /> Một chút tốt hơn, mỗi ngày
      </span>
    </div>
  );
}

export function AuditForm({
  url,
  setUrl,
  device,
  setDevice,
  maxPages,
  setMaxPages,
  busy,
  onSubmit,
  inputRef,
}: {
  url: string;
  setUrl: (s: string) => void;
  device: 'mobile' | 'desktop';
  setDevice: (s: 'mobile' | 'desktop') => void;
  maxPages: number;
  setMaxPages: (n: number) => void;
  busy: boolean;
  onSubmit: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <form
      className="audit-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className="form-label-row">
        <label htmlFor="website-url">Website bạn muốn cải thiện</label>
        <span>
          <ShieldCheck size={13} /> Chỉ kiểm tra trang công khai
        </span>
      </div>
      <div className="url-row">
        <div className="url-input">
          <Globe2 size={20} />
          <input
            ref={inputRef}
            id="website-url"
            autoComplete="url"
            inputMode="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://website-cua-ban.com"
            required
            maxLength={2048}
            disabled={busy}
          />
          <kbd>URL</kbd>
        </div>
        <button className="button primary scan-button" disabled={busy} type="submit">
          {busy ? (
            <>
              <LoaderCircle size={17} className="spin" /> Đang kiểm tra
            </>
          ) : (
            <>
              Kiểm tra website <ArrowRight size={17} />
            </>
          )}
        </button>
      </div>
      <div className="form-options">
        <div className="device-picker" role="group" aria-label="Thiết bị đo tốc độ">
          <button
            type="button"
            className={device === 'mobile' ? 'active' : ''}
            onClick={() => setDevice('mobile')}
            disabled={busy}
          >
            <Smartphone size={14} /> Mobile
          </button>
          <button
            type="button"
            className={device === 'desktop' ? 'active' : ''}
            onClick={() => setDevice('desktop')}
            disabled={busy}
          >
            <Monitor size={15} /> Desktop
          </button>
        </div>
        <span className="option-divider" />
        <label className="pages-option">
          Phạm vi{' '}
          <select
            aria-label="Số trang tối đa"
            value={maxPages}
            onChange={(e) => setMaxPages(Number(e.target.value))}
            disabled={busy}
          >
            <option value="1">1 trang</option>
            <option value="5">Tối đa 5 trang</option>
            <option value="10">Tối đa 10 trang</option>
          </select>
        </label>
        <span className="form-footnote">
          <span /> Không cần API key
        </span>
      </div>
    </form>
  );
}

export function JobProgress({
  job,
  cancelling,
  onCancel,
}: {
  job: Job;
  cancelling: boolean;
  onCancel: () => void;
}) {
  return (
    <section className="job-progress" aria-live="polite">
      <div className="job-icon">
        <LoaderCircle size={22} className="spin" />
      </div>
      <div className="job-body">
        <div className="job-top">
          <strong>{job.message}</strong>
          <span>{job.progress}%</span>
        </div>
        <div className="progress-track">
          <span style={{ width: `${job.progress}%` }} />
        </div>
        <div className="job-bottom">
          <span>{job.url} · Thường mất 20–90 giây</span>
          <button type="button" className="text-button" onClick={onCancel} disabled={cancelling}>
            {cancelling ? 'Đang hủy…' : 'Hủy kiểm tra'}
          </button>
        </div>
      </div>
    </section>
  );
}

export function ScoreCards({
  report,
  onCategory,
}: {
  report: Report;
  onCategory: (category: Category) => void;
}) {
  const color = scoreColor(report.score);
  const circumference = 2 * Math.PI * 39;
  return (
    <div className="score-grid">
      <div className="total-score score-card">
        <div className={`score-ring ${color}`}>
          <svg viewBox="0 0 90 90">
            <circle className="ring-bg" cx="45" cy="45" r="39" />
            <circle
              className="ring-fill"
              cx="45"
              cy="45"
              r="39"
              strokeDasharray={`${((report.score || 0) / 100) * circumference} ${circumference}`}
            />
          </svg>
          <span>
            <strong>{report.score ?? '—'}</strong>
            <small>/ 100</small>
          </span>
        </div>
        <div>
          <p>Tổng điểm</p>
          <strong className="score-status">{scoreLabel(report.score)}</strong>
          <span className="score-source">Website Audit Kit</span>
        </div>
      </div>
      {categoryKeys.map((key) => {
        const meta = categoryMeta[key];
        const cat = report.categories[key];
        const Icon = meta.icon;
        return (
          <button
            className={`score-card category-card ${meta.color}`}
            key={key}
            onClick={() => onCategory(key)}
          >
            <div className="category-top">
              <span className={`icon-square ${meta.color}`}>
                <Icon size={17} />
              </span>
              <span>{meta.label}</span>
              <ChevronRight size={13} className="category-arrow" />
            </div>
            <div className="category-value">
              {cat.score ?? '—'}
              <span>/100</span>
            </div>
            <div className="category-bar">
              <span style={{ width: `${cat.score || 0}%` }} />
            </div>
            <div className="category-note">
              {key === 'performance' && report.lighthouse?.available
                ? `Lighthouse ${report.lighthouse.version}`
                : `${cat.passed}/${cat.total} kiểm tra đạt`}
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function IssueList({
  checks,
  onToggle,
  pendingId,
  compact = false,
}: {
  checks: CheckType[];
  onToggle: (check: CheckType) => void;
  pendingId: string | null;
  compact?: boolean;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  if (!checks.length)
    return (
      <div className="all-clear">
        <span>
          <CheckCircle2 size={27} />
        </span>
        <h3>Đã gọn gàng hơn rồi!</h3>
        <p>Không có việc cần sửa phù hợp với bộ lọc hiện tại.</p>
      </div>
    );
  return (
    <div className={`issue-list ${compact ? 'compact' : ''}`}>
      {checks.map((check) => (
        <article
          key={check.id}
          className={`issue ${check.done ? 'done' : ''} ${expanded === check.id ? 'expanded' : ''}`}
        >
          <div className="issue-row">
            <button
              className="task-check"
              disabled={pendingId === check.id}
              onClick={() => onToggle(check)}
              aria-label={`${check.done ? 'Đánh dấu chưa hoàn thành' : 'Đánh dấu hoàn thành'}: ${check.title}`}
              aria-pressed={check.done}
            >
              {pendingId === check.id ? (
                <LoaderCircle size={13} className="spin" />
              ) : check.done ? (
                <Check size={13} />
              ) : null}
            </button>
            <button
              className="issue-content"
              aria-expanded={expanded === check.id}
              onClick={() => setExpanded(expanded === check.id ? null : check.id)}
            >
              <span className="issue-title">{check.title}</span>
              <span className="issue-meta">
                <span>{categoryMeta[check.category].label}</span>
                <i /> <Clock3 size={11} /> {check.effort}
              </span>
            </button>
            <span className={`priority ${check.severity}`}>
              <i />
              {severityLabels[check.severity]}
            </span>
            <button
              className="icon-button issue-expand"
              aria-label={`Xem hướng sửa: ${check.title}`}
              onClick={() => setExpanded(expanded === check.id ? null : check.id)}
            >
              <ChevronDown size={16} />
            </button>
          </div>
          {expanded === check.id && (
            <div className="issue-detail">
              <p>{check.description}</p>
              <div className="recommendation">
                <Sparkles size={16} />
                <div>
                  <strong>Gợi ý cách sửa</strong>
                  <p>{check.recommendation}</p>
                </div>
              </div>
              {check.evidence.length > 0 && (
                <div className="evidence">
                  <span>BẰNG CHỨNG</span>
                  {check.evidence.map((line, i) => (
                    <code key={i}>{line}</code>
                  ))}
                </div>
              )}
              {check.urls.length > 0 && (
                <div className="affected">
                  <span>Trang liên quan</span>
                  {[...new Set(check.urls)].slice(0, 5).map((url) => (
                    <a key={url} href={url} target="_blank" rel="noreferrer">
                      {url}
                      <ExternalLink size={11} />
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

export function DemoSite() {
  return (
    <div className="demo-site">
      <div className="demo-nav">
        <strong>
          mộc<span>studio.</span>
        </strong>
        <span>studio sáng tạo độc lập</span>
        <i>
          <ArrowRight size={10} />
        </i>
      </div>
      <div className="demo-main">
        <small>THIẾT KẾ TỪ NHỮNG ĐIỀU GIẢN ĐƠN</small>
        <h3>
          Ít hơn.
          <br />
          Nhưng tốt hơn<span>.</span>
        </h3>
        <p>
          Một chút tinh tế. Một chút khác biệt.
          <br />
          Và rất nhiều điều có ý nghĩa.
        </p>
        <span className="demo-cta">
          Khám phá dự án <ArrowRight size={10} />
        </span>
      </div>
      <svg className="demo-plant" viewBox="0 0 160 200" aria-hidden="true">
        <ellipse cx="83" cy="188" rx="52" ry="7" fill="#dcd6c5" />
        <path d="M51 134h63l-8 45q-23 22-47 0z" fill="#ae7856" />
        <path d="M82 137V58m0 65 33-44M82 101 50 64" fill="none" stroke="#57704f" strokeWidth="3" />
        <path
          d="M82 78C38 49 59 14 82 22c23-8 44 27 0 56M94 107c0-43 34-54 47-36 14 21-13 45-47 36M73 93C30 96 13 68 29 51c20-15 41 9 44 42"
          fill="#78886b"
        />
        <path
          d="M82 80V34m15 69 33-29M70 86 35 59"
          fill="none"
          stroke="#dce2ca"
          strokeWidth="1.2"
        />
      </svg>
      <div className="demo-bottom">
        <span>01 / TINH GIẢN ĐỂ NỔI BẬT</span>
        <span>Made with care ↗</span>
      </div>
    </div>
  );
}

export function WebsitePreview({
  report,
  onImage,
}: {
  report: Report;
  onImage: (src: string, label: string) => void;
}) {
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const data = report.browser[device];
  const src =
    report.id !== 'demo' && data?.screenshot
      ? `/api/reports/${report.id}/screenshots/${data.screenshot}`
      : null;
  return (
    <section className="panel preview-panel">
      <div className="panel-heading">
        <h3>Góc nhìn website</h3>
        <div className="preview-toggles" role="group" aria-label="Ảnh chụp thiết bị">
          <button
            className={device === 'desktop' ? 'active' : ''}
            onClick={() => setDevice('desktop')}
            aria-label="Ảnh desktop"
            aria-pressed={device === 'desktop'}
          >
            <Monitor size={15} />
          </button>
          <button
            className={device === 'mobile' ? 'active' : ''}
            onClick={() => setDevice('mobile')}
            aria-label="Ảnh mobile"
            aria-pressed={device === 'mobile'}
          >
            <Smartphone size={14} />
          </button>
        </div>
      </div>
      <div className="browser-frame">
        <div className="browser-chrome">
          <div>
            <i />
            <i />
            <i />
          </div>
          <span>
            <ShieldCheck size={9} />
            {report.title}
          </span>
          <ExternalLink size={10} />
        </div>
        <div className={`preview-viewport ${device}`}>
          {report.id === 'demo' ? (
            <DemoSite />
          ) : src ? (
            <button
              className="screenshot-button"
              onClick={() => onImage(src, `Ảnh ${device} — ${report.title}`)}
            >
              <img src={src} alt={`Ảnh website ${report.title} trên ${device}`} />
              <span>
                Nhấn để phóng to <Search size={12} />
              </span>
            </button>
          ) : (
            <div className="preview-unavailable">
              <Monitor size={30} />
              <p>Chưa có ảnh chụp</p>
              <small>{report.browser.warning || 'Trình duyệt chưa trả về ảnh.'}</small>
            </div>
          )}
        </div>
      </div>
      <div className="preview-caption">
        <span className="status-dot" />
        {report.id === 'demo'
          ? 'Minh họa giao diện'
          : `Ảnh chụp ${device === 'mobile' ? '390' : '1440'}px`}
        <span>Chỉ trang đầu</span>
      </div>
    </section>
  );
}

export function ScopeNote({ report, onHelp }: { report: Report; onHelp: () => void }) {
  return (
    <div className="scope-note">
      <div className="scope-title">
        <Info size={16} />
        <strong>Đọc kết quả đúng cách</strong>
      </div>
      <p>
        Đã đọc <b>{report.scope.scannedPages} trang</b> và thử{' '}
        <b>{report.scope.checkedLinks} liên kết</b>. Mobile kiểm tra trên trang đầu.{' '}
        {report.lighthouse?.available
          ? 'Tốc độ dùng điểm Lighthouse cục bộ; các hạng mục khác dùng thang điểm Audit Kit.'
          : 'Điểm là thang đo riêng của Audit Kit; báo cáo này chưa có Lighthouse.'}
      </p>
      <button className="text-button" onClick={onHelp}>
        Phạm vi & cách tính điểm <ArrowRight size={13} />
      </button>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon?: ReactNode;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">{icon || <FileSearch size={30} />}</div>
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </div>
  );
}

export function CategoryDetail({
  category,
  report,
  onToggle,
  pendingId,
  onImage,
}: {
  category: Category;
  report: Report;
  onToggle: (c: CheckType) => void;
  pendingId: string | null;
  onImage: (src: string, label: string) => void;
}) {
  const [linkFilter, setLinkFilter] = useState('all');
  const checks = report.checks.filter((c) => c.category === category);
  const issues = checks.filter((c) => ['warn', 'fail'].includes(c.status));
  const passed = checks.filter((c) => c.status === 'pass');
  const meta = categoryMeta[category];
  const lh = report.lighthouse;
  const metrics = lh?.available ? lh.metrics : report.browser.performance;
  return (
    <div className="category-detail">
      <div className="detail-intro">
        <span className={`icon-square ${meta.color}`}>
          <meta.icon size={22} />
        </span>
        <div>
          <h3>
            {category === 'mobile'
              ? 'Trải nghiệm trên màn hình nhỏ'
              : category === 'performance'
                ? 'Mỗi giây đều có ý nghĩa'
                : category === 'links'
                  ? 'Mỗi đường dẫn đều có điểm đến'
                  : 'Giúp website dễ được tìm thấy'}
          </h3>
          <p>
            {category === 'seo'
              ? `Phân tích HTML máy chủ của ${report.scope.scannedPages} trang đã đọc.`
              : category === 'links'
                ? `${report.scope.checkedLinks} liên kết đã thử / ${report.scope.discoveredLinks} URL phát hiện. Kiểm tra trạng thái HTTP, chưa xác minh nội dung trang đích.`
                : 'Kiểm tra trên trang đầu; kết quả phụ thuộc mạng và máy chạy ứng dụng.'}
          </p>
        </div>
      </div>
      {category === 'performance' && (
        <>
          <div className={`lighthouse-source ${lh?.available ? 'measured' : ''}`}>
            <div>
              <strong>
                {lh?.available ? `Lighthouse ${lh.version}` : 'Số đo Website Audit Kit'}
              </strong>
              <p>
                {lh?.available
                  ? `${lh.device === 'mobile' ? 'Mobile · Slow 4G mô phỏng' : 'Desktop · mạng mô phỏng'} · Đo trên máy này`
                  : lh?.error
                    ? `Lighthouse chưa khả dụng: ${lh.error}`
                    : 'Báo cáo này chưa có dữ liệu Lighthouse.'}
              </p>
            </div>
            {lh?.available && (
              <span className="lighthouse-score">
                {lh.score}
                <small>/100</small>
              </span>
            )}
          </div>
          <div className="metric-grid">
            {[
              {
                label: 'TTFB',
                value: report.pages[0]?.ttfb,
                suffix: 'ms',
                help: 'Phản hồi máy chủ',
                threshold: 800,
              },
              {
                label: 'FCP',
                value: metrics?.fcp == null ? null : Math.round(metrics.fcp),
                suffix: 'ms',
                help: 'Nội dung đầu tiên',
                threshold: 1800,
              },
              {
                label: 'LCP',
                value: metrics?.lcp == null ? null : Math.round(metrics.lcp),
                suffix: 'ms',
                help: 'Nội dung lớn nhất',
                threshold: 2500,
              },
              {
                label: 'CLS',
                value: metrics?.cls == null ? null : Math.round(metrics.cls * 1000) / 1000,
                suffix: '',
                help: 'Độ dịch chuyển bố cục',
                threshold: 0.1,
              },
            ].map((m) => (
              <div className="metric" key={m.label}>
                <span>
                  {m.label}
                  <CircleHelp size={12} aria-label={m.help} />
                </span>
                <strong
                  className={
                    m.value == null ? '' : m.value <= m.threshold ? 'text-green' : 'text-amber'
                  }
                >
                  {m.value == null ? '—' : new Intl.NumberFormat('vi-VN').format(m.value)}
                  <small>{m.suffix}</small>
                </strong>
                <p>{m.help}</p>
              </div>
            ))}
          </div>
          <p className="inline-info">
            <Info size={14} />
            {lh?.available
              ? `FCP, LCP, CLS từ Lighthouse; TTFB là phép đo HTTP riêng. TBT ${lh.metrics?.tbt == null ? '—' : Math.round(lh.metrics.tbt) + ' ms'} · Speed Index ${lh.metrics?.speedIndex == null ? '—' : Math.round(lh.metrics.speedIndex) + ' ms'}. Đo qua cầu nối HTTP giới hạn, có thể khác PageSpeed Insights. Không có dữ liệu CrUX hoặc INP thực tế.`
              : 'Số liệu từ phiên đo cục bộ qua cầu nối HTTP; chưa mô phỏng mạng 4G. CLS chỉ ghi nhận trong thời gian quan sát. Không đo INP.'}
          </p>
          {lh?.available && (
            <section className="lighthouse-opportunities" aria-label="Cơ hội tối ưu Lighthouse">
              <div className="opportunity-heading">
                <h4>Cơ hội tối ưu từ Lighthouse</h4>
                <span>{lh.opportunities?.length || 0} gợi ý</span>
              </div>
              <p className="opportunity-note">
                Ước lượng cho từng gợi ý có thể trùng nhau; không cộng dồn thành thời gian tiết
                kiệm.
              </p>
              {lh.opportunities?.length ? (
                lh.opportunities.map((audit) => (
                  <div className="opportunity-row" key={audit.id}>
                    <div>
                      <strong>{audit.title}</strong>
                      <p>{audit.displayValue}</p>
                      {audit.resources.length > 0 && (
                        <details>
                          <summary>Tài nguyên liên quan</summary>
                          {audit.resources.map((resource, i) => (
                            <p className="resource-url" key={i}>
                              {resource.url}
                            </p>
                          ))}
                        </details>
                      )}
                    </div>
                    <span>
                      {audit.savingsMs > 0
                        ? `≈ ${Math.round(audit.savingsMs)} ms`
                        : audit.savingsBytes > 0
                          ? `≈ ${Math.round(audit.savingsBytes / 1024)} KB`
                          : 'Cần cải thiện'}
                    </span>
                  </div>
                ))
              ) : (
                <p className="opportunity-empty">
                  Không có cơ hội tiết kiệm tài nguyên được Lighthouse định lượng trong lần đo này.
                </p>
              )}
            </section>
          )}
        </>
      )}
      {category === 'mobile' && (
        <div className="mobile-detail-grid">
          <WebsitePreview report={report} onImage={onImage} />
          <div className="mobile-facts">
            <div>
              <Smartphone size={20} />
              <strong>{report.browser.mobile?.width || '—'} px</strong>
              <span>Khung nhìn đo được</span>
            </div>
            <div>
              <Target size={20} />
              <strong>{report.browser.mobile?.smallTargetCount ?? '—'}</strong>
              <span>Vùng bấm cần xem lại</span>
            </div>
            <div>
              <Code2 size={20} />
              <strong>
                {report.browser.mobile
                  ? report.browser.mobile.overflow
                    ? 'Có'
                    : 'Không'
                  : 'Chưa đo'}
              </strong>
              <span>Tràn ngang màn hình</span>
            </div>
          </div>
        </div>
      )}
      {category === 'links' && (
        <div className="link-results">
          <div className="link-summary">
            {[
              ['all', 'Tất cả', report.links.length],
              ['broken', 'Có lỗi', report.links.filter((l) => l.state === 'broken').length],
              ['unknown', 'Chưa rõ', report.links.filter((l) => l.state === 'unknown').length],
              ['ok', 'Hoạt động', report.links.filter((l) => l.state === 'ok').length],
            ].map(([id, label, count]) => (
              <button
                key={id}
                className={linkFilter === id ? 'active' : ''}
                onClick={() => setLinkFilter(String(id))}
              >
                {label}
                <span>{count}</span>
              </button>
            ))}
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>URL được kiểm tra</th>
                  <th>Loại</th>
                  <th>HTTP</th>
                  <th>Kết quả</th>
                </tr>
              </thead>
              <tbody>
                {report.links
                  .filter((l) => linkFilter === 'all' || l.state === linkFilter)
                  .map((l) => (
                    <tr key={l.url}>
                      <td>
                        <a href={l.url} target="_blank" rel="noreferrer">
                          {l.url}
                          <ExternalLink size={11} />
                        </a>
                        <small title={l.error || l.source}>{l.error || `Từ: ${l.source}`}</small>
                      </td>
                      <td>{l.internal ? 'Nội bộ' : 'Bên ngoài'}</td>
                      <td>
                        <code>{l.status ?? '—'}</code>
                      </td>
                      <td>
                        <span className={`http-state ${l.state}`}>
                          {l.state === 'ok'
                            ? 'Hoạt động'
                            : l.state === 'broken'
                              ? 'Có lỗi'
                              : 'Chưa xác minh'}
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {!report.links.filter((l) => linkFilter === 'all' || l.state === linkFilter).length && (
              <div className="table-empty">Không có liên kết trong bộ lọc này.</div>
            )}
          </div>
        </div>
      )}
      {category === 'seo' && (
        <div className="seo-pages table-scroll">
          <table>
            <thead>
              <tr>
                <th>Trang đã đọc</th>
                <th>Tiêu đề</th>
                <th>H1</th>
                <th>Ảnh thiếu alt</th>
              </tr>
            </thead>
            <tbody>
              {report.pages.map((p) => (
                <tr key={p.url}>
                  <td>
                    <a href={p.url} target="_blank" rel="noreferrer">
                      {new URL(p.url).pathname}
                      <ExternalLink size={11} />
                    </a>
                  </td>
                  <td>{p.title || <span className="text-amber">Chưa có title</span>}</td>
                  <td>{p.h1.length}</td>
                  <td>
                    {p.missingAlt}/{p.images}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="panel category-issues">
        <div className="panel-heading">
          <h3>
            Việc cần cải thiện <span className="count-badge">{issues.length}</span>
          </h3>
        </div>
        <IssueList checks={issues} onToggle={onToggle} pendingId={pendingId} />
      </div>
      {passed.length > 0 && (
        <div className="passed-checks">
          <h3>
            <CheckCircle2 size={17} />
            {passed.length} kiểm tra đã đạt
          </h3>
          <div>
            {passed.map((c) => (
              <details key={c.id}>
                <summary>
                  <Check size={14} />
                  {c.title}
                  <ChevronDown size={13} />
                </summary>
                <p>{c.description}</p>
              </details>
            ))}
          </div>
        </div>
      )}
      {checks.some((c) => c.status === 'info') && (
        <div className="info-checks">
          {checks
            .filter((c) => c.status === 'info')
            .map((c) => (
              <p key={c.id}>
                <Info size={15} />
                <span>
                  <strong>{c.title}:</strong> {c.description}
                </span>
              </p>
            ))}
        </div>
      )}
    </div>
  );
}
