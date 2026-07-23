import type { ViewerGroup, ViewerModel } from "../model";

const actionToken = document.querySelector<HTMLMetaElement>(
  'meta[name="whatijustdid-action-token"]',
)?.content;
const actionTokenPlaceholder = "__WHATIJUSTDID_ACTION_TOKEN__";
const commitShaPattern = /^[0-9a-f]{40}$/i;
export const previewDataChangedEvent = "whatijustdid:data-changed";

export type GenerateSummaryEvent =
  | { type: "started"; sha: string }
  | { type: "draft"; sha: string; changes: string[] }
  | {
      type: "complete";
      sha: string;
      group: ViewerGroup;
      warning?: string;
    }
  | {
      type: "failed";
      sha: string;
      error: string;
      group?: ViewerGroup;
    };

export const canRunPreviewActions = Boolean(
  actionToken && actionToken !== actionTokenPlaceholder,
);

export function canGenerateSummary(sha: string) {
  return canRunPreviewActions && commitShaPattern.test(sha);
}

export async function generateSummary(
  sha: string,
  onEvent: (event: GenerateSummaryEvent) => void,
) {
  if (!actionToken || !commitShaPattern.test(sha)) {
    throw new Error("Unable to generate this summary");
  }

  const response = await fetch(`/api/actions/generate-summary/${sha}`, {
    method: "POST",
    headers: { "X-Whatijustdid-Action-Token": actionToken },
  });
  if (!response.ok) {
    throw new Error(
      await actionError(response, "Unable to generate this summary"),
    );
  }
  if (!response.body) throw new Error("Generation stream was empty");

  let completedGroup: ViewerGroup | null = null;
  for await (const event of readGenerationEvents(response.body)) {
    onEvent(event);
    if (event.type === "failed") throw new Error(event.error);
    if (event.type === "complete") completedGroup = event.group;
  }
  if (!completedGroup) {
    throw new Error("Generation stream ended before the summary was ready");
  }
  return completedGroup;
}

export async function fetchViewerModel(signal?: AbortSignal) {
  const response = await fetch("/api/viewer-model", { signal });
  if (!response.ok) {
    throw new Error(
      await actionError(response, "Unable to refresh viewer data"),
    );
  }
  const body: unknown = await response.json();
  if (!isViewerModel(body)) throw new Error("Viewer returned invalid data");
  return body;
}

export function requestViewerRefresh() {
  window.dispatchEvent(new Event(previewDataChangedEvent));
}

export async function clearLocalHistory() {
  if (!actionToken) throw new Error("Unable to clear local history");

  const response = await fetch("/api/actions/clear-history", {
    method: "POST",
    headers: {
      "X-Whatijustdid-Action-Token": actionToken,
      "X-Whatijustdid-Confirm": "clear-history",
    },
  });
  if (!response.ok) {
    throw new Error(
      await actionError(response, "Unable to clear local history"),
    );
  }
}

export async function backfillSummaries(limit: number) {
  if (!actionToken) throw new Error("Unable to backfill summaries");

  const response = await fetch("/api/actions/backfill", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Whatijustdid-Action-Token": actionToken,
      "X-Whatijustdid-Confirm": "backfill",
    },
    body: JSON.stringify({ limit }),
  });
  if (!response.ok) {
    throw new Error(
      await actionError(response, "Unable to backfill summaries"),
    );
  }
}

async function actionError(response: Response, fallback: string) {
  try {
    const body: unknown = await response.json();
    if (
      body &&
      typeof body === "object" &&
      "error" in body &&
      typeof body.error === "string"
    ) {
      return body.error;
    }
  } catch {
    // Fall back to a status-based message for a malformed error response.
  }
  return `${fallback} (${response.status})`;
}

async function* readGenerationEvents(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffered += decoder.decode(chunk.value, { stream: true });
      let newline;
      while ((newline = buffered.indexOf("\n")) >= 0) {
        const line = buffered.slice(0, newline).trim();
        buffered = buffered.slice(newline + 1);
        if (line) yield parseGenerationEvent(line);
      }
    }
    buffered += decoder.decode();
    if (buffered.trim()) yield parseGenerationEvent(buffered.trim());
  } finally {
    reader.releaseLock();
  }
}

function parseGenerationEvent(line: string): GenerateSummaryEvent {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    throw new Error("Generation stream returned invalid data");
  }
  if (!value || typeof value !== "object" || !("type" in value)) {
    throw new Error("Generation stream returned an invalid event");
  }
  const event = value as Record<string, unknown>;
  if (
    (event.type === "started" || event.type === "draft") &&
    typeof event.sha === "string" &&
    (event.type !== "draft" ||
      (Array.isArray(event.changes) &&
        event.changes.every((change) => typeof change === "string")))
  ) {
    return event as GenerateSummaryEvent;
  }
  if (
    event.type === "complete" &&
    typeof event.sha === "string" &&
    isViewerGroup(event.group)
  ) {
    return event as GenerateSummaryEvent;
  }
  if (
    event.type === "failed" &&
    typeof event.sha === "string" &&
    typeof event.error === "string" &&
    (event.group === undefined || isViewerGroup(event.group))
  ) {
    return event as GenerateSummaryEvent;
  }
  throw new Error("Generation stream returned an invalid event");
}

function isViewerModel(value: unknown): value is ViewerModel {
  if (!value || typeof value !== "object") return false;
  const model = value as Record<string, unknown>;
  return (
    Array.isArray(model.groups) &&
    model.groups.every(isViewerGroup) &&
    typeof model.projectName === "string" &&
    Array.isArray(model.projectNames) &&
    model.projectNames.every((name) => typeof name === "string") &&
    isPositiveInteger(model.generationLimit) &&
    isPositiveInteger(model.viewerLimit) &&
    (model.databaseSizeBytes === null ||
      (typeof model.databaseSizeBytes === "number" &&
        Number.isSafeInteger(model.databaseSizeBytes) &&
        model.databaseSizeBytes >= 0))
  );
}

function isViewerGroup(value: unknown): value is ViewerGroup {
  return Boolean(value && typeof value === "object");
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
