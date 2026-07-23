import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ViewerGroup, ViewerModel } from "./model";
import { Pagination } from "./Pagination";
import { ProjectFilters } from "./ProjectFilters";
import {
  canRunPreviewActions,
  fetchViewerModel,
  previewDataChangedEvent,
} from "./preview/previewActions";
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

export function ViewerApp({ model: initialModel }: ViewerAppProps) {
  const [model, setModel] = useState(initialModel);
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
  const {
    beginGeneration,
    completeScroll,
    dismissHighlight,
    failGeneration,
    generatedHighlights,
    revealGeneratedCommit,
    scrollTargetSha,
  } = useGeneratedCommitSession(model.groups);

  const replaceGroup = useCallback((group: ViewerGroup) => {
    setModel((current) => replaceViewerGroup(current, group));
  }, []);

  const handleGroupGenerated = useCallback(
    (group: ViewerGroup) => {
      replaceGroup(group);
      setShowMissingOnly(false);
      setActiveProject((current) =>
        viewerGroupMatchesProject(group, current) ? current : "All",
      );
      if (typeof group.sha === "string") revealGeneratedCommit(group.sha);
    },
    [replaceGroup, revealGeneratedCommit],
  );

  useEffect(() => {
    if (!canRunPreviewActions) return;
    let controller: AbortController | null = null;
    const refresh = () => {
      controller?.abort();
      controller = new AbortController();
      void fetchViewerModel(controller.signal)
        .then((next) => {
          startTransition(() => {
            setModel((current) => reconcileViewerModel(current, next));
          });
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }
          console.error("Unable to refresh viewer data", error);
        });
    };
    window.addEventListener(previewDataChangedEvent, refresh);
    refresh();
    return () => {
      controller?.abort();
      window.removeEventListener(previewDataChangedEvent, refresh);
    };
  }, []);

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
            onGenerationFailed={failGeneration}
            onGenerationStarted={beginGeneration}
            onGeneratedScrollCompleted={completeScroll}
            onGeneratedHighlightDismissed={dismissHighlight}
            onGroupGenerated={handleGroupGenerated}
            onGroupUpdated={replaceGroup}
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

function replaceViewerGroup(model: ViewerModel, updated: ViewerGroup) {
  if (typeof updated.sha !== "string") return model;
  let changed = false;
  const groups = model.groups.map((group) => {
    if (group.sha !== updated.sha) return group;
    changed = true;
    return updated;
  });
  return changed ? { ...model, groups } : model;
}

function reconcileViewerModel(current: ViewerModel, incoming: ViewerModel) {
  const currentGroups = new Map(
    current.groups.flatMap((group) =>
      typeof group.sha === "string" ? [[group.sha, group] as const] : [],
    ),
  );
  const groups = incoming.groups.map((group) => {
    if (typeof group.sha !== "string") return group;
    const existing = currentGroups.get(group.sha);
    return existing && sameViewerGroup(existing, group) ? existing : group;
  });
  return { ...incoming, groups };
}

function sameViewerGroup(left: ViewerGroup, right: ViewerGroup) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function viewerGroupMatchesProject(group: ViewerGroup, project: string) {
  const projects = Array.isArray(group.projects) ? group.projects : [];
  return (
    project === "All" ||
    (project === "Repo" && projects.length === 0) ||
    projects.includes(project)
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
