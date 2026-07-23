import { randomUUID } from "node:crypto";
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { resolveAgentModel } from "./agents/index.mjs";
import { MAX_FILE_LIST_BYTES, verbosityConfig } from "./agents/shared.mjs";
import { CLI_NAME } from "./brand.mjs";
import { recentCommitMetas } from "./git.mjs";
import { openSummaryStore } from "./store.mjs";

const abc = "abcdefghijklmnopqrstuvwxyz";
const PROMPT_OVERHEAD_CHARACTERS = 1_600;
const ESTIMATED_CHARACTERS_PER_CHANGED_LINE = 48;
const ESTIMATED_CHARACTERS_PER_FILE = 64;

/** Read recent, still-reachable Git commits and their local generation records. */
export function readEntries(config, options = {}) {
  const limit =
    Number.isInteger(config.viewerLimit) && config.viewerLimit > 0
      ? config.viewerLimit
      : 200;
  const commits = options.commits ?? recentCommitMetas(limit, config.root);
  const store = options.store ?? openSummaryStore(config);
  const ownsStore = !options.store;
  try {
    const records = store.listByShas(commits.map((commit) => commit.sha));
    return commits.map((commit) => ({
      commit,
      summary: records.get(commit.sha),
    }));
  } finally {
    if (ownsStore) store.close();
  }
}

/** Map one stored AI result to the shape the bundled viewer renders. */
function toGroup(summary, commit, config) {
  const ready = summary?.status === "ready" && summary.changes?.length;
  const status = ready ? "ready" : (summary?.status ?? "missing");
  const stats = commitStats(commit);
  const group = {
    kind: "commit",
    sha: commit.sha,
    ref: commit.shortSha ?? commit.sha.slice(0, 7),
    author: commit.author || "Unknown",
    date: commit.date ?? new Date(0).toISOString(),
    status,
    projects: summary?.projects ?? [],
    link: null,
    entries: ready
      ? summary.changes.map((change, index) => ({
          letter: summary.changes.length > 1 ? `(${abc[index] ?? "+"})` : "",
          tags: [change.type ?? summary.type ?? "other"],
          description: change.summary,
        }))
      : [
          {
            letter: "(!)",
            tags: ["other"],
            description: statusMessage(summary),
          },
        ],
  };
  if (stats) group.stats = stats;
  if (!ready) group.generation = generationDetails(config, stats);
  if (config.showTokens && summary?.usage) {
    group.usage = summary.usage;
  }
  return group;
}

function commitStats(commit) {
  if (!Number.isSafeInteger(commit?.linesChanged) || commit.linesChanged < 0) {
    return null;
  }
  return {
    additions: nonNegativeInteger(commit.additions),
    deletions: nonNegativeInteger(commit.deletions),
    filesChanged: nonNegativeInteger(commit.filesChanged),
    linesChanged: commit.linesChanged,
  };
}

function generationDetails(config, stats) {
  const agent = config.agent ?? "codex";
  const model = resolveAgentModel(agent, config.model);
  return {
    agent,
    model,
    estimatedInputTokens: estimateInputTokens(stats, config, agent, model),
    maxOutputTokens: verbosityConfig(config.verbosity).maxTokens,
  };
}

function estimateInputTokens(stats, config, agent, model) {
  if (!stats) return null;
  // Git keeps the source of truth; estimate from numstat instead of copying raw
  // diffs into the viewer cache. The UI marks this value as approximate.
  const estimatedCharacters =
    PROMPT_OVERHEAD_CHARACTERS +
    stats.linesChanged * ESTIMATED_CHARACTERS_PER_CHANGED_LINE +
    stats.filesChanged * ESTIMATED_CHARACTERS_PER_FILE;
  const maxDiffBytes =
    Number.isSafeInteger(config.maxDiffBytes) && config.maxDiffBytes > 0
      ? config.maxDiffBytes
      : 80_000;
  const maximumCharacters =
    PROMPT_OVERHEAD_CHARACTERS + maxDiffBytes + MAX_FILE_LIST_BYTES;
  return Math.max(
    1,
    Math.ceil(
      Math.min(estimatedCharacters, maximumCharacters) /
        tokenCharacters(agent, model),
    ),
  );
}

