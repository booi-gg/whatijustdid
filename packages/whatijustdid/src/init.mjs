import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { openSummaryStore } from "./store.mjs";

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));
const defaultConfigPath = join(packageDir, "whatijustdid.json");

/** Scaffold shared config and initialize the clone-private SQLite store. */
export function initializeProject(config, dependencies = {}) {
  const created = [];
  const updated = [];
  const unchanged = [];
  const record = (status, path) =>
    status === "created"
      ? created.push(repositoryPath(config.root, path))
      : status === "updated"
        ? updated.push(repositoryPath(config.root, path))
        : unchanged.push(repositoryPath(config.root, path));

  const configTarget = config.isDefaultConfig
    ? join(config.root, "whatijustdid.json")
    : config.configPath;
  record(copyAsset(defaultConfigPath, configTarget, false), configTarget);

  const store = dependencies.store ?? openSummaryStore(config);
  if (!dependencies.store) store.close();

  return { created, updated, unchanged, dbFile: config.dbFile };
}

function copyAsset(source, target, overwrite) {
  mkdirSync(dirname(target), { recursive: true });
  if (existsSync(target) && !overwrite) return "unchanged";
  const status = existsSync(target) ? "updated" : "created";
  copyFileSync(source, target);
  return status;
}

function repositoryPath(root, path) {
  const value = relative(root, path);
  return sep === "/" ? value : value.split(sep).join("/");
}
