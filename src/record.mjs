import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describeChange } from "./describe.mjs";
import {
  currentHead,
  gitAuthor,
  stageFile,
  stagedDiff,
  stagedFiles,
  stagedIdentity,
  toGitPath,
} from "./git.mjs";
import { projectsForFiles } from "./projects.mjs";
import { assertStagedOwnership } from "./ownership.mjs";
import { existingEntryPath, writeEntry } from "./store.mjs";

const SCHEMA_VERSION = 1;

/** Create + stage one merge-safe row while Git is still building the commit. */
export async function recordStagedChange(config) {
  assertStagedOwnership(config);
  const dbPath = directoryPrefix(config.root, config.dbDir);
  const dataPath = toGitPath(relative(config.root, config.dataFile));
  const staged = stagedFiles(config.root);
  const files = staged.filter(
    (file) => !file.startsWith(dbPath) && file !== dataPath,
  );

  // Amend/message-only commit, or an internal DB-only commit: nothing new.
  if (!files.length) return { created: false, entry: null };

  const author = gitAuthor(config.root);
  const fingerprint = createHash("sha256")
    .update(currentHead(config.root))
    .update("\0")
    .update(author.email)
    .update("\0")
    .update(stagedIdentity(files, config.root))
    .digest("hex");

  // New rows use the fingerprint as their ID, so repeat pre-commit attempts
  // are a constant-time lookup. Check only already-staged DB rows as a bridge
  // for rows created by older package versions.
  const exact = existingEntryPath(config.dbDir, fingerprint);
  const existing = exact
    ? readExisting(exact)
    : findStagedFingerprint(config.root, staged.filter((file) => file.startsWith(dbPath)), fingerprint);
  if (existing) {
    stageFile(existing.path, config.root);
    return { created: false, entry: existing.entry };
  }

  const diff = stagedDiff(files, config.maxDiffBytes, config.root);
  const description = await describeChange({ files, diff, subject: "", body: "" }, config);
  const createdAt = new Date().toISOString();
  const entry = {
    schemaVersion: SCHEMA_VERSION,
    id: fingerprint,
    createdAt,
    author,
    projects: projectsForFiles(files, config.projects),
    type: description.type,
    changes: description.changes,
    provider: description.provider,
    model: description.provider === "raw" ? null : config.model,
    sourceFingerprint: fingerprint,
  };
  const path = writeEntry(config.dbDir, entry, { exclusive: true });
  stageFile(path, config.root);
  return { created: true, entry };
}

function directoryPrefix(root, directory) {
  const path = toGitPath(relative(root, directory)).replace(/\/+$/, "");
  return `${path}/`;
}

function findStagedFingerprint(root, files, fingerprint) {
  for (const file of files) {
    const existing = readExisting(join(root, file), false);
    if (existing?.entry.sourceFingerprint === fingerprint) return existing;
  }
  return null;
}

function readExisting(path, strict = true) {
  try {
    if (!lstatSync(path).isFile()) {
      if (!strict) return null;
      throw new Error(`Changelog row must be a regular file: ${path}`);
    }
    return { path, entry: JSON.parse(readFileSync(path, "utf8")) };
  } catch (error) {
    if (!strict) return null;
    throw new Error(`Invalid changelog row ${path}: ${error.message}`);
  }
}
