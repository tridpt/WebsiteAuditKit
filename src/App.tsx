import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Clock3,
  FileDown,
  FileJson,
  FileSearch,
  Filter,
  FolderClock,
  Globe2,
  History,
  Info,
  LayoutDashboard,
  Leaf,
  ListChecks,
  LoaderCircle,
  Menu,
  Palette,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  TriangleAlert,
  Users,
  X,
} from 'lucide-react';
import { api, downloadBlob } from './api';
import { createDemo } from './demo';
import type {
  Branding,
  Client,
  Workspace,
  Category,
  Check as CheckType,
  Job,
  Monitor,
  MonitorInterval,
  ProjectSchedule,
  Report,
  ReportComparison,
  Severity,
  Summary,
} from './types';
import { ComparisonDetails } from './Comparison';
import { BrandingSettings, defaultBranding } from './Branding';
import { MonitorView } from './Monitoring';
import { ProjectsView, emptyWorkspace } from './Projects';
import {
  AuditForm,
  Brand,
  CategoryDetail,
  categoryKeys,
  categoryMeta,
  dateTime,
  EmptyState,
  HeroArt,
  IssueList,
  JobProgress,
  ScopeNote,
  ScoreCards,
  scoreColor,
  scoreLabel,
  WebsitePreview,
} from './components';

type View = 'overview' | 'history' | 'tasks' | 'monitors' | 'projects';
type ReportTab = 'overview' | Category;
function saved(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function remember(key: string, value: string | null) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {}
}

function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? 'wide' : ''}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-label={title}
    >
      <div className="modal-inner">
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="Đóng">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

function HistoryView({
  history,
  loading,
  onOpen,
  onDelete,
  onCompare,
  onNew,
  workspace,
}: {
  history: Summary[];
  loading: boolean;
  onOpen: (id: string) => void;
  onDelete: (s: Summary) => void;
  onCompare: (ids: string[]) => void;
  onNew: () => void;
  workspace: Workspace;
}) {
  const [query, setQuery] = useState('');
  const [order, setOrder] = useState('newest');
  const [selected, setSelected] = useState<string[]>([]);
  const [projectFilter, setProjectFilter] = useState('all');
  const results = history
    .filter(
      (r) =>
        projectFilter === 'all' ||
        (projectFilter === 'unassigned'
          ? !workspace.reports[r.id]
          : workspace.reports[r.id] === projectFilter),
    )
    .filter((r) => r.url.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) =>
      order === 'score'
        ? (a.score ?? -1) - (b.score ?? -1)
        : b.createdAt.localeCompare(a.createdAt),
    );
  const selectedValid = selected.filter((id) => history.some((r) => r.id === id));
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">MỖI LẦN KIỂM TRA, MỘT BƯỚC TIẾN</span>
          <h1>
            Lịch sử kiểm tra<span>.</span>
          </h1>
          <p>Nhìn lại, so sánh và thấy website tiến bộ từng ngày.</p>
        </div>
        <button className="button primary" onClick={onNew}>
          <Plus size={16} />
          Kiểm tra mới
        </button>
      </div>
      {loading ? (
        <div className="loading-state">
          <LoaderCircle className="spin" />
          Đang đọc lịch sử…
        </div>
      ) : history.length ? (
        <section className="panel history-panel">
          <div className="history-toolbar">
            {workspace.projects.length > 0 && (
              <select
                aria-label="Lọc báo cáo theo dự án"
                value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}
              >
                <option value="all">Mọi dự án</option>
                <option value="unassigned">Chưa gắn dự án</option>
                {workspace.projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            )}
            <div className="search-input">
              <Search size={16} />
              <input
                aria-label="Tìm báo cáo"
                placeholder="Tìm theo tên miền hoặc URL…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <select
              aria-label="Sắp xếp báo cáo"
              value={order}
              onChange={(e) => setOrder(e.target.value)}
            >
              <option value="newest">Mới nhất</option>
              <option value="score">Điểm thấp nhất</option>
            </select>
            <button
              className="button secondary"
              disabled={selectedValid.length !== 2}
              onClick={() => onCompare(selectedValid)}
            >
              So sánh <span>{selectedValid.length}/2</span>
            </button>
          </div>
          <div className="table-scroll">
            <table className="history-table">
              <thead>
                <tr>
                  <th aria-label="Chọn so sánh" />
                  <th>Website</th>
                  <th>Điểm</th>
                  <th>Việc cần sửa</th>
                  <th>Thời gian</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Chọn so sánh ${r.title} lúc ${dateTime(r.createdAt)}`}
                        checked={selectedValid.includes(r.id)}
                        disabled={!selectedValid.includes(r.id) && selectedValid.length >= 2}
                        onChange={() =>
                          setSelected(
                            selectedValid.includes(r.id)
                              ? selectedValid.filter((id) => id !== r.id)
                              : [...selectedValid, r.id],
                          )
                        }
                      />
                    </td>
                    <td>
                      <button className="history-site" onClick={() => onOpen(r.id)}>
                        <span className="site-icon">
                          <Globe2 size={18} />
                        </span>
                        <span>
                          <strong>{r.title}</strong>
                          <small>
                            {new URL(r.url).pathname} · {r.scope.scannedPages} trang ·{' '}
                            {r.device === 'mobile' ? 'Mobile' : 'Desktop'}
                          </small>
                        </span>
                        <ArrowUpRight size={14} />
                      </button>
                    </td>
                    <td>
                      <span className={`score-pill ${scoreColor(r.score)}`}>{r.score ?? '—'}</span>
                    </td>
                    <td>
                      <span>{r.issues - r.completed} còn lại</span>
                      <small>
                        {r.completed}/{r.issues} đã hoàn thành
                      </small>
                    </td>
                    <td className="date-cell">{dateTime(r.createdAt)}</td>
                    <td>
                      <button
                        className="icon-button danger-button"
                        onClick={() => onDelete(r)}
                        aria-label={`Xóa báo cáo ${r.title}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!results.length && <div className="table-empty">Không tìm thấy báo cáo phù hợp.</div>}
          <div className="history-footnote">
            <Info size={14} />
            Chọn hai báo cáo để so sánh. Báo cáo và ảnh chụp được lưu trên máy này.
          </div>
        </section>
      ) : (
        <section className="panel">
          <EmptyState
            icon={<FolderClock size={34} />}
            title="Câu chuyện bắt đầu từ lần kiểm tra đầu tiên"
          >
            Mỗi báo cáo thực tế sẽ được lưu tại đây. Bạn có thể quay lại bất cứ lúc nào để tiếp tục
            cải thiện.
            <button className="button primary" onClick={onNew}>
              Kiểm tra website đầu tiên
              <ArrowRight size={16} />
            </button>
          </EmptyState>
        </section>
      )}
    </>
  );
}

