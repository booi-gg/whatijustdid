import { useState, useTransition } from "react";
import { clearLocalHistory } from "./previewActions";

export function ClearHistoryButton() {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClearHistory() {
    const confirmed = window.confirm(
      "Clear every local summary for this clone?\n\nLinked worktrees share this history. You can generate it again later, which may use AI tokens.",
    );
    if (!confirmed) return;

    setError(null);
    startTransition(async () => {
      try {
        await clearLocalHistory();
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
