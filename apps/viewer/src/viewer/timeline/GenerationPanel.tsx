import { useState, useTransition } from "react";
import type { ViewerGroup, ViewerSummaryStatus } from "../model";
import {
  formatAgentName,
  formatLineChanges,
  formatTokenEstimate,
  validCount,
} from "../presentation";
import {
  beginGeneratedCommit,
  failGeneratedCommit,
} from "../preview/generatedCommitSession";
import {
  canGenerateSummary,
  canRunPreviewActions,
  generateSummary,
} from "../preview/previewActions";

interface GenerationPanelProps {
  group: ViewerGroup;
  status: ViewerSummaryStatus;
}

export function GenerationPanel({ group, status }: GenerationPanelProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const isGenerating = status === "generating" || isPending;
  const sha = typeof group.sha === "string" ? group.sha : "";
  const canGenerate = canGenerateSummary(sha);
  const generation = group.generation;
  const linesChanged = validCount(group.stats?.linesChanged);
  const tokenEstimate = formatTokenEstimate(generation);
  const storedError =
    status === "failed"
      ? group.entries?.[0]?.description?.replace(/^Summary failed:\s*/i, "")
      : null;

  function handleGenerate() {
    if (!canGenerate) return;
    setError(null);
    // The data-file watcher may reload the page before the response resolves.
    beginGeneratedCommit(sha);
    startTransition(async () => {
      try {
        await generateSummary(sha);
        window.location.reload();
      } catch (requestError) {
        failGeneratedCommit(sha);
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to generate this summary",
        );
      }
    });
  }

  return (
    <div
      className={`generation-panel relative overflow-hidden rounded-lg border px-[18px] py-[17px] shadow-[0_1px_0_oklch(0.1_0.01_60/0.2)] max-[700px]:px-3.5 ${
        isGenerating
          ? "generation-panel-active border-accent/45"
          : "border-line bg-surface"
      }`}
      aria-busy={isGenerating}
      aria-live="polite"
    >
      {isGenerating ? (
        <GeneratingContent group={group} />
      ) : (
        <div className="relative z-[1] grid grid-cols-[minmax(0,1fr)_auto] items-center gap-6 max-[700px]:grid-cols-1 max-[700px]:gap-4">
          <div className="min-w-0">
            <p className="mb-2 text-[10px]/[1.2] font-bold tracking-[0.1em] text-muted uppercase">
              {status === "failed" ? "Generation failed" : "Not generated"}
            </p>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <strong className="text-[20px]/[1.1] font-[780] tracking-[-0.04em] text-ink">
                N/A
              </strong>
              <span className="text-xs/[1.5] text-muted">
                Generate <span className="italic">changelog</span> for this
                commit.
              </span>
            </div>
            <p className="mt-2 text-[10.5px]/[1.5] font-semibold text-faint">
              {linesChanged === null
                ? "Line count unavailable"
                : formatLineChanges(linesChanged)}
              {tokenEstimate ? ` · ${tokenEstimate}` : ""}
            </p>
            <p className="mt-1 overflow-wrap-anywhere text-[10.5px]/[1.5] text-faint">
              Agent ·{" "}
              <span className="font-bold text-muted">
                {formatAgentName(generation?.agent)}
              </span>
              {" · "}Model ·{" "}
              <code className="font-bold text-muted">
                {generation?.model || "provider default"}
              </code>
            </p>
            {storedError || error ? (
              <p
                className="mt-2 overflow-wrap-anywhere text-[11px]/[1.5] text-[oklch(0.72_0.14_25)]"
                role="alert"
              >
                {error ?? storedError}
              </p>
            ) : null}
            {!canRunPreviewActions ? (
              <p className="mt-2 text-[10.5px]/[1.5] text-faint">
                Open with <code>whatijustdid preview</code> to generate.
              </p>
            ) : null}
          </div>
          <button
            className="min-h-10 min-w-[112px] cursor-pointer rounded-[5px] border border-accent bg-accent px-4 py-2 text-xs font-[780] text-accent-ink shadow-[3px_3px_0_oklch(0.1_0.01_60)] transition-[transform,box-shadow] hover:-translate-y-px hover:shadow-[4px_4px_0_oklch(0.1_0.01_60)] disabled:cursor-not-allowed disabled:border-line-strong disabled:bg-line disabled:text-faint disabled:shadow-none motion-reduce:transition-none max-[700px]:w-full"
            type="button"
            disabled={!canGenerate}
            onClick={handleGenerate}
          >
            Generate
          </button>
        </div>
      )}
    </div>
  );
}

function GeneratingContent({ group }: { group: ViewerGroup }) {
  return (
    <div className="relative z-[1]">
      <p className="mb-3 flex items-center gap-2 text-[10px]/[1.2] font-bold tracking-[0.1em] text-accent uppercase">
        <span
          className="generation-pulse size-2 rounded-full bg-accent"
          aria-hidden="true"
        />
        Generating
      </p>
      <strong className="block text-[15px]/[1.35] font-[750] text-ink">
        Generating <span className="italic">changlogs...</span>…
      </strong>
      <p className="mt-1.5 max-w-[620px] text-xs/[1.55] text-muted">
        Reading this commit’s diff and writing its local summary. This page
        refreshes when it is ready.
      </p>
      <GenerationDetails group={group} />
    </div>
  );
}

function GenerationDetails({ group }: { group: ViewerGroup }) {
  const generation = group.generation;
  const details = [
    ["Agent", formatAgentName(generation?.agent)],
    ["Model", generation?.model || "provider default"],
    ["Commit", group.ref || "change"],
  ];

  return (
    <dl className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-[5px] border border-line-strong bg-line-strong max-[700px]:grid-cols-1">
      {details.map(([label, value]) => (
        <div className="min-w-0 bg-paper/90 px-3 py-2.5" key={label}>
          <dt className="mb-1 text-[9px]/[1.2] font-bold tracking-[0.09em] text-faint uppercase">
            {label}
          </dt>
          <dd className="m-0 overflow-wrap-anywhere text-[11px]/[1.35] font-bold text-ink">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
