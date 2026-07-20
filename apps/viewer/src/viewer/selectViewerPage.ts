import type { ViewerGroup, ViewerModel } from "./model";
import { dateValue, formatBytes, localDateKey } from "./presentation";

export type ViewerDay = [date: string, groups: ViewerGroup[]];

export interface ViewerPage {
  currentPage: number;
  databaseSize: string | null;
  days: ViewerDay[];
  pageCount: number;
  projectCounts: ReadonlyMap<string, number>;
  summary: string;
}

export function selectViewerPage(
  model: ViewerModel,
  activeProject: string,
  requestedPage: number,
  commitsPerPage: number,
): ViewerPage {
  const visibleGroups = model.groups
    .filter((group) => matchesProject(group, activeProject))
    .slice()
    .sort((left, right) => dateValue(right.date) - dateValue(left.date));
  const pageCount = Math.max(
    1,
    Math.ceil(visibleGroups.length / commitsPerPage),
  );
  const currentPage = Math.min(Math.max(requestedPage, 1), pageCount);
  const pageStart = (currentPage - 1) * commitsPerPage;
  const entryCount = visibleGroups.reduce(
    (total, group) =>
      total + (Array.isArray(group.entries) ? group.entries.length : 0),
    0,
  );

  return {
    currentPage,
    databaseSize:
      model.databaseSizeBytes === null
        ? null
        : formatBytes(model.databaseSizeBytes),
    days: groupByDay(
      visibleGroups.slice(pageStart, pageStart + commitsPerPage),
    ),
    pageCount,
    projectCounts: new Map(
      model.projectNames.map((project) => [
        project,
        model.groups.filter((group) => matchesProject(group, project)).length,
      ]),
    ),
    summary: `${entryCount} ${entryCount === 1 ? "change" : "changes"} across ${visibleGroups.length} ${visibleGroups.length === 1 ? "commit" : "commits"} · ${activeProject}`,
  };
}

function matchesProject(group: ViewerGroup, project: string) {
  const groupProjects = Array.isArray(group.projects) ? group.projects : [];
  return (
    project === "All" ||
    (project === "Repo" && groupProjects.length === 0) ||
    groupProjects.includes(project)
  );
}

function groupByDay(groups: ViewerGroup[]): ViewerDay[] {
  const days = new Map<string, ViewerGroup[]>();
  for (const group of groups) {
    const key = localDateKey(group.date);
    const day = days.get(key);
    if (day) day.push(group);
    else days.set(key, [group]);
  }
  return [...days];
}
