import { readFileSync, existsSync } from "node:fs";
import { dirname, isAbsolute, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { repoRoot } from "./git.mjs";

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));
const defaultConfigPath = join(packageDir, "changetrail.json");

/**
 * Resolve config. Precedence: consumer repo config → package default.
 * Consumer config is looked up at <root>/changetrail.json.
 * Earlier config names remain supported for existing repositories.
 */
export function loadConfig(options = {}) {
  const root = options.root ?? repoRoot();
  const defaults = JSON.parse(readFileSync(defaultConfigPath, "utf8"));
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
  const shared = configPath ? JSON.parse(readFileSync(configPath, "utf8")) : {};

  const initial = { ...defaults, ...shared };
  const configuredDir = initial.dir ?? "changetrail";
  const localCandidates = [
    join(root, configuredDir, "changetrail.local.json"),
    join(root, "changetrail.local.json"),
    join(root, configuredDir, "changelog.local.json"),
    join(root, "changelog.local.json"),
  ];
  const localConfigPath = localCandidates.find(existsSync);
  const local = localConfigPath ? JSON.parse(readFileSync(localConfigPath, "utf8")) : {};
  const config = {
    ...initial,
    ...local,
    projects: local.projects ?? shared.projects ?? defaults.projects ?? {},
  };
  const dir = repositoryDirectory(
    process.env.CHANGELOG_DIR ?? config.dir ?? configuredDir,
  );

  return {
    provider: process.env.CHANGELOG_PROVIDER ?? config.provider ?? "raw",
    model: process.env.CHANGELOG_MODEL ?? config.model ?? null,
    limit: positiveInteger(config.limit, 200),
    maxDiffBytes: positiveInteger(config.maxDiffBytes, 80_000),
    timeoutMs: positiveInteger(config.timeoutMs, 20_000),
    projects: config.projects ?? {},
    dir,
    root,
    dbDir: join(root, dir, "db"),
    dataFile: join(root, dir, "data.js"),
    configPath: configPath ?? defaultConfigPath,
    isDefaultConfig: !configPath,
    localConfigPath: localConfigPath ?? null,
  };
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
