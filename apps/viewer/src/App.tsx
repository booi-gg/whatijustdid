import { useMemo, useState, useTransition } from "react";
import {
  dateValue,
  localDateKey,
  matchesProject,
  safeHttpUrl,
  toChangeType,
  type ChangeType,
  type ViewerEntry,
  type ViewerGroup,
  type ViewerModel,
} from "./viewer";

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

const actionToken = document.querySelector<HTMLMetaElement>(
  'meta[name="whatijustdid-action-token"]',
)?.content;
const canRunPreviewActions = Boolean(
  actionToken && actionToken !== "__WHATIJUSTDID_ACTION_TOKEN__",
);

const tagStyles: Record<ChangeType, string> = {
  feat: "bg-[oklch(0.22_0.04_155)] text-[oklch(0.72_0.13_155)]",
  fix: "bg-[oklch(0.22_0.04_25)] text-[oklch(0.72_0.14_25)]",
  perf: "bg-[oklch(0.22_0.04_80)] text-[oklch(0.72_0.1_80)]",
  docs: "bg-[oklch(0.22_0.04_300)] text-[oklch(0.72_0.12_300)]",
  test: "bg-[oklch(0.22_0.03_210)] text-[oklch(0.72_0.08_210)]",
  ci: "bg-[oklch(0.22_0.03_210)] text-[oklch(0.72_0.08_210)]",
  refactor: "bg-[oklch(0.22_0.03_260)] text-[oklch(0.72_0.1_260)]",
  chore: "bg-[oklch(0.2_0.013_60)] text-[oklch(0.64_0.015_60)]",
  style: "bg-[oklch(0.2_0.013_60)] text-[oklch(0.64_0.015_60)]",
  build: "bg-[oklch(0.2_0.013_60)] text-[oklch(0.64_0.015_60)]",
  other: "bg-[oklch(0.2_0.013_60)] text-[oklch(0.64_0.015_60)]",
};

interface AppProps {
  model: ViewerModel;
}

export function App({ model }: AppProps) {
  const [activeProject, setActiveProject] = useState("All");
  const visibleGroups = useMemo(
    () =>
      model.groups
        .filter((group) => matchesProject(group, activeProject))
        .slice()
        .sort((left, right) => dateValue(right.date) - dateValue(left.date)),
    [activeProject, model.groups],
  );
  const projectCounts = useMemo(
    () =>
      new Map(
        model.projectNames.map((project) => [
          project,
          model.groups.filter((group) => matchesProject(group, project)).length,
        ]),
      ),
    [model.groups, model.projectNames],
  );
  const days = useMemo(() => groupByDay(visibleGroups), [visibleGroups]);
  const entryCount = visibleGroups.reduce(
    (total, group) =>
      total + (Array.isArray(group.entries) ? group.entries.length : 0),
    0,
  );
  const summary = `${entryCount} ${entryCount === 1 ? "change" : "changes"} across ${visibleGroups.length} ${visibleGroups.length === 1 ? "commit" : "commits"} · ${activeProject}`;
  const databaseSize =
    model.databaseSizeBytes === null
      ? null
      : formatBytes(model.databaseSizeBytes);

  return (
    <div className="mx-auto w-[min(900px,calc(100%-40px))] pt-[68px] pb-[92px] max-[700px]:w-[min(900px,calc(100%-28px))] max-[700px]:pt-[42px]">
      <Masthead
        databaseSize={databaseSize}
        projectName={model.projectName}
        summary={summary}
      />
      <div className="sticky top-0 z-10 -mx-3.5 mb-[38px] border-b border-line-strong/65 bg-surface/92 px-3.5 py-[15px] backdrop-blur-[14px]">
        <ProjectFilters
          activeProject={activeProject}
          projectCounts={projectCounts}
          projectNames={model.projectNames}
          onSelect={setActiveProject}
        />
      </div>
      <main>
        {days.length > 0 ? (
          days.map(([date, groups]) => (
            <DaySection date={date} groups={groups} key={date} />
          ))
        ) : (
          <EmptyState activeProject={activeProject} />
        )}
      </main>
      <Footer />
    </div>
  );
}

