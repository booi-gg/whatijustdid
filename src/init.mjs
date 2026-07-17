import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { openSummaryStore } from "./store.mjs";

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));
const defaultConfigPath = join(packageDir, "changetrail.json");
const MARKER = "# >>> changetrail >>>";
const END_MARKER = "# <<< changetrail <<<";
const BLOCK = /\n?# >>> (?:@bm\/changelog|cvl|ctrial|ctrail|changetrail) >>>[\s\S]*?# <<< (?:@bm\/changelog|cvl|ctrial|ctrail|changetrail) <<<(?:\n|$)/g;

/** Scaffold shared config and initialize the clone-private SQLite store. */
export function initializeProject(config, dependencies = {}) {
  const created = [];
  const updated = [];
  const unchanged = [];
  const record = (status, path) => status === "created"
    ? created.push(repositoryPath(config.root, path))
    : status === "updated"
      ? updated.push(repositoryPath(config.root, path))
      : unchanged.push(repositoryPath(config.root, path));

  const configTarget = config.isDefaultConfig
    ? join(config.root, "changetrail.json")
    : config.configPath;
  record(copyAsset(defaultConfigPath, configTarget, false), configTarget);

  const ignoreTarget = join(config.root, ".gitignore");
  record(updateGitignore(ignoreTarget, config.root, config.dir), ignoreTarget);

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

function updateGitignore(path, root, dir) {
  const current = existsSync(path) ? readFileSync(path, "utf8") : "";
  const gitDir = repositoryPath(root, join(root, dir)).replace(/^\.$/, "");
  const prefix = gitDir ? `/${escapeGitignore(gitDir)}/` : "/";
  const block = [
    MARKER,
    `${prefix}data.js`,
    `${prefix}changetrail.html`,
    `${prefix}changetrail.local.json`,
    `${prefix}db/`,
    END_MARKER,
  ].join("\n");
  const withoutBlock = current.replace(BLOCK, "\n").trimEnd();
  const next = `${withoutBlock}${withoutBlock ? "\n\n" : ""}${block}\n`;
  if (next === current) return "unchanged";
  writeFileSync(path, next);
  return existsSync(path) && current ? "updated" : "created";
}

function repositoryPath(root, path) {
  const value = relative(root, path);
  return sep === "/" ? value : value.split(sep).join("/");
}

function escapeGitignore(value) {
  return value.replace(/([\\[\]*?!# ])/g, "\\$1");
}
