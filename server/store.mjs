import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const dataDir = path.resolve(process.env.AUDIT_DATA_DIR || path.join(root, 'data'));
export const reportsDir = path.join(dataDir, 'reports');
export const monitorsFile = path.join(dataDir, 'monitors.json');
export const brandingFile = path.join(dataDir, 'branding.json');
export const workspaceFile = path.join(dataDir, 'workspace.json');
export const batchesFile = path.join(dataDir, 'batches.json');
export const projectSchedulesFile = path.join(dataDir, 'project-schedules.json');
export const validId = (value) =>
  typeof value === 'string' && /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(value);
export const reportDir = (id) => {
  if (!validId(id)) throw new Error('ID báo cáo không hợp lệ.');
  return path.join(reportsDir, id);
};
const locks = new Map();

async function replaceFile(source, destination) {
  for (let attempt = 0; ; attempt++) {
    try {
      await fs.rename(source, destination);
      return;
    } catch (error) {
      // Windows can briefly deny replacement while a reader or antivirus holds the file.
      if (
        process.platform !== 'win32' ||
        !['EPERM', 'EACCES', 'EBUSY'].includes(error.code) ||
        attempt >= 6
      )
        throw error;
      await delay(25 * 2 ** attempt);
    }
  }
}

export async function saveReport(report) {
  const dir = reportDir(report.id);
  await fs.mkdir(dir, { recursive: true });
  const temp = path.join(dir, `.${randomUUID()}.tmp`);
  try {
    await fs.writeFile(temp, JSON.stringify(report, null, 2));
    await replaceFile(temp, path.join(dir, 'report.json'));
  } finally {
    await fs.rm(temp, { force: true }).catch(() => {});
  }
}

export async function readMonitors() {
  try {
    const parsed = JSON.parse(await fs.readFile(monitorsFile, 'utf8'));
    if (!Array.isArray(parsed)) throw new Error('Định dạng danh sách theo dõi không hợp lệ.');
    return parsed;
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw new Error(
      'Không đọc được dữ liệu theo dõi. Kiểm tra tệp data/monitors.json trước khi tiếp tục.',
    );
  }
}

export async function saveMonitors(monitors) {
  await fs.mkdir(dataDir, { recursive: true });
  const temp = path.join(dataDir, `.${randomUUID()}.monitors.tmp`);
  try {
    await fs.writeFile(temp, JSON.stringify(monitors, null, 2));
    await replaceFile(temp, monitorsFile);
  } finally {
    await fs.rm(temp, { force: true }).catch(() => {});
  }
}

export async function readBranding() {
  try {
    const parsed = JSON.parse(await fs.readFile(brandingFile, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new Error('Định dạng thương hiệu không hợp lệ.');
    return parsed;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new Error(
      'Không đọc được cấu hình thương hiệu. Kiểm tra tệp data/branding.json trước khi tiếp tục.',
    );
  }
}

export async function saveBranding(branding) {
  await fs.mkdir(dataDir, { recursive: true });
  const temp = path.join(dataDir, `.${randomUUID()}.branding.tmp`);
  try {
    await fs.writeFile(temp, JSON.stringify(branding, null, 2));
    await replaceFile(temp, brandingFile);
  } finally {
    await fs.rm(temp, { force: true }).catch(() => {});
  }
}

let monitorsLock = Promise.resolve();
export function withMonitorsLock(work) {
  const current = monitorsLock.catch(() => {}).then(work);
  monitorsLock = current;
  current.catch(() => {});
  return current;
}

let brandingLock = Promise.resolve();
export function withBrandingLock(work) {
  const current = brandingLock.catch(() => {}).then(work);
  brandingLock = current;
  current.catch(() => {});
  return current;
}

export async function readWorkspace() {
  try {
    return JSON.parse(await fs.readFile(workspaceFile, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT')
      return { version: 1, clients: [], projects: [], reports: {}, monitors: {} };
    throw new Error(
      'Không đọc được dữ liệu khách hàng. Kiểm tra tệp data/workspace.json trước khi tiếp tục.',
    );
  }
}

export async function saveWorkspace(workspace) {
  await fs.mkdir(dataDir, { recursive: true });
  const temp = path.join(dataDir, `.${randomUUID()}.workspace.tmp`);
  try {
    await fs.writeFile(temp, JSON.stringify(workspace, null, 2));
    await replaceFile(temp, workspaceFile);
  } finally {
    await fs.rm(temp, { force: true }).catch(() => {});
  }
}

let workspaceLock = Promise.resolve();
export function withWorkspaceLock(work) {
  const current = workspaceLock.catch(() => {}).then(work);
  workspaceLock = current;
  current.catch(() => {});
  return current;
}

export async function readBatches() {
  try {
    const batches = JSON.parse(await fs.readFile(batchesFile, 'utf8'));
    if (!Array.isArray(batches)) throw new Error();
    return batches;
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw new Error('Không đọc được hàng đợi. Kiểm tra tệp data/batches.json trước khi tiếp tục.');
  }
}

export async function saveBatches(batches) {
  await fs.mkdir(dataDir, { recursive: true });
  const temp = path.join(dataDir, `.${randomUUID()}.batches.tmp`);
  try {
    await fs.writeFile(temp, JSON.stringify(batches, null, 2));
    await replaceFile(temp, batchesFile);
  } finally {
    await fs.rm(temp, { force: true }).catch(() => {});
  }
}

export async function readProjectSchedules() {
  try {
    const schedules = JSON.parse(await fs.readFile(projectSchedulesFile, 'utf8'));
    if (!Array.isArray(schedules)) throw new Error();
    return schedules;
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw new Error(
      'Không đọc được lịch dự án. Kiểm tra tệp data/project-schedules.json trước khi tiếp tục.',
    );
  }
}

export async function saveProjectSchedules(schedules) {
  await fs.mkdir(dataDir, { recursive: true });
  const temp = path.join(dataDir, `.${randomUUID()}.project-schedules.tmp`);
  try {
    await fs.writeFile(temp, JSON.stringify(schedules, null, 2));
    await replaceFile(temp, projectSchedulesFile);
  } finally {
    await fs.rm(temp, { force: true }).catch(() => {});
  }
}

export async function readReport(id) {
  try {
    return JSON.parse(await fs.readFile(path.join(reportDir(id), 'report.json'), 'utf8'));
  } catch {
    return null;
  }
}

export async function listReports() {
  await fs.mkdir(reportsDir, { recursive: true });
  const dirs = await fs.readdir(reportsDir, { withFileTypes: true });
  const reports = await Promise.all(
    dirs.filter((dir) => dir.isDirectory() && validId(dir.name)).map((dir) => readReport(dir.name)),
  );
  return reports
    .filter(Boolean)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((r) => ({
      id: r.id,
      url: r.url,
      title: r.title,
      createdAt: r.createdAt,
      duration: r.duration,
      device: r.device,
      score: r.score,
      categories: r.categories,
      scope: r.scope,
      issues: r.checks.filter((c) => ['warn', 'fail'].includes(c.status)).length,
      completed: r.checks.filter((c) => ['warn', 'fail'].includes(c.status) && c.done).length,
    }));
}

export function withReportLock(id, work) {
  const prior = locks.get(id) || Promise.resolve();
  const current = prior.catch(() => {}).then(work);
  locks.set(id, current);
  current
    .finally(() => {
      if (locks.get(id) === current) locks.delete(id);
    })
    .catch(() => {});
  return current;
}
