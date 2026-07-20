export const changeTypes = [
  "feat",
  "fix",
  "refactor",
  "perf",
  "chore",
  "docs",
  "test",
  "style",
  "build",
  "ci",
  "other",
] as const;

export type ChangeType = (typeof changeTypes)[number];

export interface ViewerEntry {
  letter?: string;
  tags?: string[];
  description?: string;
}

export interface ViewerUsage {
  total?: number;
}

export type ViewerSummaryStatus =
  "missing" | "pending" | "generating" | "ready" | "failed";

export interface ViewerCommitStats {
  additions?: number;
  deletions?: number;
  filesChanged?: number;
  linesChanged?: number;
}

export interface ViewerGeneration {
  agent?: string;
  model?: string | null;
  estimatedInputTokens?: number | null;
  maxOutputTokens?: number | null;
}

export interface ViewerGroup {
  kind?: string;
  sha?: string;
  ref?: string;
  author?: string;
  date?: string;
  status?: ViewerSummaryStatus;
  projects?: string[];
  link?: string | null;
  usage?: ViewerUsage;
  stats?: ViewerCommitStats;
  generation?: ViewerGeneration;
  entries?: ViewerEntry[];
}

export interface ViewerModel {
  groups: ViewerGroup[];
  projectName: string;
  projectNames: string[];
  databaseSizeBytes: number | null;
}

interface ViewerMetadata {
  databaseSizeBytes?: number;
}

declare global {
  interface Window {
    __WHATIJUSTDID__?: ViewerGroup[];
    __WHATIJUSTDID_PROJECT_NAME__?: string;
    __WHATIJUSTDID_PROJECTS__?: string[];
    __WHATIJUSTDID_META__?: ViewerMetadata;
  }
}

const knownTypes = new Set<string>(changeTypes);

export function readViewerModel(): ViewerModel {
  const groups = Array.isArray(window.__WHATIJUSTDID__)
    ? window.__WHATIJUSTDID__
    : [];
  const configuredProjects = Array.isArray(window.__WHATIJUSTDID_PROJECTS__)
    ? window.__WHATIJUSTDID_PROJECTS__
    : [];
  const databaseSizeBytes = window.__WHATIJUSTDID_META__?.databaseSizeBytes;
  const projects = new Set<string>();

  for (const project of configuredProjects) {
    if (typeof project === "string" && project) projects.add(project);
  }
  for (const group of groups) {
    if (!Array.isArray(group.projects)) continue;
    for (const project of group.projects) {
      if (typeof project === "string" && project) projects.add(project);
    }
  }

  const hasRepositoryChanges = groups.some(
    (group) => !Array.isArray(group.projects) || group.projects.length === 0,
  );

  return {
    groups,
    projectName:
      typeof window.__WHATIJUSTDID_PROJECT_NAME__ === "string" &&
      window.__WHATIJUSTDID_PROJECT_NAME__.trim()
        ? window.__WHATIJUSTDID_PROJECT_NAME__.trim()
        : "Untitled project",
    databaseSizeBytes:
      typeof databaseSizeBytes === "number" &&
      Number.isSafeInteger(databaseSizeBytes) &&
      databaseSizeBytes >= 0
        ? databaseSizeBytes
        : null,
    projectNames: [
      "All",
      ...projects,
      ...(hasRepositoryChanges ? ["Repo"] : []),
    ],
  };
}

export function matchesProject(group: ViewerGroup, project: string) {
  const groupProjects = Array.isArray(group.projects) ? group.projects : [];
  return (
    project === "All" ||
    (project === "Repo" && groupProjects.length === 0) ||
    groupProjects.includes(project)
  );
}

export function dateValue(value: string | undefined) {
  const date = new Date(value ?? "").valueOf();
  return Number.isNaN(date) ? 0 : date;
}

export function localDateKey(value: string | undefined) {
  const date = new Date(value ?? "");
  if (Number.isNaN(date.valueOf())) return "1970-01-01";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function toChangeType(value: string | undefined): ChangeType {
  return value && knownTypes.has(value) ? (value as ChangeType) : "other";
}

export function safeHttpUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.href
      : null;
  } catch {
    return null;
  }
}
