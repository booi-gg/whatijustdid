import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CLI_NAME, ENV_PREFIX } from "./brand.mjs";
import { gitCommonDir, gitDir, repoRoot } from "./git.mjs";

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));
const defaultConfigPath = join(packageDir, "whatijustdid.json");

/**
 * Resolve shared presentation settings and local AI settings. Summary data is
 * always kept in Git's private common directory, never in the worktree.
 */
export function loadConfig(options = {}) {
  const root = options.root ?? repoRoot();
  const env = options.env ?? process.env;
  const defaults = normalizeLegacyConfig(
    JSON.parse(readFileSync(defaultConfigPath, "utf8")),
  );
  const sharedCandidates = [join(root, "whatijustdid.json")];
  const configPath = sharedCandidates.find(existsSync);
  const shared = configPath
    ? normalizeLegacyConfig(JSON.parse(readFileSync(configPath, "utf8")))
    : {};

  const initial = mergeAgentConfig(defaults, shared);
  const privateDir = join(gitCommonDir(root), CLI_NAME);
  const localCandidates = [join(privateDir, "whatijustdid.local.json")];
  const localConfigPath = localCandidates.find(existsSync);
  const local = localConfigPath
    ? normalizeLegacyConfig(JSON.parse(readFileSync(localConfigPath, "utf8")))
    : {};
  const config = mergeAgentConfig(initial, local);
  const configuredAgent = config.agent ?? "codex";
  const agent = env[`${ENV_PREFIX}_AGENT`] ?? configuredAgent;
  const environmentModel = env[`${ENV_PREFIX}_MODEL`];
  const model =
    environmentModel ??
    (sameAgent(agent, configuredAgent) ? config.model : null);
  const viewerLimit = positiveInteger(config.viewerLimit ?? config.limit, 200);
  const generationLimit = positiveInteger(config.generationLimit, 50);
  const dbFile = resolvePrivateDbFile(
    env[`${ENV_PREFIX}_DB_PATH`],
    root,
    privateDir,
  );
  const legacyDbDir = join(root, CLI_NAME, "db");
  const viewerDir = join(gitDir(root), CLI_NAME);

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
    root,
    privateDir,
    viewerDir,
    dbFile,
    legacyDbDir,
    dbDir: legacyDbDir,
    dataFile: join(viewerDir, "data.js"),
    configPath: configPath ?? defaultConfigPath,
    isDefaultConfig: !configPath,
    localConfigPath: localConfigPath ?? null,
  };
}

function normalizeLegacyConfig(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) return {};
  if (config.provider === "raw" && !config.agent) {
    const {
      provider: _provider,
      model: _model,
      ...withoutRawSelection
    } = config;
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
  return typeof value === "string" && value && value !== "raw"
    ? value
    : undefined;
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

function resolvePrivateDbFile(value, root, privateDir) {
  if (typeof value !== "string" || !value.trim())
    return join(privateDir, "summaries.sqlite");
  return isAbsolute(value) ? normalize(value) : resolve(root, value);
}
