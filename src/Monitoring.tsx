import { useState, type FormEvent } from 'react';
import {
  Bell,
  ChartNoAxesCombined,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  Clock3,
  ExternalLink,
  GitCompareArrows,
  LoaderCircle,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Settings2,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react';
import { dateTime, EmptyState, scoreColor } from './components';
import type { Monitor, MonitorInterval } from './types';

interface MonitorInput {
  name: string;
  url: string;
  device: 'mobile' | 'desktop';
  maxPages: number;
  interval: MonitorInterval;
}
interface MonitorActions {
  onRun: (id: string) => Promise<void>;
  onToggle: (monitor: Monitor) => Promise<void>;
  onDelete: (monitor: Monitor) => void;
  onOpenReport: (id: string) => void;
  onCompare: (ids: string[]) => void;
  onReadAlerts: (id: string) => Promise<void>;
  onCancelJob: (id: string) => Promise<void>;
  onUpdate: (id: string, input: MonitorInput) => Promise<void>;
}
const emptyInput: MonitorInput = {
  name: '',
  url: '',
  device: 'mobile',
  maxPages: 5,
  interval: 'daily',
};
const shortDate = (value: string) =>
  new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Bangkok',
  }).format(new Date(value));
const statusLabels: Record<Monitor['lastStatus'], string> = {
  never: 'Chưa chạy',
  running: 'Đang chạy',
  healthy: 'Đã cập nhật',
  alert: 'Có cảnh báo',
  error: 'Lần chạy lỗi',
};
function nextRunLabel(monitor: Monitor) {
  if (!monitor.active) return 'Lịch đang tạm dừng';
  if (monitor.running) return 'Đang chạy lượt theo dõi';
  if (new Date(monitor.nextRunAt).getTime() <= Date.now())
    return 'Đến lịch · Đang chờ lượt kiểm tra';
  return `Lần tới: ${dateTime(monitor.nextRunAt)}`;
}

function MonitorFields({
  input,
  onChange,
  editing = false,
  disabled = false,
}: {
  input: MonitorInput;
  onChange: (input: MonitorInput) => void;
  editing?: boolean;
  disabled?: boolean;
}) {
  const label = editing ? 'chỉnh sửa' : 'theo dõi';
  return (
    <>
      <label className="monitor-name-field">
        Tên dự án
        <input
          aria-label={`Tên dự án ${label}`}
          value={input.name}
          onChange={(event) => onChange({ ...input, name: event.target.value })}
          placeholder="Ví dụ: Website khách hàng A"
          maxLength={80}
          required
          disabled={disabled}
        />
      </label>
      <label className="monitor-url-field">
        URL website
        <input
          aria-label={`URL website ${label}`}
          value={input.url}
          onChange={(event) => onChange({ ...input, url: event.target.value })}
          placeholder="https://example.com"
          inputMode="url"
          maxLength={2048}
          required
          disabled={disabled}
        />
      </label>
      <label>
        Thiết bị
        <select
          aria-label={`Thiết bị ${label}`}
          value={input.device}
          onChange={(event) =>
            onChange({ ...input, device: event.target.value as MonitorInput['device'] })
          }
          disabled={disabled}
        >
          <option value="mobile">Mobile</option>
          <option value="desktop">Desktop</option>
        </select>
      </label>
      <label>
        Phạm vi
        <select
          aria-label={`Phạm vi ${label}`}
          value={input.maxPages}
          onChange={(event) => onChange({ ...input, maxPages: Number(event.target.value) })}
          disabled={disabled}
        >
          <option value={1}>1 trang</option>
          <option value={5}>Tối đa 5 trang</option>
          <option value={10}>Tối đa 10 trang</option>
        </select>
      </label>
      <label>
        Chu kỳ
        <select
          aria-label={`Chu kỳ ${label}`}
          value={input.interval}
          onChange={(event) =>
            onChange({ ...input, interval: event.target.value as MonitorInterval })
          }
          disabled={disabled}
        >
          <option value="daily">Mỗi ngày</option>
          <option value="weekly">Mỗi tuần</option>
        </select>
      </label>
    </>
  );
}

