import { ClearHistoryButton } from "./preview/ClearHistoryButton";
import { canRunPreviewActions } from "./preview/previewActions";

export function ViewerFooter() {
  return (
    <footer className="mt-[52px] ml-[58px] flex justify-between gap-[18px] border-t border-line pt-4 text-[10px]/[1.5] font-semibold text-faint max-[700px]:ml-[34px] max-[700px]:flex-col">
      <span>
        Generated with <span className="font-[750] text-ink">whatijustdid</span>
        .
      </span>
      <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 max-[700px]:justify-start">
        <span>Missing local summaries appear as N/A.</span>
        {canRunPreviewActions ? <ClearHistoryButton /> : null}
      </div>
    </footer>
  );
}