function tokenCharacters(agent, model) {
  // Conservative tokenizer-family heuristics for configured or custom models.
  const identity = `${agent ?? ""} ${model ?? ""}`.toLowerCase();
  if (identity.includes("claude")) return 3.5;
  if (identity.includes("deepseek")) return 3.7;
  if (/llama|mistral|qwen/u.test(identity)) return 3.5;
  return 4;
}

function nonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function statusMessage(summary) {
  if (!summary) return "N/A";
  if (summary.status === "failed") {
    return `Summary failed: ${summary.lastError ?? "unknown error"}`;
  }
  if (summary.status === "generating") return "Summary is being generated.";
  return "Summary is waiting to be generated.";
}

/** Read the canonical model served to an interactive viewer. */
export function readViewerSnapshot(config, options = {}) {
  const store = options.store ?? openSummaryStore(config);
  const ownsStore = !options.store;
  let groups;
  let databaseSizeBytes;
  try {
    groups = readEntries(config, { ...options, store })
      .map(({ commit, summary }) => toGroup(summary, commit, config))
      .sort((left, right) => dateValue(left.date) - dateValue(right.date));
    databaseSizeBytes = store.sizeBytes();
  } finally {
    if (ownsStore) store.close();
  }
  const configuredProjects = Object.keys(config.projects);
  const projectNames = new Set(configuredProjects);
  let hasRepositoryChanges = false;
  for (const group of groups) {
    const projects = Array.isArray(group.projects) ? group.projects : [];
    if (projects.length === 0) hasRepositoryChanges = true;
    for (const project of projects) projectNames.add(project);
  }

  return {
    databaseSizeBytes,
    generationLimit:
      Number.isSafeInteger(config.generationLimit) && config.generationLimit > 0
        ? config.generationLimit
        : 50,
    groups,
    projectName: config.projectName,
    projectNames: [
      "All",
      ...projectNames,
      ...(hasRepositoryChanges ? ["Repo"] : []),
    ],
    viewerLimit:
      Number.isSafeInteger(config.viewerLimit) && config.viewerLimit > 0
        ? config.viewerLimit
        : 200,
  };
}

/** Compile private SQLite records into a Git-private, rebuildable viewer cache. */
export function build(config, options = {}) {
  const { databaseSizeBytes, generationLimit, groups, viewerLimit } =
    readViewerSnapshot(config, options);
  const banner = `// GENERATED by ${CLI_NAME} \u2014 do not edit. Rebuild: ${CLI_NAME} build\n`;
  const projects = Object.keys(config.projects);
  const directory = dirname(config.dataFile);
  const temporaryFile = `${config.dataFile}.${process.pid}.${randomUUID()}.tmp`;
  mkdirSync(directory, { recursive: true });
  const output =
    `${banner}window.__WHATIJUSTDID_PROJECT_NAME__ = ${JSON.stringify(config.projectName)};\n` +
    `window.__WHATIJUSTDID_META__ = ${JSON.stringify(
      { databaseSizeBytes, generationLimit, viewerLimit },
      null,
      2,
    )};\n` +
    `window.__WHATIJUSTDID_PROJECTS__ = ${JSON.stringify(projects, null, 2)};\n` +
    `window.__WHATIJUSTDID__ = ${JSON.stringify(groups, null, 2)};\n`;
  try {
    writeFileSync(temporaryFile, output);
    renameSync(temporaryFile, config.dataFile);
  } finally {
    rmSync(temporaryFile, { force: true });
  }
  return groups.length;
}

function dateValue(value) {
  const date = new Date(value).valueOf();
  return Number.isNaN(date) ? 0 : date;
}
