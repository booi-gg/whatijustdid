import {
  changeTypes,
  type ChangeType,
  type ViewerGeneration,
  type ViewerGroup,
  type ViewerSummaryStatus,
} from "./model";

const dayFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

const agentNames: Record<string, string> = {
  claude: "Claude",
  codex: "Codex",
  deepseek: "DeepSeek",
  llama: "Llama",
  openai: "OpenAI",
};

const byteUnits = ["B", "KiB", "MiB", "GiB", "TiB"];
const knownTypes = new Set<string>(changeTypes);

export interface CommitPresentation {
  date: Date | null;
  entries: NonNullable<ViewerGroup["entries"]>;
  isPullRequest: boolean;
  isReady: boolean;
  linesChanged: number | null;
  projects: string[];
  status: ViewerSummaryStatus;
  tokenTotal: number;
  url: string | null;
}

export function presentCommit(group: ViewerGroup): CommitPresentation {
  const date = new Date(group.date ?? "");
  const status = group.status ?? "ready";

  return {
    date: Number.isNaN(date.valueOf()) ? null : date,
    entries: Array.isArray(group.entries) ? group.entries : [],
    isPullRequest: group.kind === "pr",
    isReady: status === "ready",
    linesChanged: validCount(group.stats?.linesChanged),
    projects:
      Array.isArray(group.projects) && group.projects.length > 0
        ? group.projects
        : ["Repo"],
    status,
    tokenTotal: group.usage?.total ?? 0,
    url: safeHttpUrl(group.link),
  };
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

export function toChangeType(value: string | undefined): ChangeType {
  return value && knownTypes.has(value) ? (value as ChangeType) : "other";
}

export function formatDay(key: string) {
  const date = new Date(`${key}T00:00:00`);
  return Number.isNaN(date.valueOf()) ? key : dayFormatter.format(date);
}

export function formatTime(date: Date) {
  return timeFormatter.format(date);
}

export function formatTokens(total: number) {
  return total >= 1_000 ? `${(total / 1_000).toFixed(1)}k tok` : `${total} tok`;
}

export function formatTokenEstimate(generation: ViewerGeneration | undefined) {
  const input = validCount(generation?.estimatedInputTokens);
  const output = validCount(generation?.maxOutputTokens);
  const parts = [
    input === null ? null : `≈${formatTokens(input)} input`,
    output === null ? null : `≤${formatTokens(output)} output`,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function formatLineChanges(total: number) {
  return `${total.toLocaleString()} ${total === 1 ? "line" : "lines"} changed`;
}

export function formatAgentName(agent: string | undefined) {
  return agent
    ? (agentNames[agent.toLowerCase()] ?? agent)
    : "configured agent";
}

export function validCount(value: number | null | undefined) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

export function formatBytes(total: number) {
  let value = total;
  let unit = 0;
  while (value >= 1024 && unit < byteUnits.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${unit === 0 ? value : value.toFixed(1)} ${byteUnits[unit]}`;
}
