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
  message?: string;
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
  generationLimit: number;
  viewerLimit: number;
}
