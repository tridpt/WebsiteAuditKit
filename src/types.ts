export type Category = 'performance' | 'mobile' | 'links' | 'seo';
export type Severity = 'high' | 'medium' | 'low';
export interface Check {
  id: string;
  category: Category;
  title: string;
  status: 'pass' | 'warn' | 'fail' | 'info';
  severity: Severity;
  description: string;
  recommendation: string;
  evidence: string[];
  urls: string[];
  weight: number;
  effort: string;
  done: boolean;
  assignee?: string;
  dueDate?: string | null;
  workflow?: 'todo' | 'doing' | 'done';
}
export interface CategoryScore {
  id: Category;
  name: string;
  score: number | null;
  passed: number;
  total: number;
  source?: string;
}
export interface LighthouseAudit {
  id: string;
  title: string;
  description: string;
  score: number | null;
  displayValue: string;
  error: string | null;
  savingsMs: number;
  savingsBytes: number;
  opportunity: boolean;
  resources: { url: string; wastedMs: number | null; wastedBytes: number | null }[];
}
export interface LighthouseResult {
  available: boolean;
  source: string;
  version?: string;
  error?: string;
  score?: number;
  device?: string;
  metrics?: {
    fcp: number | null;
    lcp: number | null;
    cls: number | null;
    tbt: number | null;
    speedIndex: number | null;
  };
  opportunities?: LighthouseAudit[];
  audits?: LighthouseAudit[];
  settings?: { throttlingMethod: string };
}
export interface Page {
  url: string;
  title: string;
  description: string;
  status: number;
  ttfb: number;
  bytes: number;
  h1: string[];
  images: number;
  missingAlt: number;
}
export interface AuditLink {
  url: string;
  source: string;
  text: string;
  status: number | null;
  state: 'ok' | 'broken' | 'unknown';
  internal: boolean;
  finalUrl?: string;
  error?: string;
}
export interface Report {
  id: string;
  url: string;
  requestedUrl: string;
  title: string;
  createdAt: string;
  duration: number;
  device: 'mobile' | 'desktop';
  maxPages: number;
  score: number | null;
  categories: Record<Category, CategoryScore>;
  checks: Check[];
  pages: Page[];
  links: AuditLink[];
  browser: {
    available: boolean;
    warning?: string | null;
    totalBytes?: number;
    resourceCount?: number;
    performance: {
      fcp: number | null;
      lcp: number | null;
      cls: number;
      domContentLoaded: number | null;
      device: string;
    } | null;
    mobile: {
      width: number;
      scrollWidth: number;
      overflow: boolean;
      smallTextCount: number;
      smallTargetCount: number;
      targetCount: number;
      screenshot?: string;
    } | null;
    desktop: { width: number; height: number; screenshot?: string } | null;
  };
  lighthouse?: LighthouseResult;
  warnings: string[];
  failedPages?: { url: string; status?: number; reason: string }[];
  scope: {
    requestedPages: number;
    scannedPages: number;
    discoveredLinks: number;
    checkedLinks: number;
    skippedLinks: number;
    mobilePages: number;
    requests: number;
    bytes: number;
  };
  methodology: string;
}
export interface Branding {
  agencyName: string;
  tagline: string;
  footer: string;
  accentColor: string;
  logoDataUrl: string | null;
}
export interface Client {
  id: string;
  name: string;
  contact: string;
  notes: string;
  branding: Branding | null;
  createdAt: string;
  updatedAt: string;
}
export interface Project {
  id: string;
  clientId: string;
  name: string;
  notes: string;
  websites: string[];
  createdAt: string;
  updatedAt: string;
}
export interface Workspace {
  version: 1;
  clients: Client[];
  projects: Project[];
  reports: Record<string, string>;
  monitors: Record<string, string>;
}
export interface ProjectTask {
  reportId: string;
  reportTitle: string;
  url: string;
  createdAt: string;
  check: Check;
}
export interface ProjectBatch {
  id: string;
  projectId: string;
  projectName: string;
  device: 'mobile' | 'desktop';
  maxPages: number;
  createdAt: string;
  finishedAt: string | null;
  status: 'running' | 'completed' | 'partial' | 'cancelled' | 'interrupted';
  cancelRequested: boolean;
  retryOf: string | null;
  scheduleRunId?: string;
  trigger?: 'schedule' | 'schedule-manual';
  error: string | null;
  progress: number;
  settled: number;
  items: {
    url: string;
    status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
    jobId?: string;
    reportId: string | null;
    error: string | null;
    progress: number;
    message: string;
  }[];
}
export interface ProjectScheduledWebsite {
  url: string;
  scoreDrop: number;
  speedDrop: number;
  newIssues: number;
  unverifiedIssues: number;
  comparable: boolean;
  reason: string | null;
  reportId: string | null;
}
export interface ProjectScheduleRun {
  runId: string;
  batchId: string;
  beforeBatchId: string | null;
  createdAt: string;
  finishedAt: string | null;
  status: string;
  failed: number;
  newIssues: number;
  scoreDrops: number;
  unverified: number;
  message: string;
  websites: ProjectScheduledWebsite[];
  warnings: string[];
}
export interface ProjectSchedule {
  projectId: string;
  projectName: string;
  active: boolean;
  device: 'mobile' | 'desktop';
  maxPages: number;
  interval: 'daily' | 'weekly';
  createdAt: string;
  updatedAt: string;
  nextRunAt: string;
  lastRunAt: string | null;
  lastBatchId: string | null;
  baselineBatchId: string | null;
  currentRunId: string | null;
  currentBatchId: string | null;
  lastStatus: string;
  lastError: string | null;
  unreadAlerts: number;
  runs: ProjectScheduleRun[];
  notifications: {
    id: string;
    createdAt: string;
    readAt: string | null;
    type: 'regression' | 'failure';
    message: string;
    batchId: string | null;
    beforeBatchId: string | null;
    websites: ProjectScheduledWebsite[];
  }[];
}
export interface BatchSummary {
  batch: Pick<
    ProjectBatch,
    'id' | 'createdAt' | 'finishedAt' | 'status' | 'device' | 'maxPages' | 'retryOf' | 'error'
  >;
  project: { id: string; name: string };
  client: { id: string; name: string };
  totals: {
    websites: number;
    available: number;
    incomplete: number;
    pending: number;
    high: number;
  };
  websites: {
    url: string;
    status: ProjectBatch['items'][number]['status'];
    error: string | null;
    reportId: string | null;
    reportMissing: boolean;
    score: number | null;
    categories: Report['categories'] | null;
    createdAt: string | null;
    scope: Report['scope'] | null;
    pending: number;
    high: number;
  }[];
  tasks: { reportId: string; url: string; check: Check }[];
}
export type BatchComparisonStatus =
  'improved' | 'regressed' | 'unchanged' | 'unverified' | 'added' | 'removed';
