const STORAGE_KEY = "whatijustdid.viewer-preferences.v1";
const DEFAULT_COMMITS_PER_PAGE = 10;

export interface ViewerPreferences {
  commitsPerPage: number;
}

export function readViewerPreferences(maxCommitsPerPage: number) {
  const fallback = defaultPreferences(maxCommitsPerPage);
  try {
    const stored: unknown = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? "null",
    );
    if (!stored || typeof stored !== "object") return fallback;
    const commitsPerPage =
      "commitsPerPage" in stored ? stored.commitsPerPage : undefined;
    return {
      commitsPerPage: validCommitsPerPage(commitsPerPage, maxCommitsPerPage)
        ? commitsPerPage
        : fallback.commitsPerPage,
    };
  } catch {
    return fallback;
  }
}

export function saveViewerPreferences(preferences: ViewerPreferences) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // The active preference still applies when browser storage is unavailable.
  }
}

function defaultPreferences(maxCommitsPerPage: number): ViewerPreferences {
  return {
    commitsPerPage: Math.min(DEFAULT_COMMITS_PER_PAGE, maxCommitsPerPage),
  };
}

function validCommitsPerPage(value: unknown, maximum: number): value is number {
  return (
    Number.isSafeInteger(value) && Number(value) > 0 && Number(value) <= maximum
  );
}
