import { useEffect, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  Bell,
  Building2,
  Check,
  FolderOpen,
  Globe2,
  LoaderCircle,
  Palette,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
} from 'lucide-react';
import { api } from './api';
import { dateTime, EmptyState } from './components';
import { BatchAudit } from './BatchAudit';
import { BatchComparison } from './BatchComparison';
import { ProjectSchedulePanel } from './ProjectSchedule';
import type {
  Client,
  Project,
  ProjectTask,
  Workspace,
  Summary,
  Monitor,
  ProjectSchedule,
  Check as AuditCheck,
} from './types';

export const emptyWorkspace: Workspace = {
  version: 1,
  clients: [],
  projects: [],
  reports: {},
  monitors: {},
};
type ClientInput = Pick<Client, 'name' | 'contact' | 'notes'>;
type ProjectInput = Pick<Project, 'name' | 'clientId' | 'notes' | 'websites'>;

function ClientForm({
  initial,
  onSave,
  onCancel,
  busy,
}: {
  initial: Client | null;
  onSave: (input: ClientInput) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [input, setInput] = useState<ClientInput>({
    name: initial?.name || '',
    contact: initial?.contact || '',
    notes: initial?.notes || '',
  });
  return (
    <form
      className="panel project-editor"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(input);
      }}
    >
      <h2>{initial ? 'Sửa khách hàng' : 'Khách hàng mới'}</h2>
      <fieldset disabled={busy}>
        <label>
          Tên khách hàng
          <input
            aria-label="Tên khách hàng"
            value={input.name}
            onChange={(e) => setInput({ ...input, name: e.target.value })}
            maxLength={80}
            required
            placeholder="Ví dụ: Mộc Studio"
          />
        </label>
        <label>
          Thông tin liên hệ
          <input
            aria-label="Liên hệ khách hàng"
            value={input.contact}
            onChange={(e) => setInput({ ...input, contact: e.target.value })}
            maxLength={160}
            placeholder="Email, số điện thoại hoặc người liên hệ"
          />
        </label>
        <label className="wide-field">
          Ghi chú
          <textarea
            aria-label="Ghi chú khách hàng"
            value={input.notes}
            onChange={(e) => setInput({ ...input, notes: e.target.value })}
            maxLength={500}
            rows={2}
          />
        </label>
      </fieldset>
      <div className="project-form-actions">
        <button className="button secondary" type="button" disabled={busy} onClick={onCancel}>
          Hủy
        </button>
        <button className="button primary" disabled={busy}>
          {busy ? <LoaderCircle size={14} className="spin" /> : <Check size={14} />}Lưu khách hàng
        </button>
      </div>
    </form>
  );
}

