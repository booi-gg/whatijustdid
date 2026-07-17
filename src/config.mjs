import { readFileSync, existsSync } from "node:fs";
import { dirname, isAbsolute, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { gitCommonDir, repoRoot } from "./git.mjs";

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));
const defaultConfigPath = join(packageDir, "changetrail.json");

/**
 * Resolve shared presentation settings and local AI settings. Summary data is
 * always kept in Git's private common directory, never in the worktree.
 */
export function loadConfig(options = {}) {
  const root = options.root ?? repoRoot();
  const env = options.env ?? process.env;
  const defaults = normalizeLegacyConfig(JSON.parse(readFileSync(defaultConfigPath, "utf8")));
  const sharedCandidates = [
    join(root, "changetrail.json"),
    join(root, "changetrail", "config.json"),
    join(root, "changelog", "changetrail.json"),
    join(root, "ctrail", "config.json"),
    join(root, "changelog", "ctrail.json"),
    join(root, "ctrail.json"),
    join(root, "changelog", "changelog.json"),
    join(root, "changelog.json"),
  ];
  const configPath = sharedCandidates.find(existsSync);
  const shared = configPath
    ? normalizeLegacyConfig(JSON.parse(readFileSync(configPath, "utf8")))
    : {};

  const initial = mergeAgentConfig(defaults, shared);
  const configuredDir = initial.dir ?? "changetrail";
  const localCandidates = [
    join(root, configuredDir, "changetrail.local.json"),
    join(root, "changetrail.local.json"),
    join(root, configuredDir, "changelog.local.json"),
    join(root, "changelog.local.json"),
  ];
  const localConfigPath = localCandidates.find(existsSync);
  const local = localConfigPath
    ? normalizeLegacyConfig(JSON.parse(readFileSync(localConfigPath, "utf8")))
    : {};
  const config = mergeAgentConfig(initial, local);
  const dir = repositoryDirectory(env.CHANGETRAIL_DIR ?? env.CHANGELOG_DIR ?? config.dir ?? configuredDir);
  const configuredAgent = config.agent ?? "codex";
  const agent =
    env.CHANGETRAIL_AGENT ??
    env.CHANGELOG_AGENT ??
    legacyAgent(env.CHANGELOG_PROVIDER) ??
    configuredAgent;
  const environmentModel = env.CHANGETRAIL_MODEL ?? env.CHANGELOG_MODEL;
  const model = environmentModel ?? (sameAgent(agent, configuredAgent) ? config.model : null);
  const viewerLimit = positiveInteger(config.viewerLimit ?? config.limit, 200);
  const generationLimit = positiveInteger(config.generationLimit, 50);
  const privateDir = join(gitCommonDir(root), "changetrail");
  const dbFile = resolvePrivateDbFile(
    env.CHANGETRAIL_DB_PATH ?? env.CHANGELOG_DB_PATH,
    root,
    privateDir,
  );
  const legacyDbDir = join(root, dir, "db");

  return {
    agent,
    model: model ?? null,
    viewerLimit,
    generationLimit,
    // Kept as a read-only compatibility alias for older API consumers.
    limit: viewerLimit,
    maxDiffBytes: positiveInteger(config.maxDiffBytes, 80_000),
    timeoutMs: positiveInteger(config.timeoutMs, 20_000),
    projects: config.projects ?? {},
    dir,
    root,
    privateDir,
    dbFile,
    legacyDbDir,
    dbDir: legacyDbDir,
    dataFile: join(root, dir, "data.js"),
    configPath: configPath ?? defaultConfigPath,
    isDefaultConfig: !configPath,
    localConfigPath: localConfigPath ?? null,
  };
}

function normalizeLegacyConfig(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) return {};
  if (config.provider === "raw" && !config.agent) {
    const { provider: _provider, model: _model, ...withoutRawSelection } = config;
    return withoutRawSelection;
  }
  if (config.agent || !legacyAgent(config.provider)) return config;
  return { ...config, agent: config.provider };
}

function mergeAgentConfig(base, override) {
  const merged = { ...base, ...override };
  if (
    Object.hasOwn(override, "agent") &&
    !Object.hasOwn(override, "model") &&
    !sameAgent(override.agent, base.agent)
  ) {
    merged.model = null;
  }
  return merged;
}

/** Preserve old AI selections while permanently retiring the raw mode. */
function legacyAgent(value) {
  return typeof value === "string" && value && value !== "raw" ? value : undefined;
}

function sameAgent(left, right) {
  return agentFamily(left) === agentFamily(right);
}

function agentFamily(agent) {
  return agent === "codex" || agent === "openai" ? "openai" : agent;
}

function positiveInteger(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function repositoryDirectory(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Changelog dir must be a non-empty repository-relative path");
  }
  const dir = normalize(value.trim());
  if (isAbsolute(dir) || dir === ".." || dir.startsWith(`..${sep}`)) {
    throw new Error(`Changelog dir must stay inside the repository: ${value}`);
  }
  return dir;
}

function resolvePrivateDbFile(value, root, privateDir) {
  if (typeof value !== "string" || !value.trim()) return join(privateDir, "summaries.sqlite");
  return isAbsolute(value) ? normalize(value) : resolve(root, value);
}