function ScoreHistory({
  monitor,
  onOpenReport,
}: {
  monitor: Monitor;
  onOpenReport: (id: string) => void;
}) {
  const runs = monitor.runs || [];
  if (!runs.length)
    return (
      <div className="monitor-chart-empty">
        <ChartNoAxesCombined size={27} />
        <p>Biểu đồ sẽ xuất hiện sau lần kiểm tra đầu tiên.</p>
      </div>
    );
  const points = runs.map((run, index) => ({
    ...run,
    x: runs.length === 1 ? 224 : 32 + index * (380 / (runs.length - 1)),
    y: 116 - Math.max(0, Math.min(100, run.score ?? 0)),
  }));
  const path = points
    .map((point, index) =>
      point.score == null
        ? ''
        : `${index > 0 && point.comparable && points[index - 1].score != null ? 'L' : 'M'}${point.x} ${point.y}`,
    )
    .join(' ');
  return (
    <div className="monitor-history">
      <div className="monitor-chart-heading">
        <span>
          <ChartNoAxesCombined size={14} />
          Lịch sử điểm
        </span>
        <small>{runs.length}/12 lần gần nhất</small>
      </div>
      <svg
        className="monitor-chart"
        viewBox="0 0 432 145"
        role="img"
        aria-label={`Biểu đồ điểm ${monitor.name}: ${runs.map((run) => `${run.score ?? 'chưa đo được'} điểm lúc ${dateTime(run.createdAt)}`).join('; ')}`}
      >
        {[0, 50, 100].map((score) => (
          <g key={score}>
            <line
              x1="32"
              y1={116 - score}
              x2="412"
              y2={116 - score}
              className="monitor-chart-grid"
            />
            <text x="21" y={120 - score} textAnchor="end" className="monitor-chart-label">
              {score}
            </text>
          </g>
        ))}
        <path d={path} className="monitor-chart-line" />
        {points
          .filter((point) => point.score != null)
          .map((point) => (
            <circle
              key={point.reportId}
              cx={point.x}
              cy={point.y}
              r="4"
              className={point.alert ? 'monitor-chart-point alert' : 'monitor-chart-point'}
            >
              <title>
                {point.score} điểm · {dateTime(point.createdAt)} · {point.scoreSource}
              </title>
            </circle>
          ))}
        <text x="32" y="140" className="monitor-chart-label">
          {shortDate(runs[0].createdAt)}
        </text>
        {runs.length > 1 && (
          <text x="412" y="140" textAnchor="end" className="monitor-chart-label">
            {shortDate(runs.at(-1)!.createdAt)}
          </text>
        )}
      </svg>
      {runs.some((run) => !run.baseline && !run.comparable) && (
        <p className="monitor-chart-note">Các điểm rời nhau khi chưa đủ điều kiện so sánh.</p>
      )}
      <details className="monitor-history-details">
        <summary>
          Chi tiết {runs.length} lần kiểm tra
          <ChevronDown size={14} />
        </summary>
        <div className="monitor-history-table-wrap">
          <table className="monitor-history-table">
            <caption className="sr-only">Lịch sử kiểm tra {monitor.name}</caption>
            <thead>
              <tr>
                <th scope="col">Thời gian</th>
                <th scope="col">Điểm</th>
                <th scope="col">Đối chiếu</th>
              </tr>
            </thead>
            <tbody>
              {[...runs].reverse().map((run) => (
                <tr key={run.reportId}>
                  <td>
                    <button
                      className="text-button"
                      onClick={() => onOpenReport(run.reportId)}
                      aria-label={`Xem báo cáo ${monitor.name} lúc ${dateTime(run.createdAt)}`}
                    >
                      {dateTime(run.createdAt)}
                      <ExternalLink size={11} />
                    </button>
                  </td>
                  <td>
                    <strong>{run.score ?? '—'}</strong>
                  </td>
                  <td>
                    <span>
                      {run.baseline
                        ? 'Mốc đầu tiên'
                        : run.comparable
                          ? 'Cùng điều kiện đo'
                          : run.comparisonReason || 'Chưa đủ dữ liệu'}
                    </span>
                    <small>{run.scoreSource}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function MonitorCard({ monitor, ...actions }: { monitor: Monitor } & MonitorActions) {
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<MonitorInput>(monitor);
  const [editError, setEditError] = useState('');
  const alert = monitor.alert;
  const baseline = monitor.runs.at(-1)?.baseline;
  async function perform(work: () => Promise<void>) {
    setBusy(true);
    try {
      await work();
    } finally {
      setBusy(false);
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setEditError('');
    setBusy(true);
    try {
      await actions.onUpdate(monitor.id, draft);
      setEditing(false);
    } catch (error) {
      setEditError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <article
      className={`panel monitor-card ${monitor.lastStatus} ${!monitor.active ? 'paused' : ''}`}
      aria-label={`Theo dõi ${monitor.name}`}
    >
      <div className="monitor-card-head">
        <div className="monitor-name-wrap">
          <span className={`monitor-status-dot ${monitor.lastStatus}`} />
          <div>
            <h2>{monitor.name}</h2>
            <a href={monitor.url} target="_blank" rel="noreferrer">
              {monitor.url}
              <ExternalLink size={12} />
            </a>
          </div>
        </div>
        <span className={`monitor-status-label ${monitor.lastStatus}`}>
          {statusLabels[monitor.lastStatus]}
        </span>
      </div>
      <div className="monitor-card-meta">
        <span>
          <Clock3 size={13} />
          {nextRunLabel(monitor)}
        </span>
        <span>
          {monitor.intervalLabel} · {monitor.device === 'mobile' ? 'Mobile' : 'Desktop'} · Tối đa{' '}
          {monitor.maxPages} trang
        </span>
      </div>
      {monitor.running ? (
        <div className="monitor-running" role="status">
          <div>
            <LoaderCircle size={15} className="spin" />
            <span>{monitor.currentJob?.message || 'Đang chuẩn bị lượt kiểm tra…'}</span>
            {monitor.currentJob && (
              <button
                className="text-button"
                disabled={busy}
                onClick={() => void perform(() => actions.onCancelJob(monitor.currentJob!.id))}
              >
                Hủy
              </button>
            )}
          </div>
          <div
            className="progress-track"
            role="progressbar"
            aria-label={`Tiến độ kiểm tra ${monitor.name}`}
            aria-valuenow={monitor.currentJob?.progress || 1}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <span style={{ width: `${monitor.currentJob?.progress || 1}%` }} />
          </div>
        </div>
      ) : monitor.lastStatus === 'error' ? (
        <div className="monitor-alert error" role="status">
          <TriangleAlert size={16} />
          <p>{monitor.lastError || 'Lần theo dõi gần nhất không hoàn tất.'}</p>
        </div>
      ) : alert?.hasAlert ? (
        <div className="monitor-alert" role="status">
          <TriangleAlert size={16} />
          <p>{alert.message}</p>
        </div>
      ) : (
        <div className="monitor-ok">
          <CheckCircle2 size={16} />
          <p>
            {monitor.lastStatus === 'never'
              ? 'Bấm “Chạy ngay” để lấy mốc đầu tiên.'
              : baseline
                ? 'Đã lưu mốc đầu tiên. Các lần sau sẽ đối chiếu thay đổi.'
                : 'Không phát hiện thay đổi cần cảnh báo trong lần gần nhất.'}
          </p>
        </div>
      )}
      {!monitor.running && monitor.lastStatus !== 'error' && alert?.scoreReason && (
        <p className="monitor-comparison-note">
          Chưa so sánh tổng điểm: {alert.scoreReason.toLowerCase()}. Xem báo cáo để kiểm tra các vấn
          đề hiện có.
        </p>
      )}
      <div className="monitor-score-row">
        <div>
          <span>Điểm gần nhất</span>
          <strong className={scoreColor(monitor.lastScore)}>
            {monitor.lastScore ?? '—'}
            <small>/100</small>
          </strong>
        </div>
        <div>
          {monitor.lastRunAt ? (
            <>
              Lần chạy gần nhất
              <time dateTime={monitor.lastRunAt}>{dateTime(monitor.lastRunAt)}</time>
            </>
          ) : (
            'Sẵn sàng cho lần kiểm tra đầu tiên'
          )}
        </div>
      </div>
      <ScoreHistory monitor={monitor} onOpenReport={actions.onOpenReport} />
      {monitor.notifications.length > 0 && (
        <details className="monitor-notifications">
          <summary>
            <span>
              <Bell size={14} />
              Cảnh báo đã lưu<small>{monitor.notifications.length}</small>
              {monitor.unreadAlerts > 0 && <b>{monitor.unreadAlerts} chưa đọc</b>}
            </span>
            <ChevronDown size={14} />
          </summary>
          <div className="monitor-notification-content">
            {monitor.unreadAlerts > 0 && (
              <button
                className="text-button monitor-mark-read"
                disabled={busy}
                onClick={() => void perform(() => actions.onReadAlerts(monitor.id))}
              >
                <CheckCheck size={14} />
                Đánh dấu tất cả đã đọc
              </button>
            )}
            <ul>
              {[...monitor.notifications].reverse().map((notification) => (
                <li key={notification.id} className={notification.readAt ? '' : 'unread'}>
                  <p>
                    {!notification.readAt && <span className="sr-only">Chưa đọc: </span>}
                    {notification.message}
                  </p>
                  <time dateTime={notification.createdAt}>{dateTime(notification.createdAt)}</time>
                  <div>
                    {notification.reportId && (
                      <button
                        className="text-button"
                        onClick={() => actions.onOpenReport(notification.reportId!)}
                      >
                        Báo cáo
                        <ExternalLink size={11} />
                      </button>
                    )}
                    {notification.previousReportId && notification.reportId && (
                      <button
                        className="text-button"
                        onClick={() =>
                          actions.onCompare([
                            notification.previousReportId!,
                            notification.reportId!,
                          ])
                        }
                      >
                        Xem thay đổi
                        <GitCompareArrows size={12} />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </details>
      )}
      <div className="monitor-report-actions">
        {monitor.lastReportId && (
          <button
            className="text-button"
            onClick={() => actions.onOpenReport(monitor.lastReportId!)}
          >
            Báo cáo gần nhất
            <ExternalLink size={12} />
          </button>
        )}
        {monitor.previousReportId && monitor.lastReportId && (
          <button
            className="text-button"
            onClick={() => actions.onCompare([monitor.previousReportId!, monitor.lastReportId!])}
          >
            <GitCompareArrows size={13} />
            So sánh hai lần gần nhất
          </button>
        )}
      </div>
      <div className="monitor-card-footer">
        <button
          className="button primary monitor-run-button"
          aria-label={`Chạy ngay ${monitor.name}`}
          disabled={busy || monitor.running}
          onClick={() => void perform(() => actions.onRun(monitor.id))}
        >
          {monitor.running ? <LoaderCircle size={14} className="spin" /> : <RefreshCw size={14} />}
          {monitor.running ? 'Đang kiểm tra…' : 'Chạy ngay'}
        </button>
        <div>
          <button
            className="button secondary"
            aria-label={monitor.active ? `Tạm dừng ${monitor.name}` : `Bật lại ${monitor.name}`}
            disabled={busy}
            onClick={() => void perform(() => actions.onToggle(monitor))}
          >
            {monitor.active ? <Pause size={14} /> : <Play size={14} />}
            {monitor.active ? 'Tạm dừng' : 'Bật lịch'}
          </button>
          <button
            className="icon-button"
            aria-label={`Sửa theo dõi ${monitor.name}`}
            aria-expanded={editing}
            disabled={busy || monitor.running}
            onClick={() => {
              setDraft({
                name: monitor.name,
                url: monitor.url,
                device: monitor.device,
                maxPages: monitor.maxPages,
                interval: monitor.interval,
              });
              setEditError('');
              setEditing(!editing);
            }}
          >
            <Settings2 size={16} />
          </button>
          <button
            className="icon-button danger-button"
            aria-label={`Xóa theo dõi ${monitor.name}`}
            disabled={busy || monitor.running}
            onClick={() => actions.onDelete(monitor)}
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>
      {editing && (
        <form className="monitor-form monitor-edit-form" onSubmit={save}>
          <h3>Sửa cấu hình theo dõi</h3>
          <MonitorFields
            input={draft}
            onChange={setDraft}
            editing
            disabled={busy || monitor.running}
          />
          <p className="monitor-edit-note">
            Đổi URL sẽ tạo mốc theo dõi mới. Báo cáo đã lưu vẫn có trong Lịch sử.
          </p>
          {editError && (
            <p className="monitor-form-error" role="alert">
              {editError}
            </p>
          )}
          <div className="monitor-edit-actions">
            <button
              className="button secondary"
              type="button"
              disabled={busy}
              onClick={() => setEditing(false)}
            >
              <X size={14} />
              Đóng
            </button>
            <button className="button primary" type="submit" disabled={busy || monitor.running}>
              {busy && <LoaderCircle size={14} className="spin" />}Lưu thay đổi
            </button>
          </div>
        </form>
      )}
    </article>
  );
}

export function MonitorView({
  monitors,
  loading,
  onCreate,
  ...actions
}: {
  monitors: Monitor[];
  loading: boolean;
  onCreate: (input: MonitorInput) => Promise<void>;
} & MonitorActions) {
  const [input, setInput] = useState<MonitorInput>({ ...emptyInput });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError('');
    setSaving(true);
    try {
      await onCreate(input);
      setInput({ ...emptyInput });
    } catch (error) {
      setFormError((error as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <div className="page-heading monitor-page-heading">
        <div>
          <span className="eyebrow">KIỂM TRA ĐỀU ĐẶN. PHẢN ỨNG KỊP THỜI.</span>
          <h1>
            Theo dõi website<span>.</span>
          </h1>
          <p>Giữ lịch sử điểm số, nhận cảnh báo khi điểm giảm hoặc xuất hiện lỗi mới.</p>
        </div>
        <div className="monitor-summary-badge">
          <Bell size={19} />
          <div>
            <strong>{monitors.length} website đã lưu</strong>
            <span>{monitors.filter((monitor) => monitor.active).length} lịch đang bật</span>
          </div>
        </div>
      </div>
      <section className="panel monitor-create-panel" aria-label="Thêm website theo dõi">
        <div className="panel-heading">
          <div>
            <h2>
              <Plus size={16} />
              Thêm website cần theo dõi
            </h2>
            <p>Chọn chu kỳ 24 giờ hoặc 7 ngày. Bạn có thể chạy ngay bất cứ lúc nào.</p>
          </div>
          <span className="local-badge">
            <span />
            Dữ liệu trên máy này
          </span>
        </div>
        <form className="monitor-form" onSubmit={submit}>
          <MonitorFields input={input} onChange={setInput} disabled={saving} />
          <button className="button primary monitor-submit" disabled={saving} type="submit">
            {saving ? <LoaderCircle size={15} className="spin" /> : <Plus size={15} />}
            {saving ? 'Đang lưu…' : 'Lưu theo dõi'}
          </button>
        </form>
        {formError && (
          <p className="monitor-form-error" role="alert">
            <TriangleAlert size={14} />
            {formError}
          </p>
        )}
      </section>
      <div className="monitor-schedule-note">
        <Clock3 size={16} />
        <p>
          Lịch tự chạy khi máy chủ ứng dụng đang mở. Khi mở lại sau thời gian nghỉ, mỗi website quá
          hạn được kiểm tra một lần. Cảnh báo được lưu tại đây và ở biểu tượng chuông.
        </p>
      </div>
      {loading ? (
        <div className="loading-state">
          <LoaderCircle className="spin" />
          Đang đọc danh sách theo dõi…
        </div>
      ) : monitors.length ? (
        <section className="monitor-grid" aria-label="Danh sách website đang theo dõi">
          {monitors.map((monitor) => (
            <MonitorCard key={monitor.id} monitor={monitor} {...actions} />
          ))}
        </section>
      ) : (
        <EmptyState icon={<Bell size={34} />} title="Chưa có website nào được theo dõi">
          Lưu website đầu tiên ở trên, rồi bấm “Chạy ngay” để tạo mốc so sánh.
        </EmptyState>
      )}
      <div className="monitor-footnote">
        <Bell size={14} />
        <p>
          Cảnh báo khi tổng điểm hoặc tốc độ giảm từ 5 điểm, có liên kết lỗi mới hoặc vấn đề SEO
          mới. Hai lần đo cần đủ điều kiện đối chiếu; các vấn đề hiện có nằm trong báo cáo.
        </p>
      </div>
    </>
  );
}