function ProjectForm({
  initial,
  clients,
  clientId,
  onSave,
  onCancel,
  busy,
}: {
  initial: Project | null;
  clients: Client[];
  clientId: string;
  onSave: (input: ProjectInput) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [name, setName] = useState(initial?.name || '');
  const [owner, setOwner] = useState(initial?.clientId || clientId || clients[0]?.id || '');
  const [websites, setWebsites] = useState(initial?.websites.join('\n') || '');
  const [notes, setNotes] = useState(initial?.notes || '');
  function submit(event: FormEvent) {
    event.preventDefault();
    onSave({
      name,
      clientId: owner,
      websites: websites
        .split(/\r?\n/)
        .map((url) => url.trim())
        .filter(Boolean),
      notes,
    });
  }
  return (
    <form className="panel project-editor" onSubmit={submit}>
      <h2>{initial ? 'Sửa dự án' : 'Dự án mới'}</h2>
      <fieldset disabled={busy}>
        <label>
          Tên dự án
          <input
            aria-label="Tên dự án khách hàng"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            required
            placeholder="Ví dụ: Chăm sóc website 2026"
          />
        </label>
        <label>
          Khách hàng
          <select
            aria-label="Khách hàng của dự án"
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            required
          >
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </label>
        <label className="wide-field">
          Website <small>Mỗi dòng một URL · tối đa 10 website</small>
          <textarea
            aria-label="Website của dự án"
            value={websites}
            onChange={(e) => setWebsites(e.target.value)}
            maxLength={21000}
            rows={3}
            required
            placeholder="https://example.com"
          />
        </label>
        <label className="wide-field">
          Ghi chú
          <textarea
            aria-label="Ghi chú dự án"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={500}
            rows={2}
          />
        </label>
      </fieldset>
      <div className="project-form-actions">
        <button className="button secondary" type="button" disabled={busy} onClick={onCancel}>
          Hủy
        </button>
        <button className="button primary" disabled={busy}>
          {busy ? <LoaderCircle size={14} className="spin" /> : <Check size={14} />}Lưu dự án
        </button>
      </div>
    </form>
  );
}

function TaskRow({
  task,
  busy,
  onSave,
  onOpen,
}: {
  task: ProjectTask;
  busy: boolean;
  onSave: (patch: Partial<AuditCheck>) => void;
  onOpen: () => void;
}) {
  const check = task.check;
  const [assignee, setAssignee] = useState(check.assignee || '');
  const [dueDate, setDueDate] = useState(check.dueDate || '');
  const [workflow, setWorkflow] = useState<string>(check.done ? 'done' : check.workflow || 'todo');
  useEffect(() => {
    setAssignee(check.assignee || '');
    setDueDate(check.dueDate || '');
    setWorkflow(check.done ? 'done' : check.workflow || 'todo');
  }, [check.assignee, check.dueDate, check.workflow, check.done]);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
  const overdue = !check.done && check.dueDate && check.dueDate < today;
  return (
    <form
      className={`project-task ${check.done ? 'is-done' : ''}`}
      aria-label={`Công việc ${check.title}`}
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          assignee,
          dueDate: dueDate || null,
          workflow: workflow as AuditCheck['workflow'],
        });
      }}
    >
      <div className="project-task-heading">
        <button type="button" onClick={onOpen}>
          <strong>{check.title}</strong>
          <ArrowUpRight size={13} />
        </button>
        <span className={`project-priority ${check.severity}`}>
          {check.severity === 'high'
            ? 'Ưu tiên cao'
            : check.severity === 'medium'
              ? 'Nên cải thiện'
              : 'Tối ưu thêm'}
        </span>
      </div>
      <p className="project-task-source">
        {task.url} · {dateTime(task.createdAt)}
        {overdue && <b>Quá hạn</b>}
      </p>
      <p>{check.recommendation}</p>
      <fieldset disabled={busy}>
        <label>
          Người phụ trách
          <input
            aria-label={`Người phụ trách ${check.title}`}
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            maxLength={80}
            placeholder="Chưa gán"
          />
        </label>
        <label>
          Hạn sửa
          <input
            aria-label={`Hạn sửa ${check.title}`}
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </label>
        <label>
          Trạng thái
          <select
            aria-label={`Trạng thái ${check.title}`}
            value={workflow}
            onChange={(e) => setWorkflow(e.target.value)}
          >
            <option value="todo">Chưa làm</option>
            <option value="doing">Đang làm</option>
            <option value="done">Đã xong</option>
          </select>
        </label>
        <button className="button secondary" aria-label={`Lưu việc ${check.title}`} disabled={busy}>
          {busy ? <LoaderCircle size={14} className="spin" /> : <Check size={14} />}Lưu
        </button>
      </fieldset>
    </form>
  );
}

