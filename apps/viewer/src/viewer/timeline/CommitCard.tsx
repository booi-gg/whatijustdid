import { useEffect, useRef } from "react";
import { type ChangeType, type ViewerEntry, type ViewerGroup } from "../model";
import {
  formatLineChanges,
  formatTime,
  formatTokens,
  presentCommit,
  toChangeType,
} from "../presentation";
import { completeGeneratedCommit } from "../preview/generatedCommitSession";
import { GenerationPanel } from "./GenerationPanel";

const generatedHighlightDismissDelay = 5_000;

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

interface CommitCardProps {
  group: ViewerGroup;
  isGeneratedHighlight: boolean;
  onGeneratedHighlightDismissed: (sha: string) => void;
  shouldScrollIntoView: boolean;
}

export function CommitCard({
  group,
  isGeneratedHighlight,
  onGeneratedHighlightDismissed,
  shouldScrollIntoView,
}: CommitCardProps) {
  const dismissTimer = useRef<number | null>(null);
  const articleRef = useRef<HTMLElement | null>(null);
  const commit = presentCommit(group);

  useEffect(
    () => () => {
      if (dismissTimer.current !== null) {
        window.clearTimeout(dismissTimer.current);
      }
    },
    [],
  );

  // Mount-only by design. The marker survives the intermediate generating
  // reload and is cleared only when this target card mounts in its ready form.
  useEffect(() => {
    if (!shouldScrollIntoView) return;
    articleRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (commit.isReady && typeof group.sha === "string") {
      completeGeneratedCommit(group.sha);
    }
  }, []);

  function handleMouseEnter() {
    if (
      !isGeneratedHighlight ||
      dismissTimer.current !== null ||
      typeof group.sha !== "string"
    ) {
      return;
    }
    const sha = group.sha.toLowerCase();
    dismissTimer.current = window.setTimeout(() => {
      dismissTimer.current = null;
      onGeneratedHighlightDismissed(sha);
    }, generatedHighlightDismissDelay);
  }

  return (
    <article
      className={`commit-visibility group relative min-w-0 max-w-full before:absolute before:top-0.5 before:left-[calc(var(--thread-x)-var(--content-inset)-7px)] before:z-[1] before:size-3.5 before:rounded-full before:border-[3px] before:border-paper before:shadow-[0_0_0_1px_var(--color-line-strong)] before:content-[''] ${
        commit.isPullRequest ? "before:bg-pr" : "before:bg-accent"
      }`}
      onMouseEnter={handleMouseEnter}
      ref={articleRef}
    >
      <header className="mb-2.5 flex min-h-[18px] flex-wrap items-center gap-2 text-xs/[1.5] text-muted">
        <span
          className={`rounded-[3px] px-1.5 py-[3px] text-[10px]/[1.2] font-[750] tracking-[0.08em] uppercase ${
            commit.isPullRequest
              ? "bg-[oklch(0.22_0.04_300)] text-[oklch(0.72_0.12_300)]"
              : "bg-accent-soft text-accent"
          }`}
        >
          {commit.isPullRequest ? "PR" : "Commit"}
        </span>
        <code className="text-[13px]/[1.2] font-[750] text-ink">
          {group.ref || "change"}
        </code>
        <span>by {group.author || "Unknown"}</span>
        {commit.projects.map((project) => (
          <span
            className="rounded-[3px] border border-[oklch(0.32_0.05_260)] bg-[oklch(0.22_0.03_260)] px-1.5 py-0.5 text-[10px] font-bold text-[oklch(0.72_0.1_260)]"
            key={project}
          >
            {project}
          </span>
        ))}
        {commit.date ? (
          <time dateTime={commit.date.toISOString()}>
            {formatTime(commit.date)}
          </time>
        ) : null}
        {(commit.isReady && commit.linesChanged !== null) ||
        commit.tokenTotal > 0 ||
        commit.url ? (
          <span className="ml-auto inline-flex items-center gap-2">
            {commit.isReady && commit.linesChanged !== null ? (
              <span className="whitespace-nowrap text-[10.5px] font-bold text-faint">
                {formatLineChanges(commit.linesChanged)}
              </span>
            ) : null}
            {commit.tokenTotal > 0 ? (
              <span className="whitespace-nowrap rounded-[3px] bg-[oklch(0.2_0.025_180)] px-[7px] py-0.5 text-[10.5px] font-bold text-[oklch(0.68_0.08_180)]">
                {formatTokens(commit.tokenTotal)}
              </span>
            ) : null}
            {commit.url ? (
              <a
                className="font-bold text-accent underline-offset-2 hover:underline"
                href={commit.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                View →
              </a>
            ) : null}
          </span>
        ) : null}
      </header>
      {commit.isReady ? (
        <ol
          className={`grid list-none gap-3.5 rounded-lg border px-[18px] py-4 pb-[17px] shadow-[0_1px_0_oklch(0.1_0.01_60/0.2)] transition-[background-color,border-color,box-shadow] duration-300 group-hover:border-[oklch(0.4_0.016_60)] group-hover:shadow-hard motion-reduce:transition-none max-[700px]:px-3.5 ${
            isGeneratedHighlight
              ? "generated-commit-highlight"
              : "border-line bg-surface"
          }`}
          data-just-generated={isGeneratedHighlight ? "true" : undefined}
        >
          {commit.entries.map((entry, index) => (
            <EntryRow
              entry={entry}
              key={`${entry.letter ?? "entry"}-${entry.description ?? index}`}
            />
          ))}
        </ol>
      ) : (
        <GenerationPanel group={group} status={commit.status} />
      )}
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