function Masthead({
  databaseSize,
  projectName,
  summary,
}: {
  databaseSize: string | null;
  projectName: string;
  summary: string;
}) {
  return (
    <header className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-7 border-b border-line-strong px-1 pb-[30px] max-[700px]:grid-cols-1 max-[700px]:gap-4">
      <div>
        <p className="mb-[18px] flex items-center gap-2.5 text-[10px]/[1.2] font-bold tracking-[0.09em] text-muted uppercase">
          <span className="inline-flex items-center gap-2 text-ink">
            <BrandMark />
            <span className="text-xs tracking-[-0.045em] lowercase">
              whatijustdid [new]
            </span>
          </span>
          <span className="inline-flex items-center gap-2.5 before:h-[13px] before:w-px before:bg-line-strong before:content-['']">
            Repository ledger
          </span>
        </p>
        <p className="mb-2 text-[10px]/[1.2] font-bold tracking-[0.12em] text-accent uppercase">
          Project
        </p>
        <h1 className="overflow-wrap-anywhere m-0 max-w-[650px] text-[clamp(38px,7vw,72px)]/[0.94] font-[720] tracking-[-0.075em]">
          {projectName}
        </h1>
      </div>
      <p
        className="mb-1 max-w-[230px] text-right text-[13px]/[1.55] text-muted max-[700px]:max-w-none max-[700px]:text-left"
        aria-live="polite"
      >
        {summary}
        {databaseSize ? (
          <span className="mt-1 block text-[11px] font-bold text-faint">
            Database size · <span className="text-muted">{databaseSize}</span>
          </span>
        ) : null}
      </p>
    </header>
  );
}

function BrandMark() {
  return (
    <svg
      className="size-7 shrink-0"
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect
        x="1"
        y="1"
        width="98"
        height="98"
        rx="23"
        stroke="#f6c835"
        strokeWidth="2"
      />
      <path
        d="M48.053 15.28c19.956 0 36.134 14.936 36.134 33.36S68.009 82 48.053 82C28.097 82 16 67.064 16 48.64s12.097-33.36 32.053-33.36Z"
        fill="#f6c835"
      />
      <path
        d="M30.664 43.803c0 3.916 3.179 4.73 7.095 4.73s7.096-.814 7.096-4.73-1.997-9.46-5.913-9.46-8.278 5.544-8.278 9.46Zm39.119 2.933c0 3.916-3.18 4.73-7.096 4.73s-7.095-.814-7.095-4.73 1.997-9.461 5.913-9.461 8.278 5.544 8.278 9.46Z"
        fill="#1b1505"
      />
      <path
        d="M37.996 59.271c8.938 3.455 16.013 7.294 23.462 1.152"
        stroke="#232320"
        strokeLinecap="round"
      />
    </svg>
  );
}

interface ProjectFiltersProps {
  activeProject: string;
  projectCounts: Map<string, number>;
  projectNames: string[];
  onSelect: (project: string) => void;
}

