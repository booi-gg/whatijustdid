import type { ViewerGroup, ViewerModel } from "./model";

interface ViewerMetadata {
  databaseSizeBytes?: number;
}

declare global {
  interface Window {
    __WHATIJUSTDID__?: ViewerGroup[];
    __WHATIJUSTDID_PROJECT_NAME__?: string;
    __WHATIJUSTDID_PROJECTS__?: string[];
    __WHATIJUSTDID_META__?: ViewerMetadata;
  }
}

export function readViewerModel(): ViewerModel {
  const groups = Array.isArray(window.__WHATIJUSTDID__)
    ? window.__WHATIJUSTDID__
    : [];
  const configuredProjects = Array.isArray(window.__WHATIJUSTDID_PROJECTS__)
    ? window.__WHATIJUSTDID_PROJECTS__
    : [];
  const databaseSizeBytes = window.__WHATIJUSTDID_META__?.databaseSizeBytes;
  const projects = new Set<string>();

  for (const project of configuredProjects) {
    if (typeof project === "string" && project) projects.add(project);
  }
  for (const group of groups) {
    if (!Array.isArray(group.projects)) continue;
    for (const project of group.projects) {
      if (typeof project === "string" && project) projects.add(project);
    }
  }

  const hasRepositoryChanges = groups.some(
    (group) => !Array.isArray(group.projects) || group.projects.length === 0,
  );

  return {
    groups,
    projectName:
      typeof window.__WHATIJUSTDID_PROJECT_NAME__ === "string" &&
      window.__WHATIJUSTDID_PROJECT_NAME__.trim()
        ? window.__WHATIJUSTDID_PROJECT_NAME__.trim()
        : "Untitled project",
    databaseSizeBytes:
      typeof databaseSizeBytes === "number" &&
      Number.isSafeInteger(databaseSizeBytes) &&
      databaseSizeBytes >= 0
        ? databaseSizeBytes
        : null,
    projectNames: [
      "All",
      ...projects,
      ...(hasRepositoryChanges ? ["Repo"] : []),
    ],
  };
}
