export const CHANGE_TYPES = [
  "feat",
  "fix",
  "refactor",
  "perf",
  "chore",
  "docs",
  "test",
  "style",
  "build",
  "ci",
  "other",
];

export const CHANGELOG_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    type: { type: "string", enum: CHANGE_TYPES },
    changes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          type: { type: "string", enum: CHANGE_TYPES },
          summary: { type: "string" },
        },
        required: ["type", "summary"],
      },
    },
  },
  required: ["type", "changes"],
};

export const SYSTEM_PROMPT = `Turn staged code changes into a concise user-facing changelog entry.
Return one item per distinct job performed. Describe observable behavior, not filenames or implementation trivia.
Use past tense. Do not invent changes. Return only data matching the supplied JSON schema.`;

export function formatProviderInput({ subject = "", body = "", files = [], diff = "" }) {
  return [
    `Commit subject (may be unavailable before commit):\n${subject || "(not available)"}`,
    `Commit body:\n${body || "(not available)"}`,
    `Changed files:\n${files.length ? files.join("\n") : "(none)"}`,
    `Staged diff:\n${diff || "(not provided)"}`,
  ].join("\n\n");
}

export function coerceModelJson(text, fallback) {
  try {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    const parsed = JSON.parse(start >= 0 && end >= start ? text.slice(start, end + 1) : text);
    const changes = Array.isArray(parsed.changes)
      ? parsed.changes
          .filter((change) => change && typeof change.summary === "string" && change.summary.trim())
          .slice(0, 12)
          .map((change) => ({
            type: CHANGE_TYPES.includes(change.type) ? change.type : fallback.type,
            summary: change.summary.trim().slice(0, 280),
          }))
      : [];

    if (changes.length) {
      return {
        type: CHANGE_TYPES.includes(parsed.type) ? parsed.type : changes[0].type,
        changes,
      };
    }
  } catch {
    // Caller gets a deterministic non-AI fallback.
  }

  return {
    type: fallback.type,
    changes: fallback.summary ? [{ type: fallback.type, summary: fallback.summary }] : [],
  };
}

export async function postJson(url, { headers, body, label, timeoutMs }) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const detail = (await response.text()).replace(/\s+/g, " ").slice(0, 400);
    throw new Error(`${label}: HTTP ${response.status}${detail ? ` — ${detail}` : ""}`);
  }

  return response.json();
}

export function apiUrl(baseUrl, path) {
  const base = baseUrl.replace(/\/+$/, "");
  const suffix = path.replace(/^\/+/, "");
  return base.endsWith("/v1") && suffix.startsWith("v1/")
    ? `${base}/${suffix.slice(3)}`
    : `${base}/${suffix}`;
}
