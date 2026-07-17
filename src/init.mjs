import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));
const defaultConfigPath = join(packageDir, "changetrail.json");
const viewerTemplatePath = join(packageDir, "assets", "changetrail.html");
const MARKER = "# >>> changetrail >>>";
const END_MARKER = "# <<< changetrail <<<";
const BLOCK = /\n?# >>> (?:@bm\/changelog|cvl|ctrial|ctrail|changetrail) >>>[\s\S]*?# <<< (?:@bm\/changelog|cvl|ctrial|ctrail|changetrail) <<<(?:\n|$)/g;

/** Scaffold the tracked consumer files without replacing user-owned config. */
export function initializeProject(config, options = {}) {
  const force = options.force === true;
  const created = [];
  const updated = [];
  const unchanged = [];
  const record = (status, path) => status === "created"
    ? created.push(repositoryPath(config.root, path))
    : status === "updated"
      ? updated.push(repositoryPath(config.root, path))
      : unchanged.push(repositoryPath(config.root, path));

  mkdirSync(config.dbDir, { recursive: true });

  const configTarget = config.isDefaultConfig
    ? join(config.root, "changetrail.json")
    : config.configPath;
  record(copyAsset(defaultConfigPath, configTarget, false), configTarget);

  const viewerTarget = join(config.root, config.dir, "changetrail.html");
  record(copyAsset(viewerTemplatePath, viewerTarget, force), viewerTarget);

  const keepTarget = join(config.dbDir, ".gitkeep");
  record(writeText(keepTarget, "", false), keepTarget);

  const ignoreTarget = join(config.root, ".gitignore");
  record(updateGitignore(ignoreTarget, config.root, config.dir), ignoreTarget);

  return { created, updated, unchanged };
}

function copyAsset(source, target, overwrite) {
  mkdirSync(dirname(target), { recursive: true });
  if (existsSync(target) && !overwrite) return "unchanged";
  const status = existsSync(target) ? "updated" : "created";
  copyFileSync(source, target);
  return status;
}

function writeText(target, content, overwrite) {
  mkdirSync(dirname(target), { recursive: true });
  if (existsSync(target) && !overwrite) return "unchanged";
  const status = existsSync(target) ? "updated" : "created";
  writeFileSync(target, content);
  return status;
}

function updateGitignore(path, root, dir) {
  const current = existsSync(path) ? readFileSync(path, "utf8") : "";
  const gitDir = repositoryPath(root, join(root, dir)).replace(/^\.$/, "");
  const prefix = gitDir ? `/${escapeGitignore(gitDir)}/` : "/";
  const block = [
    MARKER,
    `${prefix}data.js`,
    `${prefix}changetrail.local.json`,
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