export default function App() {
  const [view, setView] = useState<View>('overview');
  const [report, setReport] = useState<Report | null>(() => createDemo());
  const [history, setHistory] = useState<Summary[]>([]);
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [projectSchedules, setProjectSchedules] = useState<ProjectSchedule[]>([]);
  const [loadingProjectSchedules, setLoadingProjectSchedules] = useState(true);
  const [branding, setBranding] = useState<Branding>({ ...defaultBranding });
  const [workspace, setWorkspace] = useState<Workspace>(emptyWorkspace);
  const [loadingWorkspace, setLoadingWorkspace] = useState(true);
  const [auditProjectId, setAuditProjectId] = useState('');
  const [brandingClientId, setBrandingClientId] = useState<string | null>(null);
  const [loadingBranding, setLoadingBranding] = useState(true);
  const [loadingMonitors, setLoadingMonitors] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [url, setUrl] = useState('');
  const [device, setDevice] = useState<'mobile' | 'desktop'>('mobile');
  const [maxPages, setMaxPages] = useState(5);
  const [jobId, setJobId] = useState<string | null>(() => saved('auditkit.activeJob'));
  const [job, setJob] = useState<Job | null>(null);
  const [starting, setStarting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [help, setHelp] = useState(false);
  const [sidebar, setSidebar] = useState(false);
  const [reportTab, setReportTab] = useState<ReportTab>('overview');
  const [priority, setPriority] = useState<'all' | Severity>('all');
  const [taskCategory, setTaskCategory] = useState<'all' | Category>('all');
  const [taskStatus, setTaskStatus] = useState('all');
  const [taskQuery, setTaskQuery] = useState('');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [image, setImage] = useState<{ src: string; label: string } | null>(null);
  const [deleting, setDeleting] = useState<Summary | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deletingMonitor, setDeletingMonitor] = useState<Monitor | null>(null);
  const [brandingOpen, setBrandingOpen] = useState(false);
  const [comparison, setComparison] = useState<ReportComparison | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const seenAlertIds = useRef<Set<string> | null>(null);
  const refreshHistory = useCallback(async () => {
    const data = await api<Summary[]>('/api/reports');
    setHistory(data);
    setLoadingHistory(false);
  }, []);
  const refreshMonitors = useCallback(async () => {
    const data = await api<Monitor[]>('/api/monitors');
    setMonitors(data);
    setLoadingMonitors(false);
  }, []);
  const refreshProjectSchedules = useCallback(async () => {
    setProjectSchedules(await api<ProjectSchedule[]>('/api/project-schedules'));
    setLoadingProjectSchedules(false);
  }, []);
  const unreadProjectAlerts = projectSchedules.reduce(
    (count, schedule) => count + schedule.unreadAlerts,
    0,
  );
  const unreadAlerts =
    unreadProjectAlerts + monitors.reduce((count, monitor) => count + monitor.unreadAlerts, 0);
  const refreshBranding = useCallback(async () => {
    const data = await api<Branding>('/api/branding');
    setBranding(data);
    setLoadingBranding(false);
  }, []);
  const refreshWorkspace = useCallback(async () => {
    const data = await api<Workspace>('/api/workspace');
    setWorkspace(data);
    setLoadingWorkspace(false);
  }, []);
  const reportProject = workspace.projects.find(
    (project) => project.id === workspace.reports[report?.id || ''],
  );
  const reportClient = workspace.clients.find((client) => client.id === reportProject?.clientId);
  const effectiveBranding = reportClient?.branding || branding;
  const brandingClient = workspace.clients.find((client) => client.id === brandingClientId);
  function openClientBranding(client: Client) {
    setBrandingClientId(client.id);
    setBrandingOpen(true);
  }
  const notify = useCallback((message: string) => setToast(message), []);
  const issues =
    report?.checks
      .filter((c) => ['warn', 'fail'].includes(c.status))
      .sort(
        (a, b) =>
          Number(a.done) - Number(b.done) ||
          ['high', 'medium', 'low'].indexOf(a.severity) -
            ['high', 'medium', 'low'].indexOf(b.severity),
      ) || [];
  const pendingCount = issues.filter((c) => !c.done).length;
  const doneCount = issues.filter((c) => c.done).length;
  const demo = report?.id === 'demo';
  const busy = starting || !!jobId;

  useEffect(() => {
    if (loadingMonitors || loadingProjectSchedules) return;
    const alerts = [
      ...monitors.flatMap((monitor) => monitor.notifications || []),
      ...projectSchedules.flatMap((schedule) => schedule.notifications || []),
    ];
    if (seenAlertIds.current) {
      const fresh = alerts.filter((alert) => !seenAlertIds.current!.has(alert.id) && !alert.readAt);
      if (fresh.length) notify(fresh[fresh.length - 1].message);
    }
    seenAlertIds.current = new Set(alerts.map((alert) => alert.id));
  }, [monitors, loadingMonitors, projectSchedules, loadingProjectSchedules, notify]);
  useEffect(() => {
    const timer = window.setInterval(
      () => {
        if (!document.hidden) {
          void refreshMonitors().catch(() => {});
          void refreshHistory().catch(() => {});
          void refreshWorkspace().catch(() => {});
          void refreshProjectSchedules().catch(() => {});
        }
      },
      view === 'monitors' || view === 'projects' ? 4000 : 12000,
    );
    return () => window.clearInterval(timer);
  }, [view, refreshMonitors, refreshHistory, refreshWorkspace, refreshProjectSchedules]);

  useEffect(() => {
    let mounted = true;
    refreshProjectSchedules().catch((e) => {
      if (mounted) {
        setError(e.message);
        setLoadingProjectSchedules(false);
      }
    });
    refreshHistory().catch((e) => {
      if (mounted) {
        setError(e.message);
        setLoadingHistory(false);
      }
    });
    refreshMonitors().catch((e) => {
      if (mounted) {
        setError(e.message);
        setLoadingMonitors(false);
      }
    });
    refreshBranding().catch((e) => {
      if (mounted) {
        setError(e.message);
        setLoadingBranding(false);
      }
    });
    refreshWorkspace().catch((e) => {
      if (mounted) {
        setError(e.message);
        setLoadingWorkspace(false);
      }
    });
    const last = saved('auditkit.lastReport');
    if (last)
      api<Report>(`/api/reports/${last}`)
        .then((r) => {
          if (mounted) setReport(r);
        })
        .catch(() => remember('auditkit.lastReport', null));
    return () => {
      mounted = false;
    };
  }, [refreshBranding, refreshHistory, refreshMonitors, refreshWorkspace, refreshProjectSchedules]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 4200);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!exportOpen) return;
    const close = (event: MouseEvent) => {
      if (!exportRef.current?.contains(event.target as Node)) setExportOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExportOpen(false);
    };
    document.addEventListener('click', close);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('keydown', key);
    };
  }, [exportOpen]);
  useEffect(() => {
    if (!jobId) return;
    let stopped = false;
    let timer: number;
    const poll = async () => {
      try {
        const current = await api<Job>(`/api/jobs/${jobId}`);
        if (stopped) return;
        setJob(current);
        if (current.status === 'completed') {
          const next = await api<Report>(`/api/reports/${jobId}`);
          await refreshWorkspace();
          if (stopped) return;
          setReport(next);
          setReportTab('overview');
          setView('overview');
          setJobId(null);
          setJob(null);
          setCancelling(false);
          remember('auditkit.activeJob', null);
          remember('auditkit.lastReport', next.id);
          notify('Báo cáo đã sẵn sàng. Cùng xem website có thể tốt hơn ở đâu.');
          await refreshHistory();
          await refreshMonitors();
          setTimeout(
            () => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
            120,
          );
        } else if (['failed', 'cancelled'].includes(current.status)) {
          if (current.status === 'failed') setError(current.error || 'Không thể kiểm tra website.');
          else notify('Đã hủy lần kiểm tra.');
          setJobId(null);
          setJob(null);
          setCancelling(false);
          remember('auditkit.activeJob', null);
          await refreshMonitors();
        } else timer = window.setTimeout(poll, 1000);
      } catch (e) {
        if (stopped) return;
        setError((e as Error).message);
        setJobId(null);
        setJob(null);
        setCancelling(false);
        remember('auditkit.activeJob', null);
      }
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [jobId, notify, refreshHistory, refreshMonitors, refreshWorkspace]);

  function navigate(next: View) {
    setView(next);
    setSidebar(false);
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function newAudit() {
    navigate('overview');
    setTimeout(() => {
      inputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      inputRef.current?.focus({ preventScroll: true });
    }, 80);
  }
  async function startAudit(inputUrl = url, projectId = auditProjectId) {
    setError('');
    setStarting(true);
    try {
      const result = await api<{ id: string }>('/api/audits', {
        method: 'POST',
        body: JSON.stringify({ url: inputUrl, device, maxPages, projectId: projectId || null }),
      });
      setJob({
        id: result.id,
        url: inputUrl,
        status: 'running',
        progress: 1,
        message: 'Chuẩn bị kiểm tra website…',
        startedAt: new Date().toISOString(),
      });
      setJobId(result.id);
      remember('auditkit.activeJob', result.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStarting(false);
    }
  }
  async function createMonitor(input: {
    name: string;
    url: string;
    device: 'mobile' | 'desktop';
    maxPages: number;
    interval: MonitorInterval;
  }) {
    await api('/api/monitors', { method: 'POST', body: JSON.stringify(input) });
    await refreshMonitors();
    notify('Đã lưu website vào danh sách theo dõi.');
  }
  async function saveBranding(input: Branding) {
    if (brandingClient) {
      await api(`/api/clients/${brandingClient.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ branding: input }),
      });
      await refreshWorkspace();
      setBrandingOpen(false);
      notify('Đã lưu thương hiệu riêng của khách hàng.');
      return;
    }
    const next = await api<Branding>('/api/branding', {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
    setBranding(next);
    setBrandingOpen(false);
    notify('Đã lưu nhận diện cho các bản xuất mới.');
  }
  async function runMonitor(id: string) {
    setError('');
    try {
      const result = await api<{
        id: string;
        url: string;
        device: 'mobile' | 'desktop';
        maxPages: number;
        monitorId: string;
      }>(`/api/monitors/${id}/run`, { method: 'POST' });
      setJob({
        id: result.id,
        url: result.url,
        device: result.device,
        maxPages: result.maxPages,
        monitorId: result.monitorId,
        status: 'running',
        progress: 1,
        message: 'Chuẩn bị lượt theo dõi…',
        startedAt: new Date().toISOString(),
      });
      setJobId(result.id);
      remember('auditkit.activeJob', result.id);
      navigate('overview');
      void refreshMonitors().catch(() => {});
    } catch (e) {
      setError((e as Error).message);
      await refreshMonitors().catch(() => {});
    }
  }
  async function toggleMonitor(monitor: Monitor) {
    try {
      await api(`/api/monitors/${monitor.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !monitor.active }),
      });
      await refreshMonitors();
      notify(monitor.active ? 'Đã tạm dừng lịch theo dõi.' : 'Đã bật lại lịch theo dõi.');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function removeMonitor(monitor: Monitor) {
    setDeleteBusy(true);
    try {
      await api(`/api/monitors/${monitor.id}`, { method: 'DELETE' });
      await refreshMonitors();
      setDeletingMonitor(null);
      notify('Đã xóa website khỏi danh sách theo dõi.');
    } catch (e) {
      setError((e as Error).message);
      setDeletingMonitor(null);
    } finally {
      setDeleteBusy(false);
    }
  }
  async function markMonitorRead(id: string) {
    try {
      await api(`/api/monitors/${id}/read`, { method: 'POST' });
      await refreshMonitors();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function cancelMonitorJob(id: string) {
    try {
      await api(`/api/jobs/${id}`, { method: 'DELETE' });
      await refreshMonitors();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function cancelAudit() {
    if (!jobId) return;
    setCancelling(true);
    try {
      await api(`/api/jobs/${jobId}`, { method: 'DELETE' });
    } catch (e) {
      setError((e as Error).message);
      setCancelling(false);
    }
  }
  async function openReport(id: string) {
    setLoadingReport(true);
    setError('');
    try {
      const [data] = await Promise.all([api<Report>(`/api/reports/${id}`), refreshWorkspace()]);
      setReport(data);
      setReportTab('overview');
      remember('auditkit.lastReport', id);
      navigate('overview');
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingReport(false);
    }
  }
  async function toggleTask(check: CheckType) {
    if (!report || pendingId) return;
    const id = report.id;
    setPendingId(check.id);
    try {
      if (id !== 'demo')
        await api(`/api/reports/${id}/checks/${check.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ done: !check.done }),
        });
      setReport((current) =>
        current?.id === id
          ? {
              ...current,
              checks: current.checks.map((c) =>
                c.id === check.id
                  ? { ...c, done: !check.done, workflow: check.done ? 'todo' : 'done' }
                  : c,
              ),
            }
          : current,
      );
      if (id !== 'demo') await refreshHistory();
      notify(
        check.done
          ? 'Đã đưa việc trở lại danh sách.'
          : id === 'demo'
            ? 'Đã hoàn thành việc mẫu. Chạy kiểm tra thật để lưu tiến độ.'
            : 'Đã lưu tiến độ. Kiểm tra lại website để cập nhật điểm.',
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPendingId(null);
    }
  }
  async function exportReport(format: string) {
    if (!report || exporting) return;
    setExportOpen(false);
    setExporting(true);
    try {
      if (demo) {
        if (format === 'json')
          downloadBlob(
            new Blob([JSON.stringify({ ...report, branding }, null, 2)], {
              type: 'application/json',
            }),
            'audit-mau.json',
          );
        else {
          const cell = (s: string) =>
            `"${(/^[\s]*[=+@-]/.test(s) ? "'" : '') + s.replace(/"/g, '""')}"`;
          const csv =
            '\uFEFF' +
            [
              [
                'Hạng mục',
                'Việc cần sửa',
                'Hướng khắc phục',
                'Trạng thái',
                'Đơn vị xuất báo cáo',
                'Khẩu hiệu',
                'Chân trang',
              ],
              ...issues.map((c) => [
                categoryMeta[c.category].label,
                c.title,
                c.recommendation,
                c.done ? 'Hoàn thành' : 'Chưa xong',
                branding.agencyName,
                branding.tagline,
                branding.footer,
              ]),
            ]
              .map((r) => r.map(cell).join(','))
              .join('\r\n');
          downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), 'audit-mau-tasks.csv');
        }
      } else {
        const response = await fetch(`/api/reports/${report.id}/export?format=${format}`);
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Chưa xuất được báo cáo.');
        }
        const filename =
          response.headers.get('content-disposition')?.match(/filename="?([^";]+)"?/)?.[1] ||
          `audit.${format}`;
        downloadBlob(await response.blob(), filename);
      }
      notify(`Đã tải ${format.toUpperCase()}${demo ? ' mẫu' : ''} về máy.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExporting(false);
    }
  }
  async function deleteReport() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await api(`/api/reports/${deleting.id}`, { method: 'DELETE' });
      if (report?.id === deleting.id) {
        setReport(null);
        remember('auditkit.lastReport', null);
      }
      await refreshHistory();
      await refreshMonitors();
      setDeleting(null);
      await refreshWorkspace();
      notify('Đã xóa báo cáo và ảnh chụp khỏi máy này.');
    } catch (e) {
      setError((e as Error).message);
      setDeleting(null);
    } finally {
      setDeleteBusy(false);
    }
  }
  async function compareReports(ids: string[]) {
    setLoadingReport(true);
    try {
      setComparison(
        await api<ReportComparison>(
          `/api/reports/compare?before=${encodeURIComponent(ids[0])}&after=${encodeURIComponent(ids[1])}`,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingReport(false);
    }
  }
  const showImage = (src: string, label: string) => setImage({ src, label });
  const filteredTasks = issues.filter(
    (c) =>
      (priority === 'all' || c.severity === priority) &&
      (taskCategory === 'all' || c.category === taskCategory) &&
      (taskStatus === 'all' || (taskStatus === 'done' ? c.done : !c.done)) &&
      `${c.title} ${c.recommendation}`
        .toLocaleLowerCase('vi')
        .includes(taskQuery.toLocaleLowerCase('vi')),
  );

  return (
    <div className="app-shell">
      {sidebar && (
        <button
          className="sidebar-backdrop"
          aria-label="Đóng menu"
          onClick={() => setSidebar(false)}
        />
      )}
      <aside className={`sidebar ${sidebar ? 'is-open' : ''}`}>
        <a
          className="brand-link"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate('overview');
          }}
          aria-label="Website Audit Kit, trang tổng quan"
        >
          <Brand />
        </a>
        <span className="nav-label">KHÔNG GIAN LÀM VIỆC</span>
        <nav aria-label="Điều hướng chính">
          {(
            [
              { id: 'overview', label: 'Tổng quan', icon: LayoutDashboard },
              { id: 'history', label: 'Lịch sử kiểm tra', icon: History },
              { id: 'tasks', label: 'Việc cần sửa', icon: ListChecks },
              { id: 'monitors', label: 'Theo dõi', icon: Bell },
              { id: 'projects', label: 'Khách hàng & dự án', icon: Users },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              className={`nav-item ${view === item.id ? 'active' : ''}`}
              onClick={() => navigate(item.id)}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
              {item.id === 'history' && history.length > 0 ? (
                <small>{history.length}</small>
              ) : item.id === 'tasks' && pendingCount > 0 ? (
                <small>{pendingCount}</small>
              ) : item.id === 'projects' && unreadProjectAlerts > 0 ? (
                <small>{unreadProjectAlerts}</small>
              ) : item.id === 'monitors' &&
                monitors.reduce((count, monitor) => count + monitor.unreadAlerts, 0) > 0 ? (
                <small>
                  {monitors.reduce((count, monitor) => count + monitor.unreadAlerts, 0)}
                </small>
              ) : null}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="note-leaf">
              <Leaf size={22} />
            </span>
            <h3>
              Một website tốt hơn,
              <br />
              từ những điều nhỏ.
            </h3>
            <p>
              Hiểu điều cần sửa.
              <br />
              Biết nên bắt đầu từ đâu.
            </p>
            <button onClick={() => setHelp(true)}>
              Khám phá cách hoạt động
              <ArrowUpRight size={14} />
            </button>
            <span className="note-decoration" />
          </div>
          <button className="help-nav" onClick={() => setHelp(true)}>
            <CircleHelp size={17} />
            Hướng dẫn sử dụng
            <ArrowUpRight size={13} />
          </button>
          <div className="workspace-person">
            <span className="avatar">W</span>
            <div>
              <strong>Không gian của bạn</strong>
              <small>Local workspace</small>
            </div>
            <span className="online-dot" />
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Mở menu"
              onClick={() => setSidebar(true)}
            >
              <Menu size={21} />
            </button>
            <span>Workspace</span>
            <span className="breadcrumb-slash">/</span>
            <strong>
              {view === 'overview'
                ? 'Tổng quan'
                : view === 'history'
                  ? 'Lịch sử kiểm tra'
                  : view === 'tasks'
                    ? 'Việc cần sửa'
                    : view === 'projects'
                      ? 'Khách hàng & dự án'
                      : 'Theo dõi'}
            </strong>
          </div>
          <div className="topbar-actions">
            <span className="local-badge">
              <span />
              Chạy trên máy của bạn
            </span>
            <span className="topbar-divider" />
            <button
              className="icon-button"
              aria-label="Cài đặt báo cáo thương hiệu"
              title="Cài đặt báo cáo thương hiệu"
              onClick={() => {
                setBrandingClientId(null);
                setBrandingOpen(true);
              }}
            >
              <Palette size={18} />
            </button>
            <button
              className="icon-button monitor-bell"
              aria-label={`Cảnh báo theo dõi: ${unreadAlerts} chưa đọc`}
              onClick={() => navigate(unreadProjectAlerts > 0 ? 'projects' : 'monitors')}
            >
              <Bell size={18} />
              {unreadAlerts > 0 && <span className="monitor-bell-dot" />}
            </button>
            <button
              className="icon-button"
              aria-label="Hướng dẫn và phương pháp kiểm tra"
              onClick={() => setHelp(true)}
            >
              <CircleHelp size={19} />
            </button>
            <span className="top-avatar">W</span>
          </div>
        </header>
        <main>
          {error && (
            <div className="error-banner" role="alert">
              <TriangleAlert size={19} />
              <span>{error}</span>
              <button
                className="icon-button"
                onClick={() => setError('')}
                aria-label="Ẩn thông báo lỗi"
              >
                <X size={17} />
              </button>
            </div>
          )}
          {view === 'overview' && (
            <>
              <section className="intro">
                <div>
                  <div className="eyebrow">
                    <span />
                    HIỂU WEBSITE. CẢI THIỆN MỖI NGÀY.
                  </div>
                  <h1>
                    Một góc nhìn rõ ràng.
                    <br />
                    Một website <span>tốt hơn.</span>
                  </h1>
                  <p>
                    Tốc độ, mobile, liên kết và SEO — tất cả trong một báo cáo.
                    <br className="desktop-br" /> Biết điều cần sửa, bắt đầu từ việc quan trọng
                    nhất.
                  </p>
                </div>
                <HeroArt />
              </section>
              {workspace.projects.length > 0 && (
                <div className="audit-project-context">
                  <label>
                    Lưu báo cáo vào dự án
                    <select
                      aria-label="Dự án cho lần kiểm tra"
                      value={auditProjectId}
                      disabled={busy}
                      onChange={(e) => setAuditProjectId(e.target.value)}
                    >
                      <option value="">Chưa gắn dự án</option>
                      {workspace.projects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {workspace.clients.find((client) => client.id === project.clientId)?.name}{' '}
                          · {project.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
              <AuditForm
                url={url}
                setUrl={setUrl}
                device={device}
                setDevice={setDevice}
                maxPages={maxPages}
                setMaxPages={setMaxPages}
                busy={busy}
                onSubmit={() => void startAudit()}
                inputRef={inputRef}
              />
              {job && <JobProgress job={job} cancelling={cancelling} onCancel={cancelAudit} />}
              {report ? (
                <div className="report-section" ref={resultRef}>
                  {demo && (
                    <div className="demo-notice">
                      <span>
                        <Sparkles size={14} />
                        <strong>Báo cáo mẫu</strong>
                        <i />
                        Khám phá một báo cáo trước khi bắt đầu.
                      </span>
                      <button onClick={() => setReport(null)} aria-label="Ẩn báo cáo mẫu">
                        <X size={15} />
                      </button>
                    </div>
                  )}
                  <div className="report-heading">
                    <div className="report-identity">
                      <span className="site-icon">
                        <Globe2 size={23} />
                      </span>
                      <div>
                        <h2>
                          {report.title}
                          <a
                            href={report.url}
                            target="_blank"
                            rel="noreferrer"
                            aria-label="Mở website trong tab mới"
                          >
                            <ArrowUpRight size={14} />
                          </a>
                        </h2>
                        <p>
                          {demo ? 'Dữ liệu minh họa' : dateTime(report.createdAt)}
                          <i />
                          {report.device === 'mobile' ? 'Mobile' : 'Desktop'}
                          <i />
                          {report.scope.scannedPages} trang đã đọc
                        </p>
                      </div>
                    </div>
                    <div className="report-actions">
                      <span className="report-duration">
                        <CheckCircle2 size={14} />
                        {(report.duration / 1000).toFixed(0)} giây
                      </span>
                      <div className="export-wrap" ref={exportRef}>
                        <button
                          className="button secondary"
                          onClick={() => setExportOpen(!exportOpen)}
                          disabled={exporting}
                          aria-expanded={exportOpen}
                        >
                          {exporting ? (
                            <LoaderCircle size={15} className="spin" />
                          ) : (
                            <ArrowDownToLine size={15} />
                          )}
                          <span>{exporting ? 'Đang xuất…' : 'Xuất báo cáo'}</span>
                          <ChevronDown size={13} />
                        </button>
                        {exportOpen && (
                          <div className="export-menu">
                            <div className="export-branding-note">
                              <Palette size={14} />
                              <span>
                                Nhận diện: <strong>{effectiveBranding.agencyName}</strong>
                                <small>PDF và HTML dùng cấu hình này</small>
                              </span>
                              <button
                                className="text-button"
                                onClick={() => {
                                  setExportOpen(false);
                                  setBrandingClientId(reportClient?.id || null);
                                  setBrandingOpen(true);
                                }}
                              >
                                Sửa
                              </button>
                            </div>
                            {!demo && (
                              <>
                                <button onClick={() => exportReport('pdf')}>
                                  <FileDown size={16} />
                                  <span>
                                    PDF<small>Gửi cho khách hàng</small>
                                  </span>
                                </button>
                                <button onClick={() => exportReport('html')}>
                                  <FileSearch size={16} />
                                  <span>
                                    HTML<small>Báo cáo mở bằng trình duyệt</small>
                                  </span>
                                </button>
                              </>
                            )}
                            <button onClick={() => exportReport('csv')}>
                              <ListChecks size={16} />
                              <span>
                                CSV<small>Danh sách việc cần sửa</small>
                              </span>
                            </button>
                            <button onClick={() => exportReport('json')}>
                              <FileJson size={16} />
                              <span>
                                JSON<small>Dữ liệu và bằng chứng đầy đủ</small>
                              </span>
                            </button>
                            {demo && <p>PDF & HTML có sau khi kiểm tra website thật.</p>}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  {!demo && workspace.projects.length > 0 && (
                    <div className="report-project-context">
                      <label>
                        Dự án của báo cáo
                        <select
                          aria-label="Dự án của báo cáo"
                          value={reportProject?.id || ''}
                          disabled={loadingReport}
                          onChange={async (e) => {
                            const projectId = e.target.value || null;
                            setLoadingReport(true);
                            try {
                              await api(`/api/reports/${report.id}/project`, {
                                method: 'PATCH',
                                body: JSON.stringify({ projectId }),
                              });
                              await refreshWorkspace();
                              notify('Đã cập nhật dự án của báo cáo.');
                            } catch (error) {
                              setError((error as Error).message);
                            } finally {
                              setLoadingReport(false);
                            }
                          }}
                        >
                          <option value="">Chưa gắn dự án</option>
                          {workspace.projects.map((project) => (
                            <option key={project.id} value={project.id}>
                              {
                                workspace.clients.find((client) => client.id === project.clientId)
                                  ?.name
                              }{' '}
                              · {project.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      {reportClient && (
                        <span>
                          <Users size={13} />
                          {reportClient.name} ·{' '}
                          {reportClient.branding ? 'Thương hiệu riêng' : 'Thương hiệu chung'}
                        </span>
                      )}
                    </div>
                  )}
                  <ScoreCards report={report} onCategory={setReportTab} />
                  <div className="report-tabs" role="tablist" aria-label="Các phần báo cáo">
                    {(
                      [
                        { key: 'overview', label: 'Tổng quan' },
                        ...categoryKeys.map((key) => ({
                          key,
                          label: key === 'mobile' ? 'Giao diện mobile' : categoryMeta[key].label,
                        })),
                      ] as { key: ReportTab; label: string }[]
                    ).map((tab) => (
                      <button
                        id={`tab-${tab.key}`}
                        role="tab"
                        aria-selected={reportTab === tab.key}
                        aria-controls={`panel-${reportTab}`}
                        key={tab.key}
                        className={reportTab === tab.key ? 'active' : ''}
                        onClick={() => setReportTab(tab.key)}
                      >
                        {tab.label}
                        {tab.key === 'overview' && <span>{issues.length}</span>}
                      </button>
                    ))}
                  </div>
                  <div
                    role="tabpanel"
                    id={`panel-${reportTab}`}
                    aria-labelledby={`tab-${reportTab}`}
                  >
                    {reportTab === 'overview' ? (
                      <div className="overview-grid">
                        <section className="panel action-panel">
                          <div className="panel-heading">
                            <div>
                              <h3>
                                Bắt đầu từ những việc này{' '}
                                <span className="count-badge">{pendingCount}</span>
                              </h3>
                              <p>Những thay đổi nhỏ, tạo khác biệt lớn.</p>
                            </div>
                            <span className="panel-heading-icon">
                              <ListChecks size={19} />
                            </span>
                          </div>
                          <div className="issue-filter">
                            <button
                              className={priority === 'all' ? 'active' : ''}
                              onClick={() => setPriority('all')}
                            >
                              Tất cả<span>{issues.length}</span>
                            </button>
                            <button
                              className={priority === 'high' ? 'active' : ''}
                              onClick={() => setPriority('high')}
                            >
                              <span className="high-dot" />
                              Ưu tiên cao
                              <span>{issues.filter((c) => c.severity === 'high').length}</span>
                            </button>
                            <button
                              className={priority === 'medium' ? 'active' : ''}
                              onClick={() => setPriority('medium')}
                            >
                              Nên cải thiện
                            </button>
                          </div>
                          <IssueList
                            checks={issues
                              .filter((c) => priority === 'all' || c.severity === priority)
                              .slice(0, 4)}
                            onToggle={toggleTask}
                            pendingId={pendingId}
                            compact
                          />
                          <button
                            className="all-tasks-button"
                            onClick={() => {
                              setPriority('all');
                              navigate('tasks');
                            }}
                          >
                            Xem tất cả {issues.length} việc cần sửa
                            <ArrowRight size={14} />
                          </button>
                          <div className="progress-footer">
                            <CheckCheck size={15} />
                            <span>
                              {doneCount}/{issues.length} việc đã hoàn thành
                            </span>
                            <div className="mini-track">
                              <span
                                style={{
                                  width: `${issues.length ? (doneCount / issues.length) * 100 : 100}%`,
                                }}
                              />
                            </div>
                          </div>
                        </section>
                        <div className="overview-aside">
                          <WebsitePreview report={report} onImage={showImage} />
                          <ScopeNote report={report} onHelp={() => setHelp(true)} />
                        </div>
                      </div>
                    ) : (
                      <CategoryDetail
                        key={`${report.id}-${reportTab}`}
                        category={reportTab}
                        report={report}
                        onToggle={toggleTask}
                        pendingId={pendingId}
                        onImage={showImage}
                      />
                    )}
                  </div>
                  {report.warnings.length > 0 && (
                    <details className="warnings">
                      <summary>
                        <TriangleAlert size={15} />
                        {report.warnings.length} lưu ý về phạm vi kiểm tra
                        <ChevronDown size={14} />
                      </summary>
                      <ul>
                        {report.warnings.map((w, i) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              ) : (
                <>
                  <div className="feature-grid">
                    {categoryKeys.map((key) => {
                      const Icon = categoryMeta[key].icon;
                      return (
                        <div key={key}>
                          <span className={`icon-square ${categoryMeta[key].color}`}>
                            <Icon size={22} />
                          </span>
                          <h3>{categoryMeta[key].label}</h3>
                          <p>
                            {key === 'performance'
                              ? 'Đo phản hồi và thời gian hiển thị nội dung.'
                              : key === 'mobile'
                                ? 'Xem bố cục, cỡ chữ và vùng bấm trên điện thoại.'
                                : key === 'links'
                                  ? 'Tìm đường dẫn lỗi và các chuyển hướng thừa.'
                                  : 'Kiểm tra tiêu đề, mô tả và cấu trúc trang.'}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                  <button
                    className="sample-again"
                    onClick={() => {
                      setReport(createDemo());
                      setReportTab('overview');
                    }}
                  >
                    Xem thử một báo cáo mẫu
                    <ArrowRight size={14} />
                  </button>
                </>
              )}
            </>
          )}
          {view === 'history' && (
            <HistoryView
              history={history}
              loading={loadingHistory}
              onOpen={openReport}
              onDelete={setDeleting}
              onCompare={compareReports}
              onNew={newAudit}
              workspace={workspace}
            />
          )}
          {view === 'tasks' && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">BIẾN BÁO CÁO THÀNH HÀNH ĐỘNG</span>
                  <h1>
                    Từng việc nhỏ. Tiến bộ lớn<span>.</span>
                  </h1>
                  <p>
                    {report ? (
                      <>
                        Việc cần sửa của <strong>{report.title}</strong>
                        {demo ? ' · Báo cáo mẫu' : ''}.
                      </>
                    ) : (
                      'Danh sách việc cụ thể từ báo cáo website của bạn.'
                    )}
                  </p>
                </div>
                <button className="button secondary" onClick={() => navigate('overview')}>
                  <ArrowLeft size={15} />
                  Về báo cáo
                </button>
              </div>
              {report ? (
                <>
                  <div className="task-summary">
                    <div>
                      <span className="task-number">{pendingCount}</span>
                      <span>việc còn lại</span>
                    </div>
                    <div>
                      <CheckCircle2 size={17} />
                      <strong>{doneCount}</strong>
                      <span>đã hoàn thành</span>
                    </div>
                    <div className="task-summary-bar">
                      <span
                        style={{
                          width: `${issues.length ? (doneCount / issues.length) * 100 : 100}%`,
                        }}
                      />
                    </div>
                    <small>Điểm được cập nhật khi kiểm tra lại website</small>
                  </div>
                  <section className="panel tasks-panel">
                    <div className="task-toolbar">
                      <div className="search-input">
                        <Search size={16} />
                        <input
                          aria-label="Tìm việc cần sửa"
                          placeholder="Tìm việc cần sửa…"
                          value={taskQuery}
                          onChange={(e) => setTaskQuery(e.target.value)}
                        />
                      </div>
                      <select
                        aria-label="Lọc hạng mục"
                        value={taskCategory}
                        onChange={(e) => setTaskCategory(e.target.value as 'all' | Category)}
                      >
                        <option value="all">Mọi hạng mục</option>
                        {categoryKeys.map((key) => (
                          <option key={key} value={key}>
                            {categoryMeta[key].label}
                          </option>
                        ))}
                      </select>
                      <select
                        aria-label="Lọc ưu tiên"
                        value={priority}
                        onChange={(e) => setPriority(e.target.value as 'all' | Severity)}
                      >
                        <option value="all">Mọi mức ưu tiên</option>
                        <option value="high">Ưu tiên cao</option>
                        <option value="medium">Nên cải thiện</option>
                        <option value="low">Tối ưu thêm</option>
                      </select>
                      <select
                        aria-label="Lọc trạng thái"
                        value={taskStatus}
                        onChange={(e) => setTaskStatus(e.target.value)}
                      >
                        <option value="all">Mọi trạng thái</option>
                        <option value="pending">Chưa hoàn thành</option>
                        <option value="done">Đã hoàn thành</option>
                      </select>
                    </div>
                    <IssueList checks={filteredTasks} onToggle={toggleTask} pendingId={pendingId} />
                  </section>
                  <p className="task-footnote">
                    <Info size={14} />
                    Đánh dấu hoàn thành để theo dõi công việc. Chạy lại kiểm tra để xác minh các
                    thay đổi trên website.
                  </p>
                </>
              ) : (
                <section className="panel">
                  <EmptyState
                    icon={<ListChecks size={30} />}
                    title="Một kế hoạch rõ ràng đang chờ bạn"
                  >
                    Kiểm tra website để nhận danh sách việc cần sửa, sắp xếp theo mức ưu tiên.
                    <button className="button primary" onClick={newAudit}>
                      Bắt đầu kiểm tra
                      <ArrowRight size={16} />
                    </button>
                  </EmptyState>
                </section>
              )}
            </>
          )}
          {view === 'projects' && (
            <ProjectsView
              workspace={workspace}
              history={history}
              monitors={monitors}
              projectSchedules={projectSchedules}
              loading={loadingWorkspace}
              onRefresh={async () => {
                await Promise.all([
                  refreshWorkspace(),
                  refreshHistory(),
                  refreshMonitors(),
                  refreshProjectSchedules(),
                ]);
              }}
              onOpenReport={openReport}
              onBranding={openClientBranding}
              onRunMonitor={runMonitor}
              onCreateMonitor={async (project, url) => {
                await api('/api/monitors', {
                  method: 'POST',
                  body: JSON.stringify({
                    name: `${project.name}`.slice(0, 80),
                    url,
                    device: 'mobile',
                    maxPages: 5,
                    interval: 'weekly',
                    projectId: project.id,
                  }),
                });
              }}
              onAudit={(project, inputUrl) => {
                if (busy) {
                  navigate('overview');
                  return;
                }
                setAuditProjectId(project.id);
                setUrl(inputUrl);
                navigate('overview');
                void startAudit(inputUrl, project.id);
              }}
            />
          )}
          {view === 'monitors' && (
            <MonitorView
              monitors={monitors}
              loading={loadingMonitors}
              onCreate={createMonitor}
              onRun={runMonitor}
              onToggle={toggleMonitor}
              onDelete={setDeletingMonitor}
              onOpenReport={openReport}
              onCompare={compareReports}
              onReadAlerts={markMonitorRead}
              onCancelJob={cancelMonitorJob}
              onUpdate={async (id, input) => {
                await api(`/api/monitors/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
                await refreshMonitors();
                notify('Đã cập nhật lịch theo dõi.');
              }}
            />
          )}
          <footer className="page-footer">
            <span>
              <Leaf size={13} />
              Một chút tốt hơn, mỗi ngày.
            </span>
            <span>
              Website Audit Kit <i /> v1.0
            </span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          <span>{toast}</span>
          <button onClick={() => setToast('')} aria-label="Đóng thông báo">
            <X size={15} />
          </button>
        </div>
      )}
      {loadingReport && (
        <div className="loading-overlay" role="status">
          <LoaderCircle className="spin" size={24} />
          Đang đọc báo cáo…
        </div>
      )}
      {help && (
        <Modal title="Hiểu kết quả. Bắt đầu đúng chỗ." onClose={() => setHelp(false)}>
          <div className="help-content">
            <p className="modal-lead">Một URL. Bốn góc nhìn. Một kế hoạch cải thiện website.</p>
            <div className="help-steps">
              {[
                [
                  '01',
                  'Nhập website công khai',
                  'Chọn thiết bị đo tốc độ và tối đa 1, 5 hoặc 10 trang cùng website.',
                ],
                [
                  '02',
                  'Đọc bằng chứng, chọn việc ưu tiên',
                  'Mở từng việc để xem lỗi ở đâu, cách khắc phục và thời gian tham khảo.',
                ],
                [
                  '03',
                  'Theo dõi tiến độ, kiểm tra lại',
                  'Đánh dấu việc đã làm, xuất PDF/CSV và so sánh các lần kiểm tra trong Lịch sử.',
                ],
              ].map(([n, title, desc]) => (
                <div key={n}>
                  <span>{n}</span>
                  <div>
                    <h3>{title}</h3>
                    <p>{desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="methodology">
              <h3>
                <Info size={16} />
                Phạm vi & cách tính điểm
              </h3>
              <p>
                {report?.methodology ||
                  'Điểm Tốc độ lấy từ Lighthouse khi đo thành công; các hạng mục khác dùng các kiểm tra Website Audit Kit. SEO đọc HTML máy chủ; mobile và hiệu năng chỉ đo trang đầu.'}
              </p>
              <p>
                Lighthouse tự tính điểm Tốc độ từ các chỉ số hiệu năng. Các hạng mục khác dùng trọng
                số: đạt = 100%, cần cải thiện = 50%, lỗi = 0%; mục thông tin không tính điểm. Điểm
                tổng là trung bình các hạng mục có dữ liệu. JSON có cấu hình và bằng chứng đo.
              </p>
              <p>
                Thiếu dữ liệu trình duyệt sẽ làm phạm vi điểm hẹp hơn; các kiểm tra chưa đo được
                được ghi rõ. Không truy cập trang đăng nhập, thực hiện POST hoặc mở kết nối
                WebSocket. Crawler tôn trọng các quy tắc robots.txt đã đọc.
              </p>
            </div>
            <div className="privacy-line">
              <ShieldCheck size={17} />
              <p>
                Báo cáo và ảnh chụp được lưu trong thư mục <code>data/reports</code> của ứng dụng.
                Không cần tài khoản hay API key. Không có dịch vụ phân tích bên thứ ba.
              </p>
            </div>
            <button className="button primary" onClick={() => setHelp(false)}>
              Đã hiểu
              <Check size={16} />
            </button>
          </div>
        </Modal>
      )}
      {image && (
        <Modal title={image.label} onClose={() => setImage(null)} wide>
          <div className="image-modal">
            <img src={image.src} alt={image.label} />
          </div>
        </Modal>
      )}
      {brandingOpen && (
        <Modal
          title={
            brandingClient ? `Thương hiệu · ${brandingClient.name}` : 'Báo cáo theo thương hiệu'
          }
          onClose={() => setBrandingOpen(false)}
        >
          {loadingBranding ? (
            <div className="loading-state">
              <LoaderCircle className="spin" />
              Đang đọc cấu hình…
            </div>
          ) : (
            <BrandingSettings
              key={brandingClient?.id || 'global'}
              branding={brandingClient?.branding || branding}
              onSave={saveBranding}
              onUseGlobal={
                brandingClient
                  ? async () => {
                      await api(`/api/clients/${brandingClient.id}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ branding: null }),
                      });
                      await refreshWorkspace();
                      setBrandingOpen(false);
                      notify('Khách hàng đã dùng cấu hình thương hiệu chung.');
                    }
                  : undefined
              }
            />
          )}
        </Modal>
      )}
      {deleting && (
        <Modal title="Xóa báo cáo này?" onClose={() => !deleteBusy && setDeleting(null)}>
          <p className="delete-message">
            Báo cáo của <strong>{deleting.title}</strong> lúc {dateTime(deleting.createdAt)}, tiến
            độ công việc và ảnh chụp kèm theo sẽ được xóa khỏi máy này.
          </p>
          <div className="modal-actions">
            <button
              className="button secondary"
              disabled={deleteBusy}
              onClick={() => setDeleting(null)}
            >
              Giữ báo cáo
            </button>
            <button className="button danger" disabled={deleteBusy} onClick={deleteReport}>
              {deleteBusy ? <LoaderCircle className="spin" size={15} /> : <Trash2 size={15} />}Xóa
              báo cáo
            </button>
          </div>
        </Modal>
      )}
      {comparison && (
        <Modal title="Nhìn lại sự thay đổi" onClose={() => setComparison(null)} wide>
          <ComparisonDetails data={comparison} />
        </Modal>
      )}
      {deletingMonitor && (
        <Modal
          title="Xóa theo dõi website?"
          onClose={() => !deleteBusy && setDeletingMonitor(null)}
        >
          <p className="delete-message">
            Dừng lịch theo dõi và xóa cấu hình của <strong>{deletingMonitor.name}</strong>. Các báo
            cáo audit đã lưu vẫn có trong Lịch sử.
          </p>
          <div className="modal-actions">
            <button
              className="button secondary"
              disabled={deleteBusy}
              onClick={() => setDeletingMonitor(null)}
            >
              Giữ theo dõi
            </button>
            <button
              className="button danger"
              disabled={deleteBusy}
              onClick={() => void removeMonitor(deletingMonitor)}
            >
              {deleteBusy ? <LoaderCircle size={15} className="spin" /> : <Trash2 size={15} />}Xóa
              theo dõi
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
