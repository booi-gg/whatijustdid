import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { CHANGE_TYPES } from "./agents/shared.mjs";
import { openSummaryStore } from "./store.mjs";

const EDITABLE_KEYS = ["type", "projects", "changes"];

/** Edit one local canonical summary. No repository file is touched or staged. */
export function editEntry(config, id, dependencies = {}) {
  if (!id) throw new Error("edit requires a commit SHA or unique SHA prefix");
  const store = dependencies.store ?? openSummaryStore(config);
  const ownsStore = !dependencies.store;
  try {
    const entry = store.findByPrefix(id);
    if (entry.status !== "ready") throw new Error(`Summary for ${id} is not ready`);
    const draft = Object.fromEntries(EDITABLE_KEYS.map((key) => [key, entry[key]]));
    const edited = dependencies.edit
      ? dependencies.edit(structuredClone(draft))
      : editWithConfiguredEditor(draft);
    const next = applyEntryEdit(entry, edited);

    if (next === entry) {
      return { changed: false, entry, path: config.dbFile };
    }
    const saved = store.updateSummary(entry.commitSha, next, dependencies.now?.() ?? new Date());
    return { changed: true, entry: saved, path: config.dbFile };
  } finally {
    if (ownsStore) store.close();
  }
}

export function applyEntryEdit(entry, editable) {
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
  };
}

function editWithConfiguredEditor(draft) {
  const directory = mkdtempSync(join(tmpdir(), "changetrail-edit-"));
  const path = join(directory, `${randomUUID()}.json`);
  try {
    writeFileSync(path, `${JSON.stringify(draft, null, 2)}\n`, { mode: 0o600 });
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

function validateEditable(editable) {
  if (!editable || typeof editable !== "object" || Array.isArray(editable)) {
    throw new Error("Edited summary must be a JSON object");
  }
  const unknown = Object.keys(editable).filter((key) => !EDITABLE_KEYS.includes(key));
  if (unknown.length) throw new Error(`Unknown editable fields: ${unknown.join(", ")}`);
  if (!CHANGE_TYPES.includes(editable.type)) throw new Error(`Invalid type "${editable.type}"`);
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
