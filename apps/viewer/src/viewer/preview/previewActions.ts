const actionToken = document.querySelector<HTMLMetaElement>(
  'meta[name="whatijustdid-action-token"]',
)?.content;
const actionTokenPlaceholder = "__WHATIJUSTDID_ACTION_TOKEN__";
const commitShaPattern = /^[0-9a-f]{40}$/i;

export const canRunPreviewActions = Boolean(
  actionToken && actionToken !== actionTokenPlaceholder,
);

export function canGenerateSummary(sha: string) {
  return canRunPreviewActions && commitShaPattern.test(sha);
}

export async function generateSummary(sha: string) {
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
