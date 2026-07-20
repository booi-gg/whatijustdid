import { useEffect, useId, useRef, useState, useTransition } from "react";
import {
  backfillSummaries,
  canRunPreviewActions,
  clearLocalHistory,
} from "./preview/previewActions";

interface ViewerSettingsProps {
  commitsPerPage: number;
  databaseSize: string | null;
  defaultBackfillLimit: number;
  maxCommits: number;
  onCommitsPerPageSave: (value: number) => void;
}

export function ViewerSettings({
  commitsPerPage,
  databaseSize,
  defaultBackfillLimit,
  maxCommits,
  onCommitsPerPageSave,
}: ViewerSettingsProps) {
  const dialogId = useId();
  const headingId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [commitsPerPageDraft, setCommitsPerPageDraft] = useState(
    String(commitsPerPage),
  );
  const [backfillLimit, setBackfillLimit] = useState(
    String(Math.min(defaultBackfillLimit, maxCommits)),
  );
  const [preferenceError, setPreferenceError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isBackfillPending, startBackfillTransition] = useTransition();
  const [isClearPending, startClearTransition] = useTransition();
  const actionPending = isBackfillPending || isClearPending;

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !containerRef.current?.contains(event.target)
      ) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setIsOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  function toggleSettings() {
    setCommitsPerPageDraft(String(commitsPerPage));
    setPreferenceError(null);
    setActionError(null);
    setIsOpen((open) => !open);
  }

  function savePreferences(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = positiveInteger(commitsPerPageDraft, maxCommits);
    if (value === null) {
      setPreferenceError(`Choose a whole number from 1 to ${maxCommits}.`);
      return;
    }
    onCommitsPerPageSave(value);
    setIsOpen(false);
    triggerRef.current?.focus();
  }

  function handleBackfill() {
    const limit = positiveInteger(backfillLimit, maxCommits);
    if (limit === null) {
      setActionError(`Choose a whole number from 1 to ${maxCommits}.`);
      return;
    }

    setActionError(null);
    startBackfillTransition(async () => {
      try {
        await backfillSummaries(limit);
        window.location.reload();
      } catch (requestError) {
        setActionError(
          actionErrorMessage(requestError, "Unable to backfill summaries"),
        );
      }
    });
  }

  function handleClearDatabase() {
    const confirmed = window.confirm(
      "Clear every local summary for this clone?\n\nLinked worktrees share this database. You can generate the summaries again later, which may use AI tokens.",
    );
    if (!confirmed) return;

    setActionError(null);
    startClearTransition(async () => {
      try {
        await clearLocalHistory();
        window.location.reload();
      } catch (requestError) {
        setActionError(
          actionErrorMessage(requestError, "Unable to clear the database"),
        );
      }
    });
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        className={`grid size-9 cursor-pointer place-items-center rounded-[5px] border bg-surface text-muted transition-[color,border-color,background-color,transform] hover:border-muted hover:text-ink active:translate-y-px ${
          isOpen
            ? "border-accent bg-accent-soft text-accent"
            : "border-line-strong"
        }`}
        type="button"
        aria-controls={dialogId}
        aria-expanded={isOpen}
        aria-label={isOpen ? "Close settings" : "Open settings"}
        onClick={toggleSettings}
        ref={triggerRef}
        title="Settings"
      >
        <SettingsIcon />
      </button>

      {isOpen ? (
        <div
          className="absolute top-[calc(100%+9px)] right-0 z-30 max-h-[calc(100vh-104px)] w-[min(354px,calc(100vw-28px))] overflow-y-auto rounded-[7px] border border-line-strong border-t-2 border-t-accent bg-surface p-4 shadow-hard"
          id={dialogId}
          role="dialog"
          aria-labelledby={headingId}
        >
          <header className="mb-4 flex items-start justify-between gap-4 border-b border-line pb-3">
            <div>
              <p className="mb-1 text-[9px]/[1.2] font-bold tracking-[0.12em] text-accent uppercase">
                Local controls
              </p>
              <h2
                className="m-0 text-sm/[1.25] font-[760] tracking-[-0.035em] text-ink"
                id={headingId}
              >
                Viewer settings
              </h2>
            </div>
            <span className="mt-0.5 inline-flex items-center gap-1.5 text-[9px] font-bold tracking-[0.08em] text-faint uppercase">
              <span className="size-1.5 rounded-full bg-accent" />
              This browser
            </span>
          </header>

          <form className="mb-4" onSubmit={savePreferences}>
            <label
              className="mb-2 block text-[10px] font-bold tracking-[0.07em] text-muted uppercase"
              htmlFor={`${dialogId}-page-size`}
            >
              Commits per page
            </label>
            <div className="flex gap-2">
              <input
                className="min-w-0 flex-1 rounded-[4px] border border-line-strong bg-paper px-3 py-2 text-xs font-bold text-ink outline-none transition-colors focus:border-accent"
                id={`${dialogId}-page-size`}
                type="number"
                inputMode="numeric"
                max={maxCommits}
                min="1"
                step="1"
                value={commitsPerPageDraft}
                onChange={(event) => setCommitsPerPageDraft(event.target.value)}
              />
              <button
                className="cursor-pointer rounded-[4px] border border-accent bg-accent px-3 text-[10px] font-extrabold text-accent-ink transition-colors hover:bg-[oklch(0.9_0.16_92)]"
                type="submit"
              >
                Save
              </button>
            </div>
            <p className="mt-2 text-[9px]/[1.45] text-faint">
              Saved only in this browser. Filters always restart at page 1.
            </p>
            {preferenceError ? (
              <p
                className="mt-2 text-[10px]/[1.4] text-[oklch(0.72_0.14_25)]"
                role="alert"
              >
                {preferenceError}
              </p>
            ) : null}
          </form>

          <section
            className="border-t border-line pt-4"
            aria-labelledby={`${dialogId}-history`}
          >
            <h3
              className="mb-3 text-[10px]/[1.2] font-bold tracking-[0.08em] text-muted uppercase"
              id={`${dialogId}-history`}
            >
              Local history
            </h3>

            <div className="mb-3 rounded-[5px] border border-line bg-paper/55 p-3">
              <div className="mb-2 flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px]/[1.3] font-bold text-ink">
                    Backfill summaries
                  </p>
                  <p className="mt-1 text-[9px]/[1.45] text-faint">
                    Check this many recent commits. Missing summaries use your
                    configured AI.
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <label
                  className="sr-only"
                  htmlFor={`${dialogId}-backfill-limit`}
                >
                  Number of recent commits to backfill
                </label>
                <input
                  className="min-w-0 flex-1 rounded-[4px] border border-line-strong bg-surface px-3 py-2 text-xs font-bold text-ink outline-none transition-colors focus:border-accent disabled:opacity-45"
                  id={`${dialogId}-backfill-limit`}
                  type="number"
                  inputMode="numeric"
                  max={maxCommits}
                  min="1"
                  step="1"
                  value={backfillLimit}
                  disabled={actionPending || !canRunPreviewActions}
                  onChange={(event) => setBackfillLimit(event.target.value)}
                />
                <button
                  className="cursor-pointer rounded-[4px] border border-line-strong bg-surface px-3 text-[10px] font-bold text-ink transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
                  type="button"
                  disabled={actionPending || !canRunPreviewActions}
                  onClick={handleBackfill}
                >
                  {isBackfillPending ? "Working…" : "Backfill"}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                className="cursor-pointer rounded-[4px] border border-[oklch(0.42_0.08_25)] bg-[oklch(0.19_0.025_25)] px-3 py-2.5 text-left text-[10px] font-bold text-[oklch(0.72_0.14_25)] transition-colors hover:border-[oklch(0.62_0.12_25)] disabled:cursor-not-allowed disabled:opacity-40"
                type="button"
                disabled={actionPending || !canRunPreviewActions}
                onClick={handleClearDatabase}
              >
                {isClearPending ? "Clearing…" : "Clear database"}
                <span className="mt-0.5 block text-[8px] font-semibold text-faint">
                  {databaseSize ?? "Local summaries"}
                </span>
              </button>
              <button
                className="cursor-not-allowed rounded-[4px] border border-line bg-paper/45 px-3 py-2.5 text-left text-[10px] font-bold text-faint opacity-60"
                type="button"
                disabled
                title="Cloud sync is not available yet"
              >
                Sync
                <span className="mt-0.5 block text-[8px] font-semibold tracking-[0.06em] uppercase">
                  Coming soon
                </span>
              </button>
            </div>

            {!canRunPreviewActions ? (
              <p className="mt-3 text-[9px]/[1.45] text-faint">
                Start the live preview to manage local history.
              </p>
            ) : null}
            {actionError ? (
              <p
                className="mt-3 text-[10px]/[1.45] text-[oklch(0.72_0.14_25)]"
                role="alert"
              >
                {actionError}
              </p>
            ) : null}
          </section>
        </div>
      ) : null}
    </div>
  );
}

function SettingsIcon() {
  return (
    <svg
      className="size-5"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 17H5" />
      <path d="M19 7h-9" />
      <circle cx="17" cy="17" r="3" />
      <circle cx="7" cy="7" r="3" />
    </svg>
  );
}

function positiveInteger(value: string, maximum: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= maximum
    ? parsed
    : null;
}

function actionErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
