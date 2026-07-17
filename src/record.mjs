import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
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

const SCHEMA_VERSION = 1;

/** Create + stage one merge-safe row while Git is still building the commit. */
export async function recordStagedChange(config) {
  assertStagedOwnership(config);
  const dbPath = directoryPrefix(config.root, config.dbDir);
  const dataPath = toGitPath(relative(config.root, config.dataFile));
  const files = stagedFiles(config.root).filter(
    (file) => !file.startsWith(dbPath) && file !== dataPath,
  );

  // Amend/message-only commit, or an internal DB-only commit: nothing new.
  if (!files.length) return { created: false, entry: null };

  mkdirSync(config.dbDir, { recursive: true });
  const author = gitAuthor(config.root);
  const fingerprint = createHash("sha256")
    .update(currentHead(config.root))
    .update("\0")
    .update(author.email)
    .update("\0")
    .update(stagedIdentity(files, config.root))
    .digest("hex");

  const existing = findFingerprint(config.dbDir, fingerprint);
  if (existing) {
    stageFile(existing.path, config.root);
    return { created: false, entry: existing.entry };
  }

  const diff = stagedDiff(files, config.maxDiffBytes, config.root);
  const description = await describeChange({ files, diff, subject: "", body: "" }, config);
  const createdAt = new Date().toISOString();
  const id = `${createdAt.replace(/[-:.TZ]/g, "").slice(0, 14)}-${randomUUID()}`;
  const entry = {
    schemaVersion: SCHEMA_VERSION,
    id,
    createdAt,
    author,
    projects: projectsForFiles(files, config.projects),
    type: description.type,
    changes: description.changes,
    provider: description.provider,
    model: description.provider === "raw" ? null : config.model,
    sourceFingerprint: fingerprint,
  };
  const path = join(config.dbDir, `${id}.json`);
  writeFileSync(path, `${JSON.stringify(entry, null, 2)}\n`, { flag: "wx" });
  stageFile(path, config.root);
  return { created: true, entry };
}

function directoryPrefix(root, directory) {
  const path = toGitPath(relative(root, directory)).replace(/\/+$/, "");
  return `${path}/`;
}

function findFingerprint(dbDir, fingerprint) {
  if (!existsSync(dbDir)) return null;
  for (const file of readdirSync(dbDir)) {
    if (!file.endsWith(".json")) continue;
    const path = join(dbDir, file);
    if (!lstatSync(path).isFile()) continue;
    try {
      const entry = JSON.parse(readFileSync(path, "utf8"));
      if (entry.sourceFingerprint === fingerprint) return { path, entry };
    } catch {
      // Build reports malformed rows with their filename; do not hide it here.
    }
  }
  return null;
}
