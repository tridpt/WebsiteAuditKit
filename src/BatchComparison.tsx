import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownUp,
  ArrowUpRight,
  CheckCircle2,
  Download,
  LoaderCircle,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { api, downloadBlob } from './api';
import { dateTime } from './components';
import { ProjectTrend } from './ProjectTrend';
import type { BatchComparison, BatchTrendInterval, Project, ProjectBatch } from './types';

const statusLabels: Record<string, string> = {
  improved: 'Cải thiện',
  regressed: 'Giảm điểm',
  unchanged: 'Không đổi',
  unverified: 'Chưa đủ dữ liệu',
  added: 'Website mới',
  removed: 'Không còn trong lần sau',
  completed: 'Hoàn tất',
  partial: 'Có website lỗi',
  cancelled: 'Đã hủy',
  interrupted: 'Bị gián đoạn',
};
const changeLabels: Record<string, string> = {
  new: 'Lỗi mới',
  persistent: 'Còn tồn tại',
  resolved: 'Đã sửa',
  unverified: 'Chưa xác minh',
};

function BatchChoice({ batch }: { batch: ProjectBatch }) {
  return (
    <>
      {dateTime(batch.createdAt)} · {statusLabels[batch.status] || batch.status}
    </>
  );
}

export function BatchComparison({
  project,
  onOpenReport,
  selectedPair,
}: {
  project: Project;
  onOpenReport: (id: string) => void;
  selectedPair?: { before: string; after: string } | null;
}) {
  const [batches, setBatches] = useState<ProjectBatch[]>([]);
  const [beforeId, setBeforeId] = useState('');
  const [afterId, setAfterId] = useState('');
  const [comparison, setComparison] = useState<BatchComparison | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [historyError, setHistoryError] = useState('');
  const [interval, setInterval] = useState<BatchTrendInterval>('weekly');
  const [trendUrl, setTrendUrl] = useState('');
  const finished = useMemo(
    () =>
      batches
        .filter((batch) => batch.status !== 'running')
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [batches],
  );
  const comparisonBase = `/api/projects/${project.id}/batch-comparison`;
  useEffect(() => {
    if (selectedPair) {
      setBeforeId(selectedPair.before);
      setAfterId(selectedPair.after);
      setComparison(null);
    }
  }, [selectedPair]);
  const beforeBatch = finished.find((batch) => batch.id === beforeId);
  const afterBatch = finished.find((batch) => batch.id === afterId);
  const pairError =
    beforeId && afterId && beforeId === afterId
      ? 'Chọn hai lần kiểm tra khác nhau.'
      : beforeBatch && afterBatch && beforeBatch.createdAt >= afterBatch.createdAt
        ? 'Chọn lần trước cũ hơn lần sau.'
        : '';
  useEffect(() => {
    const controller = new AbortController();
    let timer: number;
    async function load() {
      try {
        const data = await api<ProjectBatch[]>(`/api/projects/${project.id}/batches`, {
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          setBatches((current) =>
            JSON.stringify(current) === JSON.stringify(data) ? current : data,
          );
          setHistoryError('');
        }
      } catch (err) {
        if (!controller.signal.aborted) setHistoryError((err as Error).message);
      } finally {
        if (!controller.signal.aborted) timer = window.setTimeout(() => void load(), 2500);
      }
    }
    void load();
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [project.id]);
  useEffect(() => {
    if (finished.length < 2) {
      setBeforeId('');
      setAfterId('');
      setComparison(null);
      return;
    }
    setBeforeId((current) =>
      finished.some((batch) => batch.id === current) ? current : finished[finished.length - 2].id,
    );
    setAfterId((current) =>
      finished.some((batch) => batch.id === current) ? current : finished[finished.length - 1].id,
    );
  }, [finished]);
  useEffect(() => {
    if (!beforeId || !afterId || pairError) {
      setComparison(null);
      setLoading(false);
      setError('');
      return;
    }
    const controller = new AbortController();
    let timer: number;
    setLoading(true);
    setError('');
    async function load() {
      try {
        const data = await api<BatchComparison>(
          `${comparisonBase}?before=${encodeURIComponent(beforeId)}&after=${encodeURIComponent(afterId)}`,
          { signal: controller.signal },
        );
        if (!controller.signal.aborted) {
          setComparison(data);
          setError('');
          setTrendUrl((current) =>
            data.websites.some((site) => site.url === current)
              ? current
              : data.websites[0]?.url || '',
          );
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setComparison(null);
          setError((err as Error).message);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          timer = window.setTimeout(() => void load(), 10_000);
        }
      }
    }
    void load();
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [afterId, beforeId, comparisonBase, pairError]);
  async function download(format: string) {
    if (!comparison || busy) return;
    setBusy(format);
    setError('');
    try {
      const query = new URLSearchParams({
        before: beforeId,
        after: afterId,
        format,
        interval,
        url: trendUrl,
      });
      const response = await fetch(`${comparisonBase}/export?${query}`);
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || 'Không thể xuất bản so sánh.');
      }
      downloadBlob(await response.blob(), `project-comparison-${beforeId}-${afterId}.${format}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy('');
    }
  }
  return (
    <section
      className="panel project-section batch-comparison-panel"
      aria-label="So sánh các lần kiểm tra dự án"
    >
      <div className="batch-heading">
        <div>
          <h2>
            <ArrowDownUp size={19} />
            So sánh các lần kiểm tra
          </h2>
          <p className="project-section-hint">
            Đối chiếu điểm, lỗi mới, lỗi đã sửa và xu hướng theo từng website.
          </p>
        </div>
        <span className="batch-local">Theo URL và nguồn đo</span>
      </div>
      {historyError && (
        <p className="project-error" role="alert">
          Không tải được lịch sử: {historyError}
        </p>
      )}
      {finished.length < 2 ? (
        <p className="batch-empty">
          Cần ít nhất hai lần kiểm tra đã kết thúc để so sánh. Lần kiểm tra bị lỗi hoặc hủy vẫn được
          giữ lại, nhưng URL thiếu báo cáo sẽ hiển thị là chưa đủ dữ liệu.
        </p>
      ) : (
        <>
          <div className="comparison-controls">
            <label>
              Lần trước
              <select
                aria-label="Lần kiểm tra trước"
                value={beforeId}
                disabled={!!busy}
                onChange={(event) => {
                  setBeforeId(event.target.value);
                  setComparison(null);
                }}
              >
                {finished.map((batch) => (
                  <option key={batch.id} value={batch.id}>
                    <BatchChoice batch={batch} />
                  </option>
                ))}
              </select>
            </label>
            <ArrowDownUp size={15} className="comparison-arrow" aria-hidden="true" />
            <label>
              Lần sau
              <select
                aria-label="Lần kiểm tra sau"
                value={afterId}
                disabled={!!busy}
                onChange={(event) => {
                  setAfterId(event.target.value);
                  setComparison(null);
                }}
              >
                {finished.map((batch) => (
                  <option key={batch.id} value={batch.id}>
                    <BatchChoice batch={batch} />
                  </option>
                ))}
              </select>
            </label>
          </div>
          {(pairError || error) && (
            <p className="project-error" role="alert">
              {pairError || error}
            </p>
          )}
          {loading ? (
            <p className="loading-state">
              <LoaderCircle className="spin" size={15} />
              Đang đối chiếu hai lần kiểm tra…
            </p>
          ) : (
            comparison && (
              <>
                {comparison.warnings.length > 0 && (
                  <div className="comparison-warnings" role="note">
                    <AlertTriangle size={16} />
                    <div>
                      {comparison.warnings.map((warning) => (
                        <p key={warning}>{warning}</p>
                      ))}
                    </div>
                  </div>
                )}
                <div className="comparison-metrics">
                  <div>
                    <TrendingUp size={17} />
                    <strong>{comparison.totals.improved}</strong>
                    <span>website cải thiện</span>
                  </div>
                  <div>
                    <TrendingDown size={17} />
                    <strong>{comparison.totals.regressed}</strong>
                    <span>website giảm điểm</span>
                  </div>
                  <div>
                    <CheckCircle2 size={17} />
                    <strong>{comparison.totals.resolvedIssues}</strong>
                    <span>lỗi đã sửa</span>
                  </div>
                  <div>
                    <AlertTriangle size={17} />
                    <strong>{comparison.totals.newIssues}</strong>
                    <span>lỗi mới</span>
                  </div>
                </div>
                <div className="comparison-trend">
                  <h3>Xu hướng điểm theo website</h3>
                  <p className="project-section-hint">
                    12 kỳ đến lần kiểm tra sau đã chọn, từ tối đa 100 lần kiểm tra gần nhất của dự
                    án.
                  </p>
                  <div className="trend-controls">
                    <label>
                      Website
                      <select
                        aria-label="Website xem xu hướng"
                        value={trendUrl}
                        disabled={!!busy}
                        onChange={(event) => setTrendUrl(event.target.value)}
                      >
                        {comparison.websites.map((site) => (
                          <option key={site.url} value={site.url}>
                            {site.url}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Khoảng thời gian
                      <select
                        aria-label="Khoảng thời gian xu hướng"
                        value={interval}
                        disabled={!!busy}
                        onChange={(event) => setInterval(event.target.value as BatchTrendInterval)}
                      >
                        <option value="weekly">Theo tuần</option>
                        <option value="monthly">Theo tháng</option>
                      </select>
                    </label>
                  </div>
                  <ProjectTrend
                    trend={comparison.trends[interval]}
                    interval={interval}
                    url={trendUrl}
                  />
                </div>
                <div className="comparison-sites">
                  <h3>Đối chiếu từng website</h3>
                  <div className="comparison-site-list">
                    {comparison.websites.map((site) => (
                      <article key={site.url} className={`comparison-site ${site.status}`}>
                        <div className="comparison-site-heading">
                          <div>
                            <strong>{site.url}</strong>
                            <span className={`comparison-status ${site.status}`}>
                              {statusLabels[site.status]}
                            </span>
                          </div>
                          <b
                            className={
                              site.scoreDelta != null && site.scoreDelta < 0
                                ? 'down'
                                : site.scoreDelta != null && site.scoreDelta > 0
                                  ? 'up'
                                  : ''
                            }
                          >
                            {site.scoreDelta == null
                              ? '—'
                              : `${site.scoreDelta > 0 ? '+' : ''}${site.scoreDelta}`}
                          </b>
                        </div>
                        <div className="comparison-score-row">
                          <span>
                            Lần trước <strong>{site.before.score ?? '—'}</strong>
                          </span>
                          <ArrowDownUp size={13} />
                          <span>
                            Lần sau <strong>{site.after.score ?? '—'}</strong>
                          </span>
                        </div>
                        <p className="comparison-site-meta">
                          {site.counts.new} lỗi mới · {site.counts.persistent} còn tồn tại ·{' '}
                          {site.counts.resolved} đã sửa · {site.counts.unverified} chưa xác minh
                        </p>
                        <div className="comparison-measurements">
                          {(
                            [
                              ['Lần trước', site.before],
                              ['Lần sau', site.after],
                            ] as const
                          ).map(([label, measurement]) => (
                            <p key={label}>
                              <b>{label}:</b>{' '}
                              {measurement.createdAt
                                ? dateTime(measurement.createdAt)
                                : 'Chưa có phép đo'}
                              {measurement.source &&
                                ` · ${measurement.source} · ${measurement.device === 'mobile' ? 'Mobile' : 'Desktop'}`}
                              {measurement.scope &&
                                ` · ${measurement.scope.scannedPages} trang / ${measurement.scope.checkedLinks} liên kết`}
                              {measurement.error && ` · ${measurement.error}`}
                            </p>
                          ))}
                        </div>
                        {!site.scoreComparable && (
                          <p className="comparison-reason">
                            {site.scoreReason || 'Chưa đủ dữ liệu để so sánh điểm.'}
                          </p>
                        )}
                        {(site.before.reportId || site.after.reportId) && (
                          <div className="comparison-report-links">
                            <span>
                              {site.before.reportId ? (
                                <button
                                  className="text-button"
                                  onClick={() => onOpenReport(site.before.reportId!)}
                                >
                                  Mở lần trước <ArrowUpRight size={13} />
                                </button>
                              ) : (
                                'Không có báo cáo lần trước'
                              )}
                            </span>
                            <span>
                              {site.after.reportId ? (
                                <button
                                  className="text-button"
                                  onClick={() => onOpenReport(site.after.reportId!)}
                                >
                                  Mở lần sau <ArrowUpRight size={13} />
                                </button>
                              ) : (
                                'Không có báo cáo lần sau'
                              )}
                            </span>
                          </div>
                        )}
                        {Object.values(site.changes).some((items) => items.length > 0) && (
                          <details className="comparison-details">
                            <summary>
                              Xem thay đổi (
                              {Object.values(site.changes).reduce(
                                (count, items) => count + items.length,
                                0,
                              )}
                              )
                            </summary>
                            <ul>
                              {(['new', 'persistent', 'resolved', 'unverified'] as const).flatMap(
                                (bucket) =>
                                  site.changes[bucket].map((change) => (
                                    <li key={`${bucket}-${change.id}-${change.url}`}>
                                      <span className={`comparison-change ${bucket}`}>
                                        {changeLabels[bucket]}
                                      </span>
                                      <strong>{change.title}</strong>
                                      <small>{change.url}</small>
                                      <small>{change.reason}</small>
                                    </li>
                                  )),
                              )}
                            </ul>
                          </details>
                        )}
                      </article>
                    ))}
                  </div>
                </div>
                <div className="batch-exports comparison-exports">
                  <div>
                    <Download size={15} />
                    <strong>Xuất báo cáo so sánh</strong>
                  </div>
                  <div>
                    {['pdf', 'html', 'csv', 'json'].map((format) => (
                      <button
                        key={format}
                        className="button secondary"
                        disabled={!!busy}
                        onClick={() => void download(format)}
                      >
                        {busy === format && <LoaderCircle size={13} className="spin" />}
                        {format === 'pdf' ? 'PDF so sánh' : format.toUpperCase()}
                      </button>
                    ))}
                  </div>
                  <p>
                    PDF/HTML gồm biểu đồ đang chọn và đầy đủ thay đổi của mọi website. CSV/JSON gồm
                    cả xu hướng tuần và tháng. Dùng thương hiệu của khách hàng.
                  </p>
                </div>
              </>
            )
          )}
        </>
      )}
    </section>
  );
}
