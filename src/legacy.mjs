import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { commitIndexForDirectory, commitMeta, toGitPath } from "./git.mjs";
import { openSummaryStore, PROMPT_VERSION } from "./store.mjs";

const MIGRATION_KEY = "legacy_json_import_v1";

/** Import tracked JSON-era summaries once, without staging or deleting them. */
export function importLegacyRows(config, dependencies = {}, options = {}) {
  const store = dependencies.store ?? openSummaryStore(config);
  const ownsStore = !dependencies.store;
  try {
    if (store.metadata(MIGRATION_KEY) && options.force !== true) {
      return { alreadyImported: true, scanned: 0, imported: 0, pending: 0, skipped: 0 };
    }
    const files = listJsonFiles(config.legacyDbDir);
    const index = files.length
      ? (dependencies.commitIndexForDirectory ?? commitIndexForDirectory)(
          config.root,
          config.legacyDbDir,
          "HEAD",
        )
      : new Map();
    let imported = 0;
    let pending = 0;
    let skipped = 0;

    for (const path of files) {
      const entry = parseRow(path);
      const gitPath = toGitPath(relative(config.root, path));
      const sha = resolveCommitSha(entry, index.get(gitPath), config, dependencies);
      if (!sha) {
        skipped++;
        continue;
      }
      const projects = Array.isArray(entry.projects) ? entry.projects : [];
      const agent = entry.agent ?? entry.provider;
      const hasAiSummary =
        agent &&
        agent !== "raw" &&
        Array.isArray(entry.changes) &&
        entry.changes.some((change) => typeof change?.summary === "string" && change.summary.trim());
      if (!hasAiSummary) {
        store.ensurePending(sha, projects);
        pending++;
        continue;
      }
      const before = store.getBySha(sha);
      store.importReady(sha, {
        type: entry.type ?? entry.changes[0]?.type ?? "other",
        projects,
        changes: entry.changes,
        agent,
        model: entry.model ?? null,
        promptVersion: PROMPT_VERSION,
        generatedAt: entry.updatedAt ?? entry.createdAt,
      });
      if (!before) imported++;
    }
    store.setMetadata(MIGRATION_KEY, new Date().toISOString());
    return { alreadyImported: false, scanned: files.length, imported, pending, skipped };
  } finally {
    if (ownsStore) store.close();
  }
}

function resolveCommitSha(entry, indexedCommit, config, dependencies) {
  const candidates = [entry.commit?.sha, /^[0-9a-f]{40}$/i.test(entry.id ?? "") ? entry.id : null, indexedCommit?.sha];
  const readCommit = dependencies.commitMeta ?? commitMeta;
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return readCommit(candidate, config.root).sha;
    } catch {
      // Try the next legacy identity source.
    }
  }
  return null;
}

function listJsonFiles(root) {
  if (!existsSync(root)) return [];
  const files = [];
  const pending = [root];
  while (pending.length) {
    const directory = pending.pop();
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, item.name);
      if (item.isDirectory()) pending.push(path);
      else if (item.name.endsWith(".json")) files.push(path);
    }
  }
  return files.sort();
}

function parseRow(path) {
  if (!lstatSync(path).isFile()) throw new Error(`Legacy changelog row is not a file: ${path}`);
  try {
    const entry = JSON.parse(readFileSync(path, "utf8"));
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error("expected a JSON object");
    }
    return entry;
  } catch (error) {
    throw new Error(`Invalid legacy changelog row ${path}: ${error.message}`, { cause: error });
  }
}
