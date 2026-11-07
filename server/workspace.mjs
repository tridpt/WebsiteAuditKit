import { randomUUID } from 'node:crypto';
import { AuditError, normalizeUrl } from './network.mjs';
import { validateBrandingInput, getBranding } from './branding.mjs';
import { readWorkspace, saveWorkspace, withWorkspaceLock, validId, readReport } from './store.mjs';

function invalid(message, code = 'INVALID_WORKSPACE') {
  throw new AuditError(message, code);
}
function object(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    invalid('Thông tin khách hàng hoặc dự án không hợp lệ.');
}
function text(value, label, max, required = false) {
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim()))
    invalid(`${label} cần ${required ? 'từ 1 đến' : 'tối đa'} ${max} ký tự.`);
  return value.trim();
}
export function validateClient(input, partial = false) {
  object(input);
  const output = {};
  for (const [key, label, max] of [
    ['name', 'Tên khách hàng', 80],
    ['contact', 'Thông tin liên hệ', 160],
    ['notes', 'Ghi chú', 500],
  ])
    if (!partial || input[key] !== undefined)
      output[key] = text(
        input[key] ?? (key === 'name' ? undefined : ''),
        label,
        max,
        key === 'name',
      );
  if (input.branding !== undefined)
    output.branding = input.branding === null ? null : validateBrandingInput(input.branding);
  return output;
}
export function validateProject(input, partial = false) {
  object(input);
  const output = {};
  if (!partial || input.name !== undefined) output.name = text(input.name, 'Tên dự án', 80, true);
  if (!partial || input.notes !== undefined) output.notes = text(input.notes ?? '', 'Ghi chú', 500);
  if (!partial || input.clientId !== undefined) {
    if (!validId(input.clientId)) invalid('Chọn khách hàng cho dự án.');
    output.clientId = input.clientId;
  }
  if (!partial || input.websites !== undefined) {
    if (!Array.isArray(input.websites) || !input.websites.length || input.websites.length > 10)
      invalid('Mỗi dự án cần từ 1 đến 10 website.');
    output.websites = [...new Set(input.websites.map((url) => normalizeUrl(url)))];
  }
  return output;
}
export async function getWorkspace() {
  const state = await readWorkspace();
  try {
    object(state);
    if (state.version !== 1 || !Array.isArray(state.clients) || !Array.isArray(state.projects))
      throw new Error();
    const clients = new Set(state.clients.map((client) => client.id));
    const projects = new Set(state.projects.map((project) => project.id));
    if (clients.size !== state.clients.length || projects.size !== state.projects.length)
      throw new Error();
    for (const client of state.clients) {
      if (!validId(client.id)) throw new Error();
      validateClient(client);
    }
    for (const project of state.projects) {
      if (!validId(project.id) || !clients.has(project.clientId)) throw new Error();
      validateProject(project);
    }
    for (const key of ['reports', 'monitors']) {
      object(state[key]);
      if (
        Object.entries(state[key]).some(
          ([id, projectId]) => !validId(id) || !projects.has(projectId),
        )
      )
        throw new Error();
    }
    return state;
  } catch {
    throw new Error(
      'Dữ liệu khách hàng không hợp lệ. Kiểm tra tệp data/workspace.json trước khi tiếp tục.',
    );
  }
}
async function mutate(work) {
  return withWorkspaceLock(async () => {
    const state = await getWorkspace();
    const result = await work(state);
    await saveWorkspace(state);
    return result;
  });
}
export async function createClient(input) {
  const values = validateClient(input);
  return mutate((state) => {
    const now = new Date().toISOString();
    const client = { id: randomUUID(), branding: null, ...values, createdAt: now, updatedAt: now };
    state.clients.push(client);
    return client;
  });
}
export async function updateClient(id, input) {
  const values = validateClient(input, true);
  return mutate((state) => {
    const client = state.clients.find((item) => item.id === id);
    if (!client) invalid('Không tìm thấy khách hàng.', 'NOT_FOUND');
    Object.assign(client, values, { updatedAt: new Date().toISOString() });
    return client;
  });
}
export async function deleteClient(id) {
  return mutate((state) => {
    if (!state.clients.some((client) => client.id === id))
      invalid('Không tìm thấy khách hàng.', 'NOT_FOUND');
    if (state.projects.some((project) => project.clientId === id))
      invalid('Khách hàng còn dự án. Hãy chuyển hoặc xóa dự án trước.', 'BUSY');
    state.clients = state.clients.filter((client) => client.id !== id);
  });
}
export async function saveProject(id, input) {
  const values = validateProject(input, Boolean(id));
  return mutate((state) => {
    const project = id
      ? state.projects.find((item) => item.id === id)
      : { id: randomUUID(), createdAt: new Date().toISOString() };
    if (!project) invalid('Không tìm thấy dự án.', 'NOT_FOUND');
    if (!state.clients.some((client) => client.id === (values.clientId ?? project.clientId)))
      invalid('Khách hàng không còn tồn tại.', 'NOT_FOUND');
    Object.assign(project, values, { updatedAt: new Date().toISOString() });
    if (!id) state.projects.push(project);
    return project;
  });
}
export async function deleteProject(id) {
  return mutate((state) => {
    if (!state.projects.some((project) => project.id === id))
      invalid('Không tìm thấy dự án.', 'NOT_FOUND');
    state.projects = state.projects.filter((project) => project.id !== id);
    for (const key of ['reports', 'monitors'])
      state[key] = Object.fromEntries(
        Object.entries(state[key]).filter(([, projectId]) => projectId !== id),
      );
  });
}
export async function assignResource(kind, id, projectId, { allowMissing = false } = {}) {
  if (
    !['reports', 'monitors'].includes(kind) ||
    !validId(id) ||
    (projectId !== null && !validId(projectId))
  )
    invalid('Liên kết dự án không hợp lệ.');
  return mutate((state) => {
    if (projectId !== null && !state.projects.some((project) => project.id === projectId)) {
      if (allowMissing) return false;
      invalid('Dự án không còn tồn tại.', 'NOT_FOUND');
    }
    if (projectId === null) delete state[kind][id];
    else state[kind][id] = projectId;
    return true;
  });
}
export async function exportContext(reportId) {
  const state = await getWorkspace();
  const project = state.projects.find((item) => item.id === state.reports[reportId]);
  const client = state.clients.find((item) => item.id === project?.clientId);
  return {
    branding: client?.branding || (await getBranding()),
    context:
      project && client
        ? {
            project: { id: project.id, name: project.name },
            client: { id: client.id, name: client.name },
          }
        : null,
  };
}
export async function projectTasks(id) {
  const state = await getWorkspace();
  if (!state.projects.some((project) => project.id === id))
    invalid('Không tìm thấy dự án.', 'NOT_FOUND');
  const reports = (
    await Promise.all(
      Object.entries(state.reports)
        .filter(([, projectId]) => projectId === id)
        .map(([reportId]) => readReport(reportId)),
    )
  )
    .filter(Boolean)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const latest = new Map();
  for (const report of reports) {
    const url = report.requestedUrl || report.url;
    if (!latest.has(url)) latest.set(url, report);
  }
  return [...latest.values()].flatMap((report) =>
    report.checks
      .filter((check) => ['warn', 'fail'].includes(check.status))
      .map((check) => ({
        reportId: report.id,
        reportTitle: report.title,
        url: report.url,
        createdAt: report.createdAt,
        check,
      })),
  );
}