export function ProjectsView({
  workspace,
  history,
  monitors,
  projectSchedules,
  loading,
  onRefresh,
  onOpenReport,
  onBranding,
  onAudit,
  onRunMonitor,
  onCreateMonitor,
}: {
  workspace: Workspace;
  history: Summary[];
  monitors: Monitor[];
  projectSchedules: ProjectSchedule[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  onOpenReport: (id: string) => void;
  onBranding: (client: Client) => void;
  onAudit: (project: Project, url: string) => void;
  onRunMonitor: (id: string) => Promise<void>;
  onCreateMonitor: (project: Project, url: string) => Promise<void>;
}) {
  const [clientEditor, setClientEditor] = useState<Client | 'new' | null>(null);
  const [projectEditor, setProjectEditor] = useState<Project | 'new' | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchSelection, setBatchSelection] = useState('');
  const [comparisonSelection, setComparisonSelection] = useState<{
    before: string;
    after: string;
  } | null>(null);
  const [clientFilter, setClientFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState<{
    kind: 'clients' | 'projects';
    id: string;
    name: string;
  } | null>(null);
  const [reportLink, setReportLink] = useState('');
  const [monitorLink, setMonitorLink] = useState('');
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [taskLoading, setTaskLoading] = useState(false);
  const [taskError, setTaskError] = useState('');
  const [taskVersion, setTaskVersion] = useState(0);
  const [taskFilter, setTaskFilter] = useState('all');
  const [taskQuery, setTaskQuery] = useState('');
  useEffect(() => {
    if (confirmation || clientEditor || projectEditor)
      window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [confirmation, clientEditor, projectEditor]);
  const project = workspace.projects.find((item) => item.id === selected);
  const client = workspace.clients.find((item) => item.id === project?.clientId);
  const reports = history.filter((report) => workspace.reports[report.id] === project?.id);
  const schedules = monitors.filter((monitor) => workspace.monitors[monitor.id] === project?.id);
  useEffect(() => {
    if (!project) {
      setTasks([]);
      return;
    }
    const controller = new AbortController();
    setTaskLoading(true);
    setTaskError('');
    api<ProjectTask[]>(`/api/projects/${project.id}/tasks`, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setTasks(data);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setTaskError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setTaskLoading(false);
      });
    return () => controller.abort();
  }, [project?.id, history, taskVersion]);
  async function action(key: string, work: () => Promise<unknown>, done?: () => void) {
    if (busy) return;
    setBusy(key);
    setError('');
    try {
      await work();
      await onRefresh();
      setTaskVersion((value) => value + 1);
      done?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }
  const filtered = workspace.projects.filter(
    (item) =>
      (clientFilter === 'all' || item.clientId === clientFilter) &&
      `${item.name} ${workspace.clients.find((c) => c.id === item.clientId)?.name} ${item.websites.join(' ')}`
        .toLocaleLowerCase('vi')
        .includes(query.toLocaleLowerCase('vi')),
  );
  const pendingTasks = tasks.filter((task) => !task.check.done).length;
  const filteredTasks = tasks
    .filter(
      ({ check, url }) =>
        (taskFilter === 'all' || (check.done ? 'done' : check.workflow || 'todo') === taskFilter) &&
        `${check.title} ${check.assignee || ''} ${url}`
          .toLocaleLowerCase('vi')
          .includes(taskQuery.toLocaleLowerCase('vi')),
    )
    .sort(
      (a, b) =>
        Number(a.check.done) - Number(b.check.done) ||
        ['high', 'medium', 'low'].indexOf(a.check.severity) -
          ['high', 'medium', 'low'].indexOf(b.check.severity),
    );
  return (
    <div className="projects-view">
      <div className="page-heading">
        <div>
          <span className="eyebrow">MỖI KHÁCH HÀNG, MỘT KHÔNG GIAN RÕ RÀNG</span>
          <h1>
            {project ? project.name : 'Khách hàng & dự án'}
            <span>.</span>
          </h1>
          <p>
            {project
              ? `${client?.name} · ${project.websites.length} website`
              : 'Gom website, báo cáo và công việc về đúng dự án.'}
          </p>
        </div>
        <div className="project-heading-actions">
          {project ? (
            <>
              <button
                className="button secondary"
                onClick={() => {
                  setSelected(null);
                  setProjectEditor(null);
                  setError('');
                }}
              >
                <ArrowLeft size={14} />
                Danh sách dự án
              </button>
              <button
                className="button secondary"
                disabled={batchRunning}
                onClick={() => setProjectEditor(project)}
              >
                <Pencil size={14} />
                Sửa dự án
              </button>
            </>
          ) : (
            <>
              <button
                className="button secondary"
                onClick={() => {
                  setClientEditor('new');
                  setProjectEditor(null);
                }}
              >
                <Users size={15} />
                Thêm khách hàng
              </button>
              <button
                className="button primary"
                disabled={!workspace.clients.length}
                onClick={() => {
                  setProjectEditor('new');
                  setClientEditor(null);
                }}
              >
                <Plus size={15} />
                Thêm dự án
              </button>
            </>
          )}
        </div>
      </div>
      {error && (
        <p className="project-error" role="alert">
          {error}
        </p>
      )}
      {confirmation && (
        <section className="panel project-delete-confirm" aria-label="Xác nhận xóa">
          <h2>Xóa {confirmation.name}?</h2>
          <p>
            {confirmation.kind === 'projects'
              ? 'Các báo cáo và lịch theo dõi sẽ được gỡ khỏi dự án, vẫn được giữ trong Lịch sử và Theo dõi.'
              : 'Thông tin liên hệ và cấu hình thương hiệu của khách hàng sẽ được xóa.'}
          </p>
          <div className="project-form-actions">
            <button
              className="button secondary"
              disabled={!!busy}
              onClick={() => setConfirmation(null)}
            >
              Hủy xóa
            </button>
            <button
              className="button danger"
              disabled={!!busy}
              onClick={() =>
                void action(
                  'delete',
                  () => api(`/api/${confirmation.kind}/${confirmation.id}`, { method: 'DELETE' }),
                  () => {
                    setConfirmation(null);
                    if (confirmation.kind === 'projects') setSelected(null);
                  },
                )
              }
            >
              Xác nhận xóa
            </button>
          </div>
        </section>
      )}
      {clientEditor && (
        <ClientForm
          key={clientEditor === 'new' ? 'new' : clientEditor.id}
          initial={clientEditor === 'new' ? null : clientEditor}
          busy={!!busy}
          onCancel={() => setClientEditor(null)}
          onSave={(input) =>
            void action(
              'client',
              () =>
                api(`/api/clients${clientEditor === 'new' ? '' : `/${clientEditor.id}`}`, {
                  method: clientEditor === 'new' ? 'POST' : 'PATCH',
                  body: JSON.stringify(input),
                }),
              () => setClientEditor(null),
            )
          }
        />
      )}
      {projectEditor && (
        <ProjectForm
          key={projectEditor === 'new' ? 'new' : projectEditor.id}
          initial={projectEditor === 'new' ? null : projectEditor}
          clients={workspace.clients}
          clientId={clientFilter === 'all' ? '' : clientFilter}
          busy={!!busy}
          onCancel={() => setProjectEditor(null)}
          onSave={(input) =>
            void action(
              'project',
              () =>
                api(`/api/projects${projectEditor === 'new' ? '' : `/${projectEditor.id}`}`, {
                  method: projectEditor === 'new' ? 'POST' : 'PATCH',
                  body: JSON.stringify(input),
                }),
              () => setProjectEditor(null),
            )
          }
        />
      )}
      {loading ? (
        <div className="loading-state">
          <LoaderCircle className="spin" />
          Đang đọc khách hàng và dự án…
        </div>
      ) : project && client ? (
        <>
          <section className="panel project-context">
            <div>
              <Building2 size={20} />
              <div>
                <h2>{client.name}</h2>
                <p>{client.contact || 'Chưa thêm thông tin liên hệ'}</p>
              </div>
            </div>
            <button className="button secondary" onClick={() => onBranding(client)}>
              <Palette size={14} />
              {client.branding ? 'Sửa thương hiệu khách hàng' : 'Đặt thương hiệu khách hàng'}
            </button>
            <p>{project.notes || 'Website, báo cáo và công việc của dự án nằm bên dưới.'}</p>
          </section>
          <div className="project-metrics">
            <div>
              <Globe2 size={18} />
              <strong>{project.websites.length}</strong>
              <span>website</span>
            </div>
            <div>
              <FolderOpen size={18} />
              <strong>{reports.length}</strong>
              <span>báo cáo</span>
            </div>
            <div>
              <Check size={18} />
              <strong>{pendingTasks}</strong>
              <span>việc còn lại</span>
            </div>
            <div>
              <Bell size={18} />
              <strong>
                {schedules.reduce((n, m) => n + m.unreadAlerts, 0) +
                  (projectSchedules.find((s) => s.projectId === project.id)?.unreadAlerts || 0)}
              </strong>
              <span>cảnh báo chưa đọc</span>
            </div>
          </div>
          <ProjectSchedulePanel
            key={project.id}
            project={project}
            batchRunning={batchRunning}
            onRefresh={onRefresh}
            onOpenBatch={(id) => {
              setBatchSelection(id);
              document
                .querySelector('.batch-panel')
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
            onCompare={(before, after) => {
              setComparisonSelection({ before, after });
              document
                .querySelector('.batch-comparison-panel')
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
          />
          <BatchAudit
            key={project.id}
            project={project}
            onRefresh={onRefresh}
            onOpenReport={onOpenReport}
            onRunningChange={setBatchRunning}
            selectedBatchId={batchSelection}
          />
          <BatchComparison
            key={project.id}
            project={project}
            onOpenReport={onOpenReport}
            selectedPair={comparisonSelection}
          />
          <section className="panel project-section">
            <h2>Website trong dự án</h2>
            <div className="project-websites">
              {project.websites.map((url) => (
                <div key={url}>
                  <a href={url} target="_blank" rel="noreferrer">
                    {url}
                    <ArrowUpRight size={13} />
                  </a>
                  <div>
                    <button
                      className="button primary"
                      disabled={!!busy || batchRunning}
                      onClick={() => onAudit(project, url)}
                    >
                      Kiểm tra website này
                    </button>
                    <button
                      className="button secondary"
                      disabled={!!busy || schedules.some((monitor) => monitor.url === url)}
                      onClick={() => void action('schedule', () => onCreateMonitor(project, url))}
                    >
                      <Bell size={13} />
                      {schedules.some((monitor) => monitor.url === url)
                        ? 'Đã thêm theo dõi'
                        : 'Theo dõi mỗi tuần'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
          <section className="panel project-section">
            <h2>Báo cáo của dự án</h2>
            <p className="project-section-hint">
              Báo cáo mới được lưu tại đây khi chọn dự án trước lúc kiểm tra. Có thể gắn báo cáo
              hiện có bên dưới.
            </p>
            <div className="project-attach">
              <select
                aria-label="Báo cáo cần gắn vào dự án"
                value={reportLink}
                onChange={(e) => setReportLink(e.target.value)}
              >
                <option value="">Chọn báo cáo chưa gắn dự án</option>
                {history
                  .filter((report) => !workspace.reports[report.id])
                  .map((report) => (
                    <option key={report.id} value={report.id}>
                      {report.title} · {dateTime(report.createdAt)}
                    </option>
                  ))}
              </select>
              <button
                className="button secondary"
                disabled={!reportLink || !!busy}
                onClick={() =>
                  void action(
                    'attach-report',
                    () =>
                      api(`/api/reports/${reportLink}/project`, {
                        method: 'PATCH',
                        body: JSON.stringify({ projectId: project.id }),
                      }),
                    () => setReportLink(''),
                  )
                }
              >
                <Plus size={13} />
                Gắn báo cáo
              </button>
            </div>
            <div className="project-resource-list">
              {reports.length ? (
                reports.map((report) => (
                  <div key={report.id}>
                    <button onClick={() => onOpenReport(report.id)}>
                      <strong>{report.title}</strong>
                      <small>
                        {dateTime(report.createdAt)} · {report.score ?? '—'}/100 ·{' '}
                        {report.issues - report.completed} việc còn lại
                      </small>
                    </button>
                    <button
                      className="text-button"
                      disabled={!!busy}
                      aria-label={`Gỡ báo cáo ${report.title} khỏi dự án`}
                      onClick={() =>
                        void action('detach', () =>
                          api(`/api/reports/${report.id}/project`, {
                            method: 'PATCH',
                            body: JSON.stringify({ projectId: null }),
                          }),
                        )
                      }
                    >
                      Gỡ
                    </button>
                  </div>
                ))
              ) : (
                <p>Chưa có báo cáo trong dự án này.</p>
              )}
            </div>
          </section>
          <section className="panel project-section">
            <h2>Theo dõi & cảnh báo</h2>
            <div className="project-attach">
              <select
                aria-label="Lịch theo dõi cần gắn vào dự án"
                value={monitorLink}
                onChange={(e) => setMonitorLink(e.target.value)}
              >
                <option value="">Chọn lịch theo dõi chưa gắn dự án</option>
                {monitors
                  .filter((monitor) => !workspace.monitors[monitor.id])
                  .map((monitor) => (
                    <option key={monitor.id} value={monitor.id}>
                      {monitor.name} · {monitor.url}
                    </option>
                  ))}
              </select>
              <button
                className="button secondary"
                disabled={!monitorLink || !!busy}
                onClick={() =>
                  void action(
                    'attach-monitor',
                    () =>
                      api(`/api/monitors/${monitorLink}/project`, {
                        method: 'PATCH',
                        body: JSON.stringify({ projectId: project.id }),
                      }),
                    () => setMonitorLink(''),
                  )
                }
              >
                <Plus size={13} />
                Gắn theo dõi
              </button>
            </div>
            <div className="project-resource-list">
              {schedules.length ? (
                schedules.map((monitor) => (
                  <div key={monitor.id}>
                    <div>
                      <strong>{monitor.name}</strong>
                      <small>
                        {monitor.intervalLabel} · {monitor.unreadAlerts} cảnh báo chưa đọc ·{' '}
                        {monitor.running ? 'Đang chạy' : monitor.active ? 'Đang bật' : 'Tạm dừng'}
                      </small>
                      {monitor.notifications
                        .filter((note) => !note.readAt)
                        .slice(-3)
                        .map((note) => (
                          <p className="project-monitor-alert" key={note.id}>
                            {note.message}
                          </p>
                        ))}
                    </div>
                    <div className="project-resource-actions">
                      <button
                        className="button secondary"
                        disabled={!!busy || monitor.running || batchRunning}
                        onClick={() => void onRunMonitor(monitor.id)}
                      >
                        Chạy ngay
                      </button>
                      <button
                        className="text-button"
                        disabled={!!busy || monitor.running}
                        aria-label={`Gỡ theo dõi ${monitor.name} khỏi dự án`}
                        onClick={() =>
                          void action('detach-monitor', () =>
                            api(`/api/monitors/${monitor.id}/project`, {
                              method: 'PATCH',
                              body: JSON.stringify({ projectId: null }),
                            }),
                          )
                        }
                      >
                        Gỡ
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p>Chưa có lịch theo dõi cho dự án này.</p>
              )}
            </div>
          </section>
          <section className="panel project-section">
            <h2>Việc cần sửa</h2>
            <p className="project-section-hint">
              Lấy từ báo cáo mới nhất của từng URL trong dự án. Trạng thái công việc được lưu theo
              báo cáo; chạy lại audit để xác minh website đã được sửa.
            </p>
            <div className="project-task-filters">
              <div className="search-input">
                <Search size={15} />
                <input
                  aria-label="Tìm công việc dự án"
                  placeholder="Tên việc, người phụ trách hoặc URL…"
                  value={taskQuery}
                  onChange={(e) => setTaskQuery(e.target.value)}
                />
              </div>
              <select
                aria-label="Lọc công việc dự án"
                value={taskFilter}
                onChange={(e) => setTaskFilter(e.target.value)}
              >
                <option value="all">Mọi trạng thái</option>
                <option value="todo">Chưa làm</option>
                <option value="doing">Đang làm</option>
                <option value="done">Đã xong</option>
              </select>
            </div>
            {taskError && (
              <p className="project-error" role="alert">
                {taskError}
              </p>
            )}
            {taskLoading && !tasks.length ? (
              <p className="loading-state">Đang đọc công việc…</p>
            ) : filteredTasks.length ? (
              filteredTasks.map((task) => (
                <TaskRow
                  key={`${task.reportId}-${task.check.id}`}
                  task={task}
                  busy={!!busy}
                  onOpen={() => onOpenReport(task.reportId)}
                  onSave={(patch) =>
                    void action('task', () =>
                      api(`/api/reports/${task.reportId}/checks/${task.check.id}`, {
                        method: 'PATCH',
                        body: JSON.stringify(patch),
                      }),
                    )
                  }
                />
              ))
            ) : (
              <p className="project-empty-line">Không có công việc phù hợp.</p>
            )}
          </section>
          <button
            className="text-button danger-button project-delete-link"
            disabled={batchRunning}
            onClick={() =>
              setConfirmation({ kind: 'projects', id: project.id, name: project.name })
            }
          >
            <Trash2 size={14} />
            Xóa dự án
          </button>
        </>
      ) : !workspace.clients.length ? (
        <section className="panel">
          <EmptyState icon={<Users size={34} />} title="Bắt đầu với khách hàng đầu tiên">
            Thêm khách hàng, tạo dự án và đưa các website cần chăm sóc về cùng một nơi.
            <button className="button primary" onClick={() => setClientEditor('new')}>
              <Plus size={15} />
              Tạo khách hàng đầu tiên
            </button>
          </EmptyState>
        </section>
      ) : (
        <>
          <section className="panel project-clients">
            <div className="section-heading">
              <h2>
                Khách hàng <span>{workspace.clients.length}</span>
              </h2>
            </div>
            <div className="client-grid">
              {workspace.clients.map((item) => {
                const count = workspace.projects.filter((p) => p.clientId === item.id).length;
                return (
                  <article
                    className="client-card"
                    key={item.id}
                    aria-label={`Khách hàng ${item.name}`}
                  >
                    <div className="client-card-heading">
                      <span className="client-avatar">
                        <Building2 size={20} />
                      </span>
                      <div>
                        <h3>{item.name}</h3>
                        <p>
                          {count} dự án ·{' '}
                          {item.branding ? 'Thương hiệu riêng' : 'Thương hiệu chung'}
                        </p>
                      </div>
                    </div>
                    <p>{item.contact || 'Chưa thêm liên hệ'}</p>
                    {item.notes && <p>{item.notes}</p>}
                    <div className="client-card-actions">
                      <button
                        className="text-button"
                        aria-label={`Sửa khách hàng ${item.name}`}
                        onClick={() => setClientEditor(item)}
                      >
                        <Pencil size={13} />
                        Sửa
                      </button>
                      <button
                        className="text-button"
                        aria-label={`Thương hiệu khách hàng ${item.name}`}
                        onClick={() => onBranding(item)}
                      >
                        <Palette size={13} />
                        Thương hiệu
                      </button>
                      <button
                        className="icon-button danger-button"
                        disabled={count > 0}
                        title={count ? 'Chuyển hoặc xóa dự án trước' : 'Xóa khách hàng'}
                        aria-label={`Xóa khách hàng ${item.name}`}
                        onClick={() =>
                          setConfirmation({ kind: 'clients', id: item.id, name: item.name })
                        }
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
          <section className="panel project-section">
            <h2>
              Dự án <span>{workspace.projects.length}</span>
            </h2>
            <div className="project-task-filters">
              <div className="search-input">
                <Search size={15} />
                <input
                  aria-label="Tìm dự án"
                  placeholder="Tên dự án, khách hàng hoặc website…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <select
                aria-label="Lọc khách hàng"
                value={clientFilter}
                onChange={(e) => setClientFilter(e.target.value)}
              >
                <option value="all">Mọi khách hàng</option>
                {workspace.clients.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="project-grid">
              {filtered.map((item) => {
                const owner = workspace.clients.find((c) => c.id === item.clientId);
                const count = Object.values(workspace.reports).filter(
                  (id) => id === item.id,
                ).length;
                return (
                  <button
                    className="project-card"
                    key={item.id}
                    aria-label={`Mở dự án ${item.name}`}
                    onClick={() => {
                      setSelected(item.id);
                      setBatchSelection('');
                      setComparisonSelection(null);
                      setError('');
                      setClientEditor(null);
                      setProjectEditor(null);
                      setTasks([]);
                      setTaskFilter('all');
                      setTaskQuery('');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                  >
                    <span className="project-card-icon">
                      <FolderOpen size={22} />
                    </span>
                    <span>
                      <small>{owner?.name}</small>
                      <strong>{item.name}</strong>
                      <span>
                        {item.websites.length} website · {count} báo cáo
                      </span>
                      <small className="project-card-domain">
                        {item.websites.map((url) => new URL(url).hostname).join(' · ')}
                      </small>
                      {projectSchedules.find((s) => s.projectId === item.id) && (
                        <small className="project-schedule-badge">
                          Lịch{' '}
                          {projectSchedules.find((s) => s.projectId === item.id)?.active
                            ? 'đang bật'
                            : 'tạm dừng'}{' '}
                          ·{' '}
                          {projectSchedules.find((s) => s.projectId === item.id)?.unreadAlerts || 0}{' '}
                          cảnh báo chưa đọc
                        </small>
                      )}
                    </span>
                    <ArrowUpRight size={16} />
                  </button>
                );
              })}
            </div>
            {!filtered.length && (
              <p className="project-empty-line">
                {workspace.projects.length
                  ? 'Không tìm thấy dự án phù hợp.'
                  : 'Thêm dự án đầu tiên cho khách hàng của bạn.'}
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
