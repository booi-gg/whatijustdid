import { randomUUID } from "node:crypto";
import {
  mkdtempSync,
  lstatSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import {
  commitForAddedPath,
  commitMeta,
  fileAtRevision,
  gitAuthor,
  stageFile,
  toGitPath,
} from "./git.mjs";
import { assertEntryOwner } from "./ownership.mjs";
import { CHANGE_TYPES } from "./providers/shared.mjs";
import { findEntryPath } from "./store.mjs";

const EDITABLE_KEYS = ["type", "projects", "changes"];

export function editEntry(config, id, dependencies = {}) {
  if (!id) throw new Error("edit requires an entry id or unique id prefix");
  const path = findEntryPath(config.dbDir, id);
  if (!lstatSync(path).isFile()) throw new Error(`Changelog row must be a regular file: ${path}`);
  const text = readFileSync(path, "utf8");
  const entry = parseJson(text, path);
  const gitPath = toGitPath(relative(config.root, path));

  const readRevision = dependencies.fileAtRevision ?? fileAtRevision;
  const readCommit = dependencies.commitMeta ?? commitMeta;
  const currentAuthor = dependencies.gitAuthor ?? gitAuthor;
  const stage = dependencies.stageFile ?? stageFile;
  const actor = dependencies.actor ?? currentAuthor(config.root);
  const canonicalText = readRevision(config.root, "HEAD", gitPath);
  const canonical = canonicalText === null ? entry : parseJson(canonicalText, gitPath);
  const sourceCommit = canonical.commit?.sha
    ? readCommit(canonical.commit.sha, config.root)
    : addedCommitForPath(config, gitPath, dependencies);
  assertEntryOwner(canonical, sourceCommit, actor.email, gitPath);

  const draft = Object.fromEntries(EDITABLE_KEYS.map((key) => [key, entry[key]]));
  const edited = dependencies.edit
    ? dependencies.edit(structuredClone(draft))
    : editWithConfiguredEditor(draft);
  const next = applyEntryEdit(canonical, edited, actor, dependencies.now?.() ?? new Date());

  if (JSON.stringify(next) === JSON.stringify(entry)) {
    return { changed: false, entry, path };
  }

  writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`);
  stage(path, config.root);
  return { changed: true, entry: next, path };
}

export function applyEntryEdit(entry, editable, actor, now = new Date()) {
  validateEditable(editable);
  const unchanged = EDITABLE_KEYS.every(
    (key) => JSON.stringify(entry[key]) === JSON.stringify(editable[key]),
  );
  if (unchanged) return entry;

  return {
    ...entry,
    type: editable.type,
    projects: editable.projects,
    changes: editable.changes,
    updatedAt: now.toISOString(),
    updatedBy: { name: actor.name, email: actor.email },
  };
}

function editWithConfiguredEditor(draft) {
  const directory = mkdtempSync(join(tmpdir(), "changelog-edit-"));
  const path = join(directory, `${randomUUID()}.json`);
  try {
    writeFileSync(path, `${JSON.stringify(draft, null, 2)}\n`);
    const editor = process.env.VISUAL ?? process.env.EDITOR ?? "vi";
    const result = spawnSync(`${editor} ${shellQuote(path)}`, {
      shell: true,
      stdio: "inherit",
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Editor exited with status ${result.status}`);
    return parseJson(readFileSync(path, "utf8"), path);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function addedCommitForPath(config, path, dependencies) {
  if (dependencies.commitForAddedPath) {
    return dependencies.commitForAddedPath(config.root, path, "HEAD");
  }
  if (dependencies.commitIndexForDirectory) {
    return dependencies.commitIndexForDirectory(config.root, config.dbDir, "HEAD").get(path) ?? {};
  }
  return commitForAddedPath(config.root, path, "HEAD");
}

function validateEditable(editable) {
  if (!editable || typeof editable !== "object" || Array.isArray(editable)) {
    throw new Error("Edited entry must be a JSON object");
  }
  const unknown = Object.keys(editable).filter((key) => !EDITABLE_KEYS.includes(key));
  if (unknown.length) throw new Error(`Unknown editable fields: ${unknown.join(", ")}`);
  if (!CHANGE_TYPES.includes(editable.type)) {
    throw new Error(`Invalid type "${editable.type}"`);
  }
  if (!Array.isArray(editable.projects) || editable.projects.some((value) => typeof value !== "string")) {
    throw new Error("projects must be an array of strings");
  }
  if (!Array.isArray(editable.changes) || !editable.changes.length) {
    throw new Error("changes must contain at least one item");
  }
  for (const change of editable.changes) {
    if (!change || !CHANGE_TYPES.includes(change.type)) {
      throw new Error("Every change needs a valid type");
    }
    if (typeof change.summary !== "string" || !change.summary.trim()) {
      throw new Error("Every change needs a non-empty summary");
    }
  }
}

function parseJson(text, path) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid JSON in ${path}: ${error.message}`);
  }
}

function shellQuote(value) {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}
