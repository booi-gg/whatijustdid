import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chooseProjectName } from "./project-name.mjs";
import { openSummaryStore } from "./store.mjs";

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));
const defaultConfigPath = join(packageDir, "whatijustdid.json");

/** Scaffold shared config and initialize the clone-private SQLite store. */
export async function initializeProject(config, dependencies = {}) {
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
  let projectNameSource = null;
  if (existsSync(configTarget)) {
    record("unchanged", configTarget);
  } else {
    const generated = await chooseProjectName(config, dependencies);
    writeInitialConfig(configTarget, generated.name);
    config.projectName = generated.name;
    projectNameSource = generated.source;
    record("created", configTarget);
  }

  const store = dependencies.store ?? openSummaryStore(config);
  if (!dependencies.store) store.close();

  return {
    created,
    updated,
    unchanged,
    dbFile: config.dbFile,
    projectName: config.projectName,
    projectNameSource,
  };
}

function writeInitialConfig(target, projectName) {
  mkdirSync(dirname(target), { recursive: true });
  const defaults = JSON.parse(readFileSync(defaultConfigPath, "utf8"));
  writeFileSync(
    target,
    `${JSON.stringify({ ...defaults, projectName }, null, 2)}\n`,
  );
}

function repositoryPath(root, path) {
  const value = relative(root, path);
  return sep === "/" ? value : value.split(sep).join("/");
}
