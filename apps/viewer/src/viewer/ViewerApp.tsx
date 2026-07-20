import { useMemo, useState } from "react";
import type { ViewerModel } from "./model";
import { ProjectFilters } from "./ProjectFilters";
import { useGeneratedCommitSession } from "./preview/useGeneratedCommitSession";
import { selectViewerPage } from "./selectViewerPage";
import { CommitTimeline } from "./timeline/CommitTimeline";
import { ViewerFooter } from "./ViewerFooter";
import { ViewerHeader } from "./ViewerHeader";

interface ViewerAppProps {
  model: ViewerModel;
}

export function ViewerApp({ model }: ViewerAppProps) {
  const [activeProject, setActiveProject] = useState("All");
  const page = useMemo(
    () => selectViewerPage(model, activeProject),
    [activeProject, model],
  );
  const { dismissHighlight, generatedHighlights, scrollTargetSha } =
    useGeneratedCommitSession(model.groups);

  return (
    <div className="mx-auto w-[min(900px,calc(100%-40px))] pt-[68px] pb-[92px] max-[700px]:w-[min(900px,calc(100%-28px))] max-[700px]:pt-[42px]">
      <ViewerHeader
        databaseSize={page.databaseSize}
        projectName={model.projectName}
        summary={page.summary}
      />
      <div className="sticky top-0 z-10 -mx-3.5 mb-[38px] border-b border-line-strong/65 bg-surface/92 px-3.5 py-[15px] backdrop-blur-[14px]">
        <ProjectFilters
          activeProject={activeProject}
          projectCounts={page.projectCounts}
          projectNames={model.projectNames}
          onSelect={setActiveProject}
        />
      </div>
      <main>
        {page.days.length > 0 ? (
          <CommitTimeline
            days={page.days}
            generatedHighlights={generatedHighlights}
            onGeneratedHighlightDismissed={dismissHighlight}
            scrollTargetSha={scrollTargetSha}
          />
        ) : (
          <EmptyState activeProject={activeProject} />
        )}
      </main>
      <ViewerFooter />
    </div>
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