function ProjectFilters({
  activeProject,
  projectCounts,
  projectNames,
  onSelect,
}: ProjectFiltersProps) {
  return (
    <nav
      className="no-scrollbar flex gap-[7px] overflow-x-auto"
      aria-label="Filter changes by project"
    >
      {projectNames.map((project) => {
        const isActive = project === activeProject;
        return (
          <button
            className={`inline-flex min-h-[34px] shrink-0 cursor-pointer items-center gap-2 rounded-[5px] border px-2 py-[7px] pl-3 text-xs font-[680] transition-colors ${
              isActive
                ? "border-accent bg-accent text-accent-ink"
                : "border-line-strong bg-surface text-ink hover:border-[oklch(0.4_0.016_60)]"
            }`}
            type="button"
            aria-pressed={isActive}
            key={project}
            onClick={() => onSelect(project)}
          >
            {project}
            <span
              className={`min-w-5 rounded-[3px] px-[5px] py-0.5 text-center text-[10px]/[1.4] font-bold ${
                isActive
                  ? "bg-accent-ink/14 text-accent-ink"
                  : "bg-[oklch(0.2_0.013_60)] text-muted"
              }`}
            >
              {projectCounts.get(project) ?? 0}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

function DaySection({ date, groups }: { date: string; groups: ViewerGroup[] }) {
  return (
    <section className="relative min-w-0 [--content-inset:58px] [--thread-x:16px] pb-12 pl-[var(--content-inset)] last:pb-0 before:absolute before:top-[9px] before:bottom-[-12px] before:left-[calc(var(--thread-x)+2px)] before:w-px before:bg-line-strong before:content-[''] last:before:bottom-0 max-[700px]:[--content-inset:34px] max-[700px]:[--thread-x:7px]">
      <h2 className="relative mb-6 text-[13px]/[18px] font-bold tracking-[-0.015em] text-muted before:absolute before:top-0 before:left-[calc(var(--thread-x)-var(--content-inset)-9px)] before:size-[18px] before:rounded-full before:border-[3px] before:border-muted before:bg-paper before:shadow-[0_0_0_4px_var(--color-paper)] before:content-[''] max-[700px]:text-xs">
        <time dateTime={date}>{formatDay(date)}</time>
      </h2>
      <div className="grid min-w-0 gap-7">
        {groups.map((group, index) => (
          <CommitCard
            group={group}
            key={`${group.date ?? date}-${group.ref ?? "change"}-${index}`}
          />
        ))}
      </div>
    </section>
  );
}

function CommitCard({ group }: { group: ViewerGroup }) {
  const isPullRequest = group.kind === "pr";
  const groupProjects =
    Array.isArray(group.projects) && group.projects.length > 0
      ? group.projects
      : ["Repo"];
  const date = new Date(group.date ?? "");
  const validDate = !Number.isNaN(date.valueOf());
  const url = safeHttpUrl(group.link);
  const tokenTotal = group.usage?.total ?? 0;
  const entries = Array.isArray(group.entries) ? group.entries : [];

  return (
    <article
      className={`commit-visibility group relative min-w-0 max-w-full before:absolute before:top-0.5 before:left-[calc(var(--thread-x)-var(--content-inset)-7px)] before:z-[1] before:size-3.5 before:rounded-full before:border-[3px] before:border-paper before:shadow-[0_0_0_1px_var(--color-line-strong)] before:content-[''] ${
        isPullRequest ? "before:bg-pr" : "before:bg-accent"
      }`}
    >
      <header className="mb-2.5 flex min-h-[18px] flex-wrap items-center gap-2 text-xs/[1.5] text-muted">
        <span
          className={`rounded-[3px] px-1.5 py-[3px] text-[10px]/[1.2] font-[750] tracking-[0.08em] uppercase ${
            isPullRequest
              ? "bg-[oklch(0.22_0.04_300)] text-[oklch(0.72_0.12_300)]"
              : "bg-accent-soft text-accent"
          }`}
        >
          {isPullRequest ? "PR" : "Commit"}
        </span>
        <code className="text-[13px]/[1.2] font-[750] text-ink">
          {group.ref || "change"}
        </code>
        <span>by {group.author || "Unknown"}</span>
        {groupProjects.map((project) => (
          <span
            className="rounded-[3px] border border-[oklch(0.32_0.05_260)] bg-[oklch(0.22_0.03_260)] px-1.5 py-0.5 text-[10px] font-bold text-[oklch(0.72_0.1_260)]"
            key={project}
          >
            {project}
          </span>
        ))}
        {validDate ? (
          <time dateTime={date.toISOString()}>
            {timeFormatter.format(date)}
          </time>
        ) : null}
        {tokenTotal > 0 || url ? (
          <span className="ml-auto inline-flex items-center gap-2">
            {tokenTotal > 0 ? (
              <span className="whitespace-nowrap rounded-[3px] bg-[oklch(0.2_0.025_180)] px-[7px] py-0.5 text-[10.5px] font-bold text-[oklch(0.68_0.08_180)]">
                {formatTokens(tokenTotal)}
              </span>
            ) : null}
            {url ? (
              <a
                className="font-bold text-accent underline-offset-2 hover:underline"
                href={url}
                target="_blank"
                rel="noopener noreferrer"
              >
                View →
              </a>
            ) : null}
          </span>
        ) : null}
      </header>
      <ol className="grid list-none gap-3.5 rounded-lg border border-line bg-surface px-[18px] py-4 pb-[17px] shadow-[0_1px_0_oklch(0.1_0.01_60/0.2)] transition-[border-color,box-shadow] duration-150 group-hover:border-[oklch(0.4_0.016_60)] group-hover:shadow-hard motion-reduce:transition-none max-[700px]:px-3.5">
        {entries.map((entry, index) => (
          <EntryRow
            entry={entry}
            key={`${entry.letter ?? "entry"}-${entry.description ?? index}`}
          />
        ))}
      </ol>
    </article>
  );
}

function EntryRow({ entry }: { entry: ViewerEntry }) {
  const tags =
    Array.isArray(entry.tags) && entry.tags.length > 0 ? entry.tags : ["other"];

  return (
    <li className="grid grid-cols-[34px_minmax(0,1fr)] items-start gap-2.5 border-line pt-3.5 first:pt-0 [&+&]:border-t">
      <span className="min-w-8 rounded-sm bg-accent-soft px-1.5 py-0.5 text-center text-[11px]/[1.35] font-[750] text-accent">
        {entry.letter || "(·)"}
      </span>
      <div className="min-w-0">
        <div className="mb-1 flex flex-wrap gap-[5px]">
          {tags.map((tag, index) => {
            const type = toChangeType(tag);
            return (
              <span
                className={`rounded-[3px] px-1.5 py-0.5 text-[9px]/[1.35] font-bold ${tagStyles[type]}`}
                key={`${tag}-${index}`}
              >
                {tag}
              </span>
            );
          })}
        </div>
        <p className="m-0 overflow-wrap-anywhere text-[13.5px]/[1.55] text-[oklch(0.66_0.015_60)]">
          {entry.description || "Updated project files"}
        </p>
      </div>
    </li>
  );
}

function EmptyState({ activeProject }: { activeProject: string }) {
  return (
    <div className="rounded-lg border border-dashed border-line-strong bg-surface/60 px-6 py-12 text-center text-muted">
      <strong className="mb-2 block text-[15px]/[1.3] font-bold text-ink">
        {activeProject === "All"
          ? "No recorded changes yet"
          : `No changes for ${activeProject}`}
      </strong>
      Commit with the changelog hooks installed; this view refreshes
      automatically.
    </div>
  );
}

function Footer() {
  return (
    <footer className="mt-[52px] ml-[58px] flex justify-between gap-[18px] border-t border-line pt-4 text-[10px]/[1.5] font-semibold text-faint max-[700px]:ml-[34px] max-[700px]:flex-col">
      <span>
        Generated with <span className="font-[750] text-ink">whatijustdid</span>
        .
      </span>
      <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 max-[700px]:justify-start">
        <span>Only opted-in commits appear.</span>
        {canRunPreviewActions ? <ClearHistoryButton /> : null}
      </div>
    </footer>
  );
}

function ClearHistoryButton() {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClearHistory() {
    const confirmed = window.confirm(
      "Clear every local summary for this clone?\n\nLinked worktrees share this history. You can generate it again later, which may use AI tokens.",
    );
    if (!confirmed || !actionToken) return;

    setError(null);
    startTransition(async () => {
      try {
        const response = await fetch("/api/actions/clear-history", {
          method: "POST",
          headers: {
            "X-Whatijustdid-Action-Token": actionToken,
            "X-Whatijustdid-Confirm": "clear-history",
          },
        });
        if (!response.ok) throw new Error(await actionError(response));
        window.location.reload();
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to clear local history",
        );
      }
    });
  }

  return (
    <span className="inline-flex flex-col items-end gap-1 max-[700px]:items-start">
      <button
        className="cursor-pointer border-0 bg-transparent p-0 font-bold text-faint underline decoration-line-strong underline-offset-2 hover:text-[oklch(0.72_0.14_25)] disabled:cursor-wait disabled:opacity-60"
        type="button"
        disabled={isPending}
        onClick={handleClearHistory}
      >
        {isPending ? "Clearing…" : "Clear local history"}
      </button>
      {error ? (
        <span
          className="max-w-[280px] text-right text-[oklch(0.72_0.14_25)] max-[700px]:text-left"
          role="alert"
        >
          {error}
        </span>
      ) : null}
    </span>
  );
}

async function actionError(response: Response) {
  try {
    const body: unknown = await response.json();
    if (
      body &&
      typeof body === "object" &&
      "error" in body &&
      typeof body.error === "string"
    ) {
      return body.error;
    }
  } catch {
    // Fall back to a status-based message for a malformed error response.
  }
  return `Unable to clear local history (${response.status})`;
}

function groupByDay(groups: ViewerGroup[]) {
  const days = new Map<string, ViewerGroup[]>();
  for (const group of groups) {
    const key = localDateKey(group.date);
    const day = days.get(key);
    if (day) day.push(group);
    else days.set(key, [group]);
  }
  return [...days];
}

function formatDay(key: string) {
  const date = new Date(`${key}T00:00:00`);
  return Number.isNaN(date.valueOf()) ? key : dayFormatter.format(date);
}

function formatTokens(total: number) {
  return total >= 1_000 ? `${(total / 1_000).toFixed(1)}k tok` : `${total} tok`;
}

function formatBytes(total: number) {
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let value = total;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${unit === 0 ? value : value.toFixed(1)} ${units[unit]}`;
}
