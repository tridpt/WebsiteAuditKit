import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Bell,
  CalendarClock,
  CheckCheck,
  LoaderCircle,
  Pause,
  Play,
  Save,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import { api } from './api';
import { dateTime } from './components';
import type { Project, ProjectSchedule as Schedule } from './types';
import './project-schedule.css';

const labels: Record<string, string> = {
  never: 'Chưa chạy',
  running: 'Đang kiểm tra',
  baseline: 'Đã có mốc đầu tiên',
  healthy: 'Không có cảnh báo mới',
  alert: 'Có cảnh báo',
  incomplete: 'Chưa đủ dữ liệu',
  cancelled: 'Đã hủy',
  interrupted: 'Bị gián đoạn',
  error: 'Không chạy được',
};
const defaults = {
  device: 'mobile' as 'mobile' | 'desktop',
  maxPages: 5,
  interval: 'weekly' as 'daily' | 'weekly',
};
export function ProjectSchedulePanel({
  project,
  batchRunning,
  onRefresh,
  onOpenBatch,
  onCompare,
}: {
  project: Project;
  batchRunning: boolean;
  onRefresh: () => Promise<void>;
  onOpenBatch: (id: string) => void;
  onCompare: (before: string, after: string) => void;
}) {
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [draft, setDraft] = useState(defaults);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState('');
  const [confirmation, setConfirmation] = useState(false);
  const [saved, setSaved] = useState('');
  const [version, setVersion] = useState(0);
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;
  const lastVersion = useRef('');
  const base = `/api/projects/${project.id}/schedule`;
  const running = Boolean(schedule?.currentRunId);
  useEffect(() => {
    const controller = new AbortController();
    let timer: number;
    async function load() {
      try {
        const data = await api<Schedule | null>(base, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setSchedule(data);
        setLoadError('');
        const nextVersion = data
          ? `${data.updatedAt}:${data.unreadAlerts}:${data.currentBatchId}`
          : '';
        if (lastVersion.current && nextVersion !== lastVersion.current)
          void refreshRef.current().catch(() => {});
        lastVersion.current = nextVersion;
      } catch (e) {
        if (!controller.signal.aborted) setLoadError((e as Error).message);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          timer = window.setTimeout(() => void load(), 2500);
        }
      }
    }
    void load();
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [base, version]);
  async function action(kind: string, values?: unknown) {
    if (busy) return;
    setBusy(kind);
    setError('');
    setSaved('');
    try {
      if (kind === 'cancel') {
        if (!schedule?.currentBatchId)
          throw new Error('Đang tạo hàng đợi. Thử hủy lại sau khi có tiến độ.');
        await api(`/api/projects/${project.id}/batches/${schedule.currentBatchId}/cancel`, {
          method: 'POST',
        });
      } else {
        const method =
          kind === 'save'
            ? 'PUT'
            : kind === 'toggle'
              ? 'PATCH'
              : kind === 'delete'
                ? 'DELETE'
                : 'POST';
        await api(`${base}${kind === 'run' || kind === 'read' ? `/${kind}` : ''}`, {
          method,
          ...(values === undefined ? {} : { body: JSON.stringify(values) }),
        });
      }
      const data = await api<Schedule | null>(base);
      setSchedule(data);
      setVersion((n) => n + 1);
      if (kind === 'save') {
        setEditing(false);
        setSaved('Đã lưu lịch kiểm tra dự án.');
      }
      if (kind === 'delete') {
        setConfirmation(false);
        setEditing(false);
        setDraft(defaults);
        setSaved('Đã xóa lịch. Các lần audit và báo cáo vẫn được giữ.');
      }
      await onRefresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }
  function edit() {
    setDraft(
      schedule
        ? { device: schedule.device, maxPages: schedule.maxPages, interval: schedule.interval }
        : defaults,
    );
    setEditing(true);
    setSaved('');
  }
  return (
    <section
      className="panel project-section project-schedule-panel"
      aria-label="Lịch kiểm tra toàn bộ dự án"
    >
      <div className="batch-heading">
        <div>
          <h2>
            <CalendarClock size={19} />
            Lịch kiểm tra dự án
          </h2>
          <p className="project-section-hint">
            Tự kiểm tra {project.websites.length} website, so sánh với mốc hoàn tất gần nhất và lưu
            cảnh báo ngay trong ứng dụng.
          </p>
        </div>
        <span className="batch-local">Máy chủ cần đang chạy</span>
      </div>
      {(error || loadError) && (
        <p className="project-error" role="alert">
          {error || loadError}
        </p>
      )}
      {saved && (
        <p className="schedule-saved" role="status">
          {saved}
        </p>
      )}
      {loading ? (
        <p className="loading-state">
          <LoaderCircle size={15} className="spin" />
          Đang đọc lịch dự án…
        </p>
      ) : (
        <>
          {!schedule && !editing && (
            <div className="schedule-empty">
              <CalendarClock size={30} />
              <div>
                <h3>Để việc kiểm tra trở thành định kỳ</h3>
                <p>
                  Chọn mỗi ngày hoặc mỗi tuần. Mỗi lượt tạo báo cáo mới cho toàn bộ URL hiện tại của
                  dự án.
                </p>
              </div>
              <button className="button primary" disabled={!!loadError} onClick={edit}>
                <Play size={14} />
                Tạo lịch dự án
              </button>
            </div>
          )}
          {schedule && (
            <>
              <div className="schedule-overview">
                <div>
                  <span className={`schedule-pill ${schedule.active ? 'active' : ''}`}>
                    {schedule.active ? 'Đang bật' : 'Tạm dừng'}
                  </span>
                  <h3>
                    {schedule.interval === 'daily' ? 'Mỗi 24 giờ' : 'Mỗi 7 ngày'} ·{' '}
                    {schedule.device === 'mobile' ? 'Mobile' : 'Desktop'}
                  </h3>
                  <p>
                    Tối đa {schedule.maxPages} trang/website · URL lấy từ dự án khi bắt đầu mỗi
                    lượt.
                  </p>
                </div>
                <div className="schedule-next">
                  <span>{schedule.active ? 'Lần tự động tiếp theo' : 'Lịch đang tạm dừng'}</span>
                  <strong>
                    {schedule.active ? dateTime(schedule.nextRunAt) : 'Bật lại khi cần'}
                  </strong>
                  <small>UTC+7 · máy chủ kiểm tra lịch mỗi phút</small>
                </div>
              </div>
              <div className="schedule-actions">
                <button
                  className="button primary"
                  disabled={!!busy || running || batchRunning}
                  onClick={() => void action('run')}
                >
                  <Play size={14} />
                  Chạy lịch ngay
                </button>
                <button
                  className="button secondary"
                  disabled={!!busy}
                  onClick={() => void action('toggle', { active: !schedule.active })}
                >
                  {schedule.active ? <Pause size={14} /> : <Play size={14} />}
                  {schedule.active ? 'Tạm dừng lịch dự án' : 'Bật lịch dự án'}
                </button>
                <button className="button secondary" disabled={!!busy || running} onClick={edit}>
                  Sửa lịch dự án
                </button>
                {running && (
                  <button
                    className="button secondary"
                    disabled={!!busy || !schedule.currentBatchId}
                    onClick={() => void action('cancel')}
                  >
                    <Square size={13} />
                    Hủy lượt theo lịch
                  </button>
                )}
                <button
                  className="text-button schedule-delete"
                  disabled={!!busy || running}
                  onClick={() => setConfirmation(true)}
                >
                  <Trash2 size={13} />
                  Xóa lịch
                </button>
                {busy && (
                  <span className="loading-state" role="status">
                    <LoaderCircle size={14} className="spin" />
                    Đang xử lý…
                  </span>
                )}
              </div>
              <p className="schedule-status" role="status">
                {running && <LoaderCircle size={14} className="spin" />}Lượt gần nhất:{' '}
                {labels[schedule.lastStatus] || schedule.lastStatus}
                {schedule.lastRunAt && ` · ${dateTime(schedule.lastRunAt)}`}
                {schedule.currentBatchId && (
                  <button
                    className="text-button"
                    onClick={() => onOpenBatch(schedule.currentBatchId!)}
                  >
                    Xem tiến độ <ArrowUpRight size={13} />
                  </button>
                )}
              </p>
              {schedule.lastError && <p className="project-error">{schedule.lastError}</p>}
            </>
          )}
          {editing && (
            <form
              className="schedule-editor"
              aria-label="Cấu hình lịch dự án"
              onSubmit={(event) => {
                event.preventDefault();
                void action('save', { ...draft, active: schedule?.active ?? true });
              }}
            >
              <fieldset disabled={!!busy || running}>
                <label>
                  Chu kỳ
                  <select
                    aria-label="Chu kỳ lịch dự án"
                    value={draft.interval}
                    onChange={(e) =>
                      setDraft({ ...draft, interval: e.target.value as typeof draft.interval })
                    }
                  >
                    <option value="daily">Mỗi ngày (24 giờ)</option>
                    <option value="weekly">Mỗi tuần (7 ngày)</option>
                  </select>
                </label>
                <label>
                  Thiết bị
                  <select
                    aria-label="Thiết bị lịch dự án"
                    value={draft.device}
                    onChange={(e) =>
                      setDraft({ ...draft, device: e.target.value as typeof draft.device })
                    }
                  >
                    <option value="mobile">Mobile</option>
                    <option value="desktop">Desktop</option>
                  </select>
                </label>
                <label>
                  Phạm vi mỗi website
                  <select
                    aria-label="Số trang lịch dự án"
                    value={draft.maxPages}
                    onChange={(e) => setDraft({ ...draft, maxPages: Number(e.target.value) })}
                  >
                    <option value={1}>1 trang</option>
                    <option value={5}>Tối đa 5 trang</option>
                    <option value={10}>Tối đa 10 trang</option>
                  </select>
                </label>
              </fieldset>
              <p className="project-section-hint">
                Lần tự động đầu tiên sau một chu kỳ kể từ lúc lưu. Chạy ngay để tạo mốc đầu tiên;
                lần tự động kế tiếp tính từ lúc chạy.
              </p>
              <div className="schedule-actions">
                <button className="button primary" disabled={!!busy || running}>
                  <Save size={14} />
                  Lưu lịch dự án
                </button>
                <button
                  className="button secondary"
                  type="button"
                  disabled={!!busy}
                  onClick={() => setEditing(false)}
                >
                  <X size={14} />
                  Hủy chỉnh lịch
                </button>
              </div>
            </form>
          )}
          {confirmation && (
            <div className="schedule-confirm" role="group" aria-label="Xác nhận xóa lịch dự án">
              <h3>Xóa lịch kiểm tra dự án?</h3>
              <p>
                Ứng dụng dừng các lượt tự động tiếp theo. Lịch sử audit, báo cáo và mốc so sánh vẫn
                có trong dự án; cảnh báo của lịch sẽ bị xóa.
              </p>
              <div className="schedule-actions">
                <button
                  className="button secondary"
                  disabled={!!busy}
                  onClick={() => setConfirmation(false)}
                >
                  Giữ lịch
                </button>
                <button
                  className="button primary"
                  disabled={!!busy || running}
                  onClick={() => void action('delete')}
                >
                  Xác nhận xóa lịch
                </button>
              </div>
            </div>
          )}
          {schedule && (
            <>
              <div className="schedule-alert-heading">
                <h3>
                  <Bell size={15} />
                  Cảnh báo dự án <span>{schedule.unreadAlerts} chưa đọc</span>
                </h3>
                <button
                  className="text-button"
                  disabled={!!busy || !schedule.unreadAlerts}
                  onClick={() => void action('read')}
                >
                  <CheckCheck size={14} />
                  Đánh dấu đã đọc
                </button>
              </div>
              <p className="project-section-hint">
                Cảnh báo khi điểm tổng hoặc Tốc độ giảm từ 5 điểm, có lỗi mới được xác minh hoặc
                lượt chạy không hoàn tất. Đổi nguồn đo/phạm vi và thiếu kết quả không chứng minh
                website đã sửa.
              </p>
              {schedule.notifications.length ? (
                <ul className="schedule-alerts">
                  {[...schedule.notifications].reverse().map((alert) => (
                    <li key={alert.id} className={alert.readAt ? 'read' : 'unread'}>
                      <AlertTriangle size={16} />
                      <div>
                        <strong>{alert.message}</strong>
                        <small>
                          {dateTime(alert.createdAt)} · {alert.readAt ? 'Đã đọc' : 'Chưa đọc'}
                        </small>
                        {alert.websites.map((site) => (
                          <p key={site.url}>
                            {site.url}
                            {site.scoreDrop > 0 && ` · tổng giảm ${site.scoreDrop} điểm`}
                            {site.speedDrop > 0 && ` · Tốc độ giảm ${site.speedDrop} điểm`}
                            {site.newIssues > 0 && ` · ${site.newIssues} lỗi mới`}
                          </p>
                        ))}
                        <div className="schedule-actions">
                          {alert.batchId && (
                            <button
                              className="text-button"
                              onClick={() => onOpenBatch(alert.batchId!)}
                            >
                              Xem kết quả
                            </button>
                          )}
                          {alert.beforeBatchId && alert.batchId && (
                            <button
                              className="text-button"
                              onClick={() => onCompare(alert.beforeBatchId!, alert.batchId!)}
                            >
                              So sánh lần cảnh báo
                            </button>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="batch-empty">
                  Chưa có cảnh báo. Lần hoàn tất đầu tiên được dùng làm mốc.
                </p>
              )}
              <details className="schedule-history">
                <summary>Lịch sử chạy theo lịch ({schedule.runs.length})</summary>
                <p className="project-section-hint">
                  Giữ 50 lượt gần nhất ở đây. Toàn bộ lượt chạy và xuất PDF/HTML/CSV/JSON nằm ở Kiểm
                  tra toàn bộ dự án bên dưới.
                </p>
                {[...schedule.runs].reverse().map((run) => (
                  <article key={run.runId}>
                    <div>
                      <strong>{labels[run.status] || run.status}</strong>
                      <small>{dateTime(run.createdAt)}</small>
                    </div>
                    <p>{run.message}</p>
                    <div className="schedule-actions">
                      <button className="text-button" onClick={() => onOpenBatch(run.batchId)}>
                        Mở lần kiểm tra
                      </button>
                      {run.beforeBatchId && (
                        <button
                          className="text-button"
                          onClick={() => onCompare(run.beforeBatchId!, run.batchId)}
                        >
                          So sánh với mốc trước
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </details>
            </>
          )}
          <p className="batch-note schedule-note">
            Lịch hoạt động khi máy chủ ứng dụng đang chạy. Nếu đang bận, lượt đến hạn chờ hàng đợi
            trống. Sau khi mở lại, mỗi lịch quá hạn chạy một lượt. Tạm dừng lịch không hủy lượt đang
            chạy. Cảnh báo hiển thị trong ứng dụng.
          </p>
        </>
      )}
    </section>
  );
}
