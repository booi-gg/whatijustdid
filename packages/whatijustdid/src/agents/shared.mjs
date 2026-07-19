import { ENV_PREFIX } from "../brand.mjs";

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

export const MAX_FILE_LIST_BYTES = 20_000;

export const VERBOSITY_LEVELS = Object.freeze([
  "concise",
  "normal",
  "detailed",
]);

const VERBOSITY = {
  concise: { maxTokens: 600, maxSummaryChars: 140 },
  normal: { maxTokens: 1200, maxSummaryChars: 280 },
  detailed: { maxTokens: 2400, maxSummaryChars: 560 },
};

export function verbosityConfig(verbosity) {
  return VERBOSITY[verbosity] ?? VERBOSITY.normal;
}

export function verbosityPrompt(verbosity) {
  const level = VERBOSITY_LEVELS.includes(verbosity) ? verbosity : "normal";
  return `Turn the supplied code diff into a ${level} user-facing changelog entry.
Return one item per distinct job performed. Describe observable behavior, not filenames or implementation trivia.
Use past tense. Base every claim on the code diff; never substitute a commit message. Do not invent changes.
A hunk that only adds, removes, or rewrites comments, docstrings, or whitespace changes no behavior:
describe it as a comment/documentation change (type "docs" or "style"), and never claim the behavior the
comment text talks about was added or removed — e.g. deleting a comment that explains a workaround is
"Removed an explanatory comment", not "Removed the workaround".
Return only data matching the supplied JSON schema.`;
}

export const WHATIJUSTDID_SCHEMA = {
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

export const PROJECT_NAME_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: "string" },
  },
  required: ["name"],
};

export function projectNamePrompt() {
  return `Choose one real, established dish from any cuisine in the world as a memorable software project name.
Vary the region and cuisine instead of reaching for the same famous dishes every time. Use the dish's commonly
recognized English or transliterated name, with no adjectives, commentary, quotation marks, or project suffix.
Return only data matching the supplied JSON schema.`;
}

export function formatProjectNameInput({ randomCue }) {
  return [
    `Random dish cue: ${randomCue}`,
    "Use the cue to vary the choice; you may choose that dish or a different real dish.",
  ].join("\n");
}

export function parseProjectNameJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  const candidate =
    start >= 0 && end >= start ? text.slice(start, end + 1) : text;
  let parsed;
  try {
    parsed = JSON.parse(candidate);
  } catch (error) {
    throw new Error(
      `Agent returned an invalid project name: ${error.message}`,
      {
        cause: error,
      },
    );
  }
  const name =
    typeof parsed?.name === "string"
      ? parsed.name.trim().replace(/\s+/g, " ")
      : "";
  if (!name || name.length > 80) {
    throw new Error("Agent returned an invalid project name");
  }
  return name;
}

export function formatAgentInput({ files = [], diff = "" }) {
  return [
    `Changed files:\n${boundedFileList(files)}`,
    `Code diff:\n${diff || "(not provided)"}`,
  ].join("\n\n");
}

function boundedFileList(files) {
  if (!files.length) return "(none)";
  const selected = [];
  let bytes = 0;
  for (const file of files) {
    const nextBytes = Buffer.byteLength(`${file}\n`, "utf8");
    if (bytes + nextBytes > MAX_FILE_LIST_BYTES) break;
    selected.push(file);
    bytes += nextBytes;
  }
  const omitted = files.length - selected.length;
  if (omitted) selected.push(`[${omitted} more changed files omitted]`);
  return selected.join("\n");
}

function repairTruncatedJson(text) {
  let best = text;
  try {
    JSON.parse(best);
    return best;
  } catch {}

  const closings = closeOpenBrackets(text);
  for (const suffix of closings) {
    const candidate = text + suffix;
    try {
      JSON.parse(candidate);
      return candidate;
    } catch {}
  }

  let trimmed = text;
  while (trimmed.length > 0) {
    trimmed = trimmed.slice(0, -1);
    for (const suffix of closeOpenBrackets(trimmed)) {
      const candidate = trimmed + suffix;
      try {
        JSON.parse(candidate);
        return candidate;
      } catch {}
    }
  }

  return null;
}

function closeOpenBrackets(text) {
  const stack = [];
  let inString = false;
  let escaped = false;
  for (const ch of text) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\" && inString) {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{" || ch === "[") stack.push(ch);
    else if (ch === "}" || ch === "]") {
      const expected = ch === "}" ? "{" : "[";
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i] === expected) {
          stack.splice(i, 1);
          break;
        }
      }
    }
  }
  const closing = stack
    .reverse()
    .map((ch) => (ch === "{" ? "}" : "]"))
    .join("");
  if (!closing) return [];
  const suffixes = [closing];
  if (closing.startsWith("}")) suffixes.push(closing.slice(1));
  return suffixes;
}

export function parseAgentJson(text, { maxSummaryChars = 280 } = {}) {
  let parsed;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  const candidate =
    start >= 0 && end >= start ? text.slice(start, end + 1) : text;

  try {
    parsed = JSON.parse(candidate);
  } catch (error) {
    const repaired = repairTruncatedJson(candidate);
    if (repaired) {
      try {
        parsed = JSON.parse(repaired);
      } catch (repairError) {
        throw new Error(`Agent returned invalid JSON: ${error.message}`, {
          cause: error,
        });
      }
    } else {
      throw new Error(`Agent returned invalid JSON: ${error.message}`, {
        cause: error,
      });
    }
  }

  const entryType = CHANGE_TYPES.includes(parsed?.type) ? parsed.type : "other";
  const changes = Array.isArray(parsed?.changes)
    ? parsed.changes
        .filter(
          (change) =>
            change &&
            typeof change.summary === "string" &&
            change.summary.trim(),
        )
        .slice(0, 12)
        .map((change) => ({
          type: CHANGE_TYPES.includes(change.type) ? change.type : entryType,
          summary: change.summary.trim().slice(0, maxSummaryChars),
        }))
    : [];

  if (!changes.length)
    throw new Error("Agent returned no usable change summaries");

  return {
    type: entryType === "other" ? changes[0].type : entryType,
    changes,
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
    throw new Error(
      `${label}: HTTP ${response.status}${detail ? ` — ${detail}` : ""}`,
    );
  }

  return response.json();
}

/**
 * A single `${ENV_PREFIX}_AGENT_API_KEY` can hold the key for whichever agent
 * is currently configured, so switching agents doesn't require juggling
 * provider-specific env var names. It takes precedence because setting it
 * means "use this key for whatijustdid specifically"; the provider-specific
 * var is the fallback for a key already set for other tools.
 */
export function resolveApiKey(providerEnvVar) {
  return (
    process.env[`${ENV_PREFIX}_AGENT_API_KEY`] ?? process.env[providerEnvVar]
  );
}

export function apiUrl(baseUrl, path) {
  const base = baseUrl.replace(/\/+$/, "");
  const suffix = path.replace(/^\/+/, "");
  return base.endsWith("/v1") && suffix.startsWith("v1/")
    ? `${base}/${suffix.slice(3)}`
    : `${base}/${suffix}`;
}
