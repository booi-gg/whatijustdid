import { useMemo, useState } from "react";
import type { ViewerModel } from "./model";
import { Pagination } from "./Pagination";
import { ProjectFilters } from "./ProjectFilters";
import { useGeneratedCommitSession } from "./preview/useGeneratedCommitSession";
import { selectViewerPage } from "./selectViewerPage";
import { CommitTimeline } from "./timeline/CommitTimeline";
import { ViewerFooter } from "./ViewerFooter";
import { ViewerHeader } from "./ViewerHeader";
import { ViewerSettings } from "./ViewerSettings";
import {
  readViewerPreferences,
  saveViewerPreferences,
} from "./viewerPreferences";

interface ViewerAppProps {
  model: ViewerModel;
}

export function ViewerApp({ model }: ViewerAppProps) {
  const [activeProject, setActiveProject] = useState("All");
  const [showMissingOnly, setShowMissingOnly] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [commitsPerPage, setCommitsPerPage] = useState(
    () => readViewerPreferences(model.viewerLimit).commitsPerPage,
  );
  const page = useMemo(
    () =>
      selectViewerPage(
        model,
        activeProject,
        currentPage,
        commitsPerPage,
        showMissingOnly,
      ),
    [activeProject, commitsPerPage, currentPage, model, showMissingOnly],
  );
  const { dismissHighlight, generatedHighlights, scrollTargetSha } =
    useGeneratedCommitSession(model.groups);

  function handleProjectSelect(project: string) {
    setActiveProject(project);
    setShowMissingOnly(false);
    setCurrentPage(1);
  }

  function handleMissingSelect() {
    setActiveProject("All");
    setShowMissingOnly(true);
    setCurrentPage(1);
  }

  function handleCommitsPerPageSave(value: number) {
    saveViewerPreferences({ commitsPerPage: value });
    setCommitsPerPage(value);
    setCurrentPage(1);
  }

  return (
    <div className="mx-auto w-[min(900px,calc(100%-40px))] pt-[68px] pb-[92px] max-[700px]:w-[min(900px,calc(100%-28px))] max-[700px]:pt-[42px]">
      <ViewerHeader
        databaseSize={page.databaseSize}
        projectName={model.projectName}
        summary={page.summary}
      >
        <ViewerSettings
          commitsPerPage={commitsPerPage}
          databaseSize={page.databaseSize}
          defaultBackfillLimit={model.generationLimit}
          maxCommits={model.viewerLimit}
          onCommitsPerPageSave={handleCommitsPerPageSave}
        />
      </ViewerHeader>
      <div className="sticky top-0 z-10 -mx-3.5 mb-[38px] border-b border-line-strong/65 bg-surface/92 px-3.5 py-[15px] backdrop-blur-[14px]">
        <ProjectFilters
          activeProject={activeProject}
          missingChangelogCount={page.missingChangelogCount}
          projectCounts={page.projectCounts}
          projectNames={model.projectNames}
          showMissingOnly={showMissingOnly}
          onMissingSelect={handleMissingSelect}
          onSelect={handleProjectSelect}
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
          <EmptyState
            activeProject={activeProject}
            showMissingOnly={showMissingOnly}
          />
        )}
        <Pagination
          currentPage={page.currentPage}
          onPageChange={setCurrentPage}
          pageCount={page.pageCount}
        />
      </main>
      <ViewerFooter />
    </div>
  );
}

interface EmptyStateProps {
  activeProject: string;
  showMissingOnly: boolean;
}

function EmptyState({ activeProject, showMissingOnly }: EmptyStateProps) {
  return (
    <div className="rounded-lg border border-dashed border-line-strong bg-surface/60 px-6 py-12 text-center text-muted">
      <strong className="mb-2 block text-[15px]/[1.3] font-bold text-ink">
        {showMissingOnly
          ? "No commits need a changelog"
          : activeProject === "All"
            ? "No recorded changes yet"
            : `No changes for ${activeProject}`}
      </strong>
      {showMissingOnly
        ? "All listed commits already have generated changelogs."
        : "Commit with the changelog hooks installed; this view refreshes automatically."}
    </div>
  );
}
