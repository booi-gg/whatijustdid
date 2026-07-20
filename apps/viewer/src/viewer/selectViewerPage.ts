import type { ViewerGroup, ViewerModel } from "./model";
import { dateValue, formatBytes, localDateKey } from "./presentation";

export type ViewerDay = [date: string, groups: ViewerGroup[]];

export interface ViewerPage {
  databaseSize: string | null;
  days: ViewerDay[];
  projectCounts: ReadonlyMap<string, number>;
  summary: string;
}

export function selectViewerPage(
  model: ViewerModel,
  activeProject: string,
): ViewerPage {
  const visibleGroups = model.groups
    .filter((group) => matchesProject(group, activeProject))
    .slice()
    .sort((left, right) => dateValue(right.date) - dateValue(left.date));
  const entryCount = visibleGroups.reduce(
    (total, group) =>
      total + (Array.isArray(group.entries) ? group.entries.length : 0),
    0,
  );

  return {
    databaseSize:
      model.databaseSizeBytes === null
        ? null
        : formatBytes(model.databaseSizeBytes),
    days: groupByDay(visibleGroups),
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
