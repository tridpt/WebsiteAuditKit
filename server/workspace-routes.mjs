import {
  getWorkspace,
  createClient,
  updateClient,
  deleteClient,
  saveProject,
  deleteProject,
  assignResource,
  projectTasks,
  validateProject,
} from './workspace.mjs';
import { SafeNetwork, AuditError } from './network.mjs';
import { readReport } from './store.mjs';
import { getMonitor } from './monitor.mjs';

export function workspaceRoutes(
  app,
  runningJobs,
  { projectBusy = () => false, onDeleteProject = async () => {} } = {},
) {
  const route = (work) => async (req, res) => {
    try {
      await work(req, res);
    } catch (error) {
      res
        .status(
          error.code === 'NOT_FOUND'
            ? 404
            : error.code === 'BUSY'
              ? 409
              : error.code === 'INVALID_WORKSPACE' ||
                  error.code === 'INVALID_BRANDING' ||
                  error.code === 'BLOCKED_URL' ||
                  error.code === 'INVALID_URL'
                ? 400
                : 500,
        )
        .json({ error: error.message || 'Không thể cập nhật dự án.' });
    }
  };
  app.get(
    '/api/workspace',
    route(async (_req, res) => res.json(await getWorkspace())),
  );
  app.post(
    '/api/clients',
    route(async (req, res) => res.status(201).json(await createClient(req.body))),
  );
  app.patch(
    '/api/clients/:id',
    route(async (req, res) => res.json(await updateClient(req.params.id, req.body))),
  );
  app.delete(
    '/api/clients/:id',
    route(async (req, res) => {
      await deleteClient(req.params.id);
      res.json({ ok: true });
    }),
  );
  const project = (editing) =>
    route(async (req, res) => {
      if (editing && projectBusy(req.params.id))
        throw new AuditError('Hủy hoặc chờ hàng đợi hoàn tất trước khi sửa dự án.', 'BUSY');
      // Validate syntax before testing public network destinations.
      const values = validateProject(req.body, editing);
      if (values.websites) {
        const guard = new SafeNetwork();
        try {
          for (const url of values.websites) await guard.validate(url);
        } finally {
          await guard.close();
        }
      }
      res
        .status(editing ? 200 : 201)
        .json(await saveProject(editing ? req.params.id : null, values));
    });
  app.post('/api/projects', project(false));
  app.patch('/api/projects/:id', project(true));
  app.get(
    '/api/projects/:id/tasks',
    route(async (req, res) => res.json(await projectTasks(req.params.id))),
  );
  app.delete(
    '/api/projects/:id',
    route(async (req, res) => {
      if (
        projectBusy(req.params.id) ||
        runningJobs().some((job) => job.projectId === req.params.id)
      )
        throw new AuditError(
          'Dự án có lượt kiểm tra đang chạy. Chờ hoàn tất hoặc hủy trước khi xóa.',
          'BUSY',
        );
      await onDeleteProject(req.params.id);
      await deleteProject(req.params.id);
      res.json({ ok: true });
    }),
  );
  for (const kind of ['reports', 'monitors']) {
    app.patch(
      `/api/${kind}/:id/project`,
      route(async (req, res) => {
        const found =
          kind === 'reports' ? await readReport(req.params.id) : await getMonitor(req.params.id);
        if (!found) throw new AuditError('Không tìm thấy báo cáo hoặc lịch theo dõi.', 'NOT_FOUND');
        if (
          kind === 'monitors' &&
          (found.lastStatus === 'running' ||
            runningJobs().some((job) => job.monitorId === req.params.id))
        )
          throw new AuditError('Chờ lượt theo dõi đang chạy hoàn tất trước khi đổi dự án.', 'BUSY');
        await assignResource(kind, req.params.id, req.body?.projectId);
        res.json({ ok: true });
      }),
    );
  }
}
