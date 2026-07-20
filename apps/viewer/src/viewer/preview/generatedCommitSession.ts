import type { ViewerGroup } from "../model";

const generatedHighlightsStorageKey =
  "whatijustdid:generated-commit-highlights";
const generatedScrollTargetStorageKey = "whatijustdid:generated-scroll-target";
const commitShaPattern = /^[0-9a-f]{40}$/i;

export function readActiveGeneratedHighlights(groups: ViewerGroup[]) {
  const stored = readGeneratedHighlights();
  const readyShas = new Set(
    groups.flatMap((group) =>
      group.status === "ready" && typeof group.sha === "string"
        ? [group.sha.toLowerCase()]
        : [],
    ),
  );
  return new Set([...stored].filter((sha) => readyShas.has(sha)));
}

export function readGeneratedScrollTarget() {
  try {
    const value = window.sessionStorage.getItem(
      generatedScrollTargetStorageKey,
    );
    return value && commitShaPattern.test(value) ? value : null;
  } catch {
    return null;
  }
}

export function beginGeneratedCommit(sha: string) {
  const highlights = readGeneratedHighlights();
  highlights.add(sha.toLowerCase());
  writeGeneratedHighlights(highlights);
  markGeneratedScrollTarget(sha);
}

export function failGeneratedCommit(sha: string) {
  dismissGeneratedCommit(sha);
  completeGeneratedCommit(sha);
}

export function dismissGeneratedCommit(sha: string) {
  const highlights = readGeneratedHighlights();
  highlights.delete(sha.toLowerCase());
  writeGeneratedHighlights(highlights);
}

export function completeGeneratedCommit(sha: string) {
  try {
    if (
      window.sessionStorage.getItem(generatedScrollTargetStorageKey) ===
      sha.toLowerCase()
    ) {
      window.sessionStorage.removeItem(generatedScrollTargetStorageKey);
    }
  } catch {
    // Nothing to clean up when browser storage is unavailable.
  }
}

function readGeneratedHighlights() {
  try {
    const stored: unknown = JSON.parse(
      window.sessionStorage.getItem(generatedHighlightsStorageKey) ?? "[]",
    );
    return new Set(
      Array.isArray(stored)
        ? stored.filter(
            (sha): sha is string =>
              typeof sha === "string" && commitShaPattern.test(sha),
          )
        : [],
    );
  } catch {
    return new Set<string>();
  }
}

function markGeneratedScrollTarget(sha: string) {
  try {
    window.sessionStorage.setItem(
      generatedScrollTargetStorageKey,
      sha.toLowerCase(),
    );
  } catch {
    // The auto-scroll is optional when browser storage is unavailable.
  }
}

function writeGeneratedHighlights(highlights: Set<string>) {
  try {
    if (highlights.size === 0) {
      window.sessionStorage.removeItem(generatedHighlightsStorageKey);
      return;
    }
    window.sessionStorage.setItem(
      generatedHighlightsStorageKey,
      JSON.stringify([...highlights]),
    );
  } catch {
    // The highlight is optional when browser storage is unavailable.
  }
}
