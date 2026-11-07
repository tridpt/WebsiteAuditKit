import { useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Check,
  Download,
  Layers3,
  LoaderCircle,
  Play,
  RotateCcw,
  Square,
} from 'lucide-react';
import { api, downloadBlob } from './api';
import { dateTime } from './components';
import type { BatchSummary, Project, ProjectBatch } from './types';
import './batch.css';

const labels: Record<string, string> = {
  running: 'Đang kiểm tra',
  completed: 'Hoàn tất',
  partial: 'Có website lỗi',
  cancelled: 'Đã hủy',
  interrupted: 'Bị gián đoạn',
  queued: 'Đang chờ',
  failed: 'Thất bại',
};
export function BatchAudit({
  project,
  onRefresh,
  onOpenReport,
  onRunningChange,
  selectedBatchId,
}: {
  project: Project;
  onRefresh: () => Promise<void>;
  onOpenReport: (id: string) => void;
  onRunningChange: (running: boolean) => void;
  selectedBatchId?: string;
}) {
  const [batches, setBatches] = useState<ProjectBatch[]>([]);
  const [selected, setSelected] = useState('');
  const [summary, setSummary] = useState<BatchSummary | null>(null);
  const [device, setDevice] = useState('mobile');
  const [maxPages, setMaxPages] = useState(5);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;
  const progressRef = useRef('');
  const base = `/api/projects/${project.id}/batches`;
  const batch = batches.find((b) => b.id === selected) || batches[0];
  const running = batches.some((b) => b.status === 'running');
  useEffect(() => {
    if (selectedBatchId) setSelected(selectedBatchId);
  }, [selectedBatchId]);
  useEffect(() => {
    onRunningChange(running);
    return () => onRunningChange(false);
  }, [running, onRunningChange]);
  useEffect(() => {
    const controller = new AbortController();
    let timer: number;
    async function load() {
      try {
        const list = await api<ProjectBatch[]>(base, { signal: controller.signal });
        const current =
          list.find((b) => b.status === 'running') ||
          list.find((b) => b.id === selected) ||
          list[0];
        const data = current
          ? await api<BatchSummary>(`${base}/${current.id}/summary`, { signal: controller.signal })
          : null;
        if (controller.signal.aborted) return;
        setBatches(list);
        if (current?.status === 'running' && selected && selected !== current.id)
          setSelected(current.id);
        setSummary(data);
        setLoadError('');
        const key = list[0] ? `${list[0].id}:${list[0].settled}:${list[0].status}` : '';
        if (progressRef.current && progressRef.current !== key)
          void refreshRef.current().catch(() => {});
        progressRef.current = key;
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
  }, [base, selected, version]);
  async function action(kind: string) {
    if (busy) return;
    setBusy(kind);
    setError('');
    try {
      const result = await api<ProjectBatch>(
        kind === 'start' ? base : `${base}/${batch.id}/${kind}`,
        {
          method: 'POST',
          body: JSON.stringify(kind === 'start' ? { device, maxPages } : {}),
        },
      );
      setBatches((previous) => [result, ...previous.filter((b) => b.id !== result.id)]);
      setSelected(result.id);
      setVersion((value) => value + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }
  async function download(format: string) {
    if (busy || !batch) return;
    setBusy(format);
    setError('');
    try {
      const response = await fetch(`${base}/${batch.id}/export?format=${format}`);
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || 'Không thể xuất báo cáo.');
      }
      downloadBlob(await response.blob(), `project-audit-${batch.id}.${format}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }
  return (
    <section className="panel project-section batch-panel" aria-label="Kiểm tra toàn bộ dự án">
      <div className="batch-heading">
        <div>
          <h2>
            <Layers3 size={19} />
            Kiểm tra toàn bộ dự án
          </h2>
          <p className="project-section-hint">
            Chạy lần lượt {project.websites.length} website, lưu kết quả ngay khi từng website hoàn
            tất.
          </p>
        </div>
        <span className="batch-local">Hàng đợi trên máy này</span>
      </div>
      <div className="batch-controls">
        <label>
          Thiết bị
          <select
            aria-label="Thiết bị kiểm tra dự án"
            value={device}
            disabled={running || !!busy}
            onChange={(e) => setDevice(e.target.value)}
          >
            <option value="mobile">Mobile</option>
            <option value="desktop">Desktop</option>
          </select>
        </label>
        <label>
          Phạm vi mỗi website
          <select
            aria-label="Số trang mỗi website trong dự án"
            value={maxPages}
            disabled={running || !!busy}
            onChange={(e) => setMaxPages(Number(e.target.value))}
          >
            <option value={1}>1 trang</option>
            <option value={5}>Tối đa 5 trang</option>
            <option value={10}>Tối đa 10 trang</option>
          </select>
        </label>
        <button
          className="button primary"
          disabled={running || loading || !!busy}
          onClick={() => void action('start')}
        >
          {busy === 'start' ? <LoaderCircle size={14} className="spin" /> : <Play size={14} />}Kiểm
          tra toàn bộ dự án
        </button>
      </div>
      {(error || loadError) && (
        <p className="project-error" role="alert">
          {error || loadError}
        </p>
      )}
      {loading ? (
        <p className="loading-state">
          <LoaderCircle className="spin" size={15} />
          Đang đọc hàng đợi…
        </p>
      ) : !batch ? (
        <p className="batch-empty">
          Chưa có lần kiểm tra toàn bộ. Kết quả và các việc ưu tiên sẽ xuất hiện tại đây.
        </p>
      ) : (
        <>
          <div className="batch-run-heading">
            <label>
              Lần kiểm tra
              <select
                aria-label="Lần kiểm tra toàn bộ dự án"
                value={batch.id}
                disabled={running || !!busy}
                onChange={(e) => {
                  setSelected(e.target.value);
                  setSummary(null);
                }}
              >
                {batches.map((b) => (
                  <option value={b.id} key={b.id}>
                    {dateTime(b.createdAt)} · {labels[b.status]}
                  </option>
                ))}
              </select>
            </label>
            <span className={`batch-status ${batch.status}`}>
              <span />
              {labels[batch.status]}
            </span>
            {batch.status === 'running' ? (
              <button
                className="button secondary"
                disabled={!!busy || batch.cancelRequested}
                onClick={() => void action('cancel')}
              >
                <Square size={13} />
                {batch.cancelRequested ? 'Đang hủy…' : 'Hủy hàng đợi'}
              </button>
            ) : (
              batch.items.some((i) => i.status !== 'completed') && (
                <button
                  className="button secondary"
                  disabled={!!busy}
                  onClick={() => void action('retry')}
                >
                  <RotateCcw size={14} />
                  Thử lại website chưa xong
                </button>
              )
            )}
          </div>
          <p className="batch-note">
            Cấu hình lần này: {batch.device === 'mobile' ? 'Mobile' : 'Desktop'} · tối đa{' '}
            {batch.maxPages} trang/website. Thử lại dùng cấu hình này.
            {batch.scheduleRunId &&
              (batch.trigger === 'schedule'
                ? ' Tự động theo lịch dự án.'
                : ' Chạy ngay từ lịch dự án.')}
          </p>
          <div className="batch-progress">
            <div>
              <strong>
                {batch.settled}/{batch.items.length} website đã xử lý
              </strong>
              <span>{batch.progress}%</span>
            </div>
            <progress aria-label="Tiến độ kiểm tra dự án" value={batch.progress} max={100} />
          </div>
          {batch.error && <p className="project-error">{batch.error}</p>}
          <ol className="batch-queue" aria-label="Hàng đợi website">
            {batch.items.map((item) => (
              <li key={item.url} className={item.status}>
                {item.status === 'running' ? (
                  <LoaderCircle size={15} className="spin" />
                ) : item.status === 'completed' ? (
                  <Check size={15} />
                ) : (
                  <span className="batch-queue-dot" />
                )}
                <div>
                  <strong>{item.url}</strong>
                  <small>
                    {item.status === 'running'
                      ? `${item.progress}% · ${item.message}`
                      : item.error || labels[item.status]}
                  </small>
                </div>
                <span>{labels[item.status]}</span>
              </li>
            ))}
          </ol>
          {summary && summary.batch.id === batch.id && (
            <>
              <div className="batch-summary-heading">
                <div>
                  <h3>Kết quả tổng hợp</h3>
                  <p>
                    {summary.totals.available}/{summary.totals.websites} website có báo cáo ·{' '}
                    {summary.totals.pending} việc còn lại · {summary.totals.high} ưu tiên cao
                  </p>
                </div>
              </div>
              <p className="project-section-hint">
                Xếp theo điểm tăng dần. Điểm thuộc từng lần đo, không gộp thành điểm chung. Website
                chưa có kết quả nằm cuối danh sách.
              </p>
              {batch.retryOf && (
                <p className="batch-note">
                  Lần thử lại giữ kết quả của website đã hoàn tất trước đó. Xem thời gian đo của
                  từng website bên dưới.
                </p>
              )}
              {summary.totals.incomplete > 0 && (
                <p className="batch-note">
                  {summary.totals.incomplete} website chưa có báo cáo; chưa đủ dữ liệu để kết luận
                  đã đạt.
                </p>
              )}
              <div className="batch-table-wrap">
                <table className="batch-table">
                  <caption className="sr-only">
                    Kết quả từng website trong lần kiểm tra dự án
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Website & lần đo</th>
                      <th scope="col">Điểm</th>
                      <th scope="col">Việc còn lại</th>
                      <th scope="col">Báo cáo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.websites.map((site) => (
                      <tr key={site.url}>
                        <td>
                          <strong>{site.url}</strong>
                          <small>
                            {site.createdAt ? dateTime(site.createdAt) : labels[site.status]}
                          </small>
                          {site.categories && (
                            <small>
                              {Object.values(site.categories)
                                .map((c) => `${c.name}: ${c.score ?? '—'}`)
                                .join(' · ')}
                            </small>
                          )}
                          {site.error && <small className="batch-site-error">{site.error}</small>}
                          {site.reportMissing && (
                            <small className="batch-site-error">
                              Báo cáo đã xóa hoặc gỡ khỏi dự án.
                            </small>
                          )}
                        </td>
                        <td>
                          <span
                            className={`batch-score ${site.score !== null && site.score < 50 ? 'low' : ''}`}
                          >
                            {site.score ?? '—'}
                          </span>
                          <small>/100</small>
                        </td>
                        <td>
                          {site.reportId ? (
                            <>
                              <b>{site.pending}</b>
                              <small>{site.high} ưu tiên cao</small>
                            </>
                          ) : (
                            <small>Chưa có dữ liệu</small>
                          )}
                        </td>
                        <td>
                          {site.reportId ? (
                            <button
                              className="text-button"
                              aria-label={`Mở báo cáo tổng hợp ${site.url}`}
                              onClick={() => onOpenReport(site.reportId!)}
                            >
                              Xem
                              <ArrowUpRight size={13} />
                            </button>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {summary.tasks.some((task) => !task.check.done) && (
                <div className="batch-priorities">
                  <h3>Ưu tiên sửa trước</h3>
                  <ul>
                    {summary.tasks
                      .filter((task) => !task.check.done)
                      .slice(0, 6)
                      .map(({ url, reportId, check }) => (
                        <li key={`${reportId}:${check.id}`}>
                          <span className={`project-priority ${check.severity}`}>
                            {check.severity === 'high'
                              ? 'Cao'
                              : check.severity === 'medium'
                                ? 'Vừa'
                                : 'Thấp'}
                          </span>
                          <button onClick={() => onOpenReport(reportId)}>
                            <strong>{check.title}</strong>
                            <small>{url}</small>
                          </button>
                          <ArrowUpRight size={13} />
                        </li>
                      ))}
                  </ul>
                  <p className="project-section-hint">
                    Toàn bộ công việc nằm trong báo cáo xuất và mục Việc cần sửa của dự án.
                  </p>
                </div>
              )}
              <div className="batch-exports">
                <div>
                  <Download size={15} />
                  <strong>Xuất báo cáo tổng hợp</strong>
                </div>
                <div>
                  {['pdf', 'html', 'csv', 'json'].map((format) => (
                    <button
                      key={format}
                      className="button secondary"
                      disabled={batch.status === 'running' || !!busy}
                      onClick={() => void download(format)}
                    >
                      {busy === format && <LoaderCircle size={13} className="spin" />}
                      {format === 'pdf' ? 'PDF tổng hợp' : format.toUpperCase()}
                    </button>
                  ))}
                </div>
                <p>
                  {batch.status === 'running'
                    ? 'Chờ hoàn tất hoặc hủy hàng đợi để xuất báo cáo.'
                    : 'Báo cáo dùng thương hiệu hiện tại của khách hàng, có kết quả và các website chưa hoàn tất.'}
                </p>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