export function validateTaskPatch(input) {
  object(input);
  const values = {};
  if (input.assignee !== undefined) values.assignee = text(input.assignee, 'Người phụ trách', 80);
  if (input.dueDate !== undefined) {
    if (
      input.dueDate !== null &&
      (typeof input.dueDate !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate) ||
        !Number.isFinite(Date.parse(input.dueDate)) ||
        new Date(input.dueDate).toISOString().slice(0, 10) !== input.dueDate)
    )
      invalid('Hạn sửa cần là ngày hợp lệ.');
    values.dueDate = input.dueDate;
  }
  if (input.workflow !== undefined) {
    if (!['todo', 'doing', 'done'].includes(input.workflow))
      invalid('Trạng thái công việc không hợp lệ.');
    values.workflow = input.workflow;
    values.done = input.workflow === 'done';
  }
  if (input.done !== undefined) {
    if (typeof input.done !== 'boolean') invalid('Giá trị hoàn thành không hợp lệ.');
    if (input.workflow !== undefined && values.done !== input.done)
      invalid('Trạng thái hoàn thành không khớp.');
    values.done = input.done;
    values.workflow = input.done ? 'done' : values.workflow === 'doing' ? 'doing' : 'todo';
  }
  if (!Object.keys(values).length) invalid('Chọn thông tin công việc cần cập nhật.');
  return values;
}
