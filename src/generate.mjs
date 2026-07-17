import {
  recentShas,
  commitMeta,
  commitFiles,
  commitDiff,
  commitIndexForDirectory,
  gitAuthor,
  stageFile,
} from "./git.mjs";
import { projectsForFiles } from "./projects.mjs";
import { describeChange } from "./describe.mjs";
import { existingEntryPath, writeEntry } from "./store.mjs";

const SCHEMA_VERSION = 1;

/**
 * Materialize + stage one hash-sharded row for every recent commit not already
 * stored. Idempotent + backfilling; unique files keep merges conflict-free.
 */
export async function generate(config) {
  const creator = gitAuthor(config.root);
  const represented = new Set(
    [...commitIndexForDirectory(config.root, config.dbDir, "HEAD", config.limit).values()]
      .map((meta) => meta.sha),
  );

  let created = 0;
  for (const sha of recentShas(config.limit, config.root)) {
    if (represented.has(sha) || existingEntryPath(config.dbDir, sha)) continue;

    const meta = commitMeta(sha, config.root);
    const files = commitFiles(sha, config.root);
    const projects = projectsForFiles(files, config.projects);
    const result = await describeChange(
      { ...meta, files, diff: commitDiff(sha, config.maxDiffBytes, config.root) },
      config,
    );

    const entry = {
      schemaVersion: SCHEMA_VERSION,
      id: meta.sha,
      createdAt: meta.date,
      commit: {
        sha: meta.sha,
        shortSha: meta.shortSha,
        author: meta.author,
        authorEmail: meta.authorEmail,
        committer: meta.committer,
        committerEmail: meta.committerEmail,
        date: meta.date,
        subject: meta.subject,
      },
      type: result.type ?? "other",
      author: creator,
      projects,
      changes: result.changes,
      provider: result.provider,
      model: result.provider === "raw" ? null : config.model,
    };
    const path = writeEntry(config.dbDir, entry);
    stageFile(path, config.root);
    created++;
  }
  return created;
}