export type BatchTrendInterval = 'weekly' | 'monthly';
export interface BatchTrend {
  periods: { key: string; label: string }[];
  series: {
    url: string;
    points: {
      period: string;
      batchId: string | null;
      reportId: string | null;
      measuredAt: string | null;
      score: number | null;
      comparable: boolean;
      reason: string | null;
      source: string | null;
    }[];
  }[];
}
export interface BatchMeasurement {
  reportId: string | null;
  status: string;
  score: number | null;
  createdAt: string | null;
  device: Report['device'] | null;
  source: string | null;
  scope: Report['scope'] | null;
  reportMissing: boolean;
  error: string | null;
}
export interface BatchComparison {
  before: Pick<ProjectBatch, 'id' | 'createdAt' | 'finishedAt' | 'status' | 'device' | 'maxPages'>;
  after: BatchComparison['before'];
  project: { id: string; name: string };
  client: { id: string; name: string };
  warnings: string[];
  websites: {
    url: string;
    status: BatchComparisonStatus;
    before: BatchMeasurement;
    after: BatchMeasurement;
    scoreDelta: number | null;
    scoreComparable: boolean;
    scoreReason: string | null;
    counts: Record<ChangeGroup, number>;
    warnings: string[];
    changes: Record<ChangeGroup, FindingChange[]>;
    scoreChanges: ReportComparison['scoreChanges'];
  }[];
  trends: Record<BatchTrendInterval, BatchTrend>;
  totals: {
    websites: number;
    common: number;
    improved: number;
    regressed: number;
    unchanged: number;
    unverified: number;
    added: number;
    removed: number;
    newIssues: number;
    persistentIssues: number;
    resolvedIssues: number;
    unverifiedIssues: number;
  };
}
export interface Summary {
  id: string;
  url: string;
  title: string;
  createdAt: string;
  duration: number;
  device: string;
  score: number | null;
  categories: Record<Category, CategoryScore>;
  scope: Report['scope'];
  issues: number;
  completed: number;
}
export type MonitorInterval = 'daily' | 'weekly';
export type MonitorStatus = 'never' | 'running' | 'healthy' | 'alert' | 'error';
export interface MonitorRun {
  reportId: string;
  createdAt: string;
  score: number | null;
  status: MonitorStatus;
  alert: boolean;
  baseline: boolean;
  comparable: boolean;
  comparisonReason: string | null;
  scoreSource: string;
}
export interface MonitorAlert {
  at: string;
  hasAlert: boolean;
  scoreDelta: number | null;
  scoreDrop: number;
  speedDrop: number;
  scoreReason: string | null;
  newIssues: number;
  brokenLinks: number;
  seoIssues: number;
  resolvedIssues: number;
  unverifiedIssues: number;
  message: string;
}
export interface Monitor {
  id: string;
  name: string;
  url: string;
  device: 'mobile' | 'desktop';
  maxPages: number;
  interval: MonitorInterval;
  intervalLabel: string;
  active: boolean;
  running: boolean;
  createdAt: string;
  updatedAt: string;
  nextRunAt: string;
  lastRunAt: string | null;
  lastReportId: string | null;
  previousReportId: string | null;
  lastScore: number | null;
  lastStatus: MonitorStatus;
  lastError: string | null;
  alert: MonitorAlert | null;
  runs: MonitorRun[];
  unreadAlerts: number;
  notifications: {
    id: string;
    createdAt: string;
    readAt: string | null;
    type: 'regression' | 'failure';
    message: string;
    reportId: string | null;
    previousReportId: string | null;
  }[];
  currentJob?: { id: string; progress: number; message: string } | null;
}
export interface Job {
  id: string;
  url: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  message: string;
  error?: string;
  startedAt: string;
  device?: 'mobile' | 'desktop';
  maxPages?: number;
  monitorId?: string | null;
}
export type ChangeGroup = 'new' | 'persistent' | 'resolved' | 'unverified';
export interface FindingChange {
  id: string;
  rule: string;
  url: string;
  title: string;
  category: Category;
  severity: Severity;
  before: string;
  after: string;
  evidenceBefore: string[];
  evidenceAfter: string[];
  reason: string;
}
export interface ReportComparison {
  before: Pick<Report, 'id' | 'title' | 'url' | 'createdAt' | 'device' | 'scope'>;
  after: Pick<Report, 'id' | 'title' | 'url' | 'createdAt' | 'device' | 'scope'>;
  warnings: string[];
  scoreChanges: {
    id: string;
    label: string;
    before: number | null;
    after: number | null;
    comparable: boolean;
    delta: number | null;
    reason: string | null;
  }[];
  changes: Record<ChangeGroup, FindingChange[]>;
  counts: Record<ChangeGroup, number>;
  coverage: { commonPages: number; commonLinks: number };
}
