import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  recentShas,
  commitMeta,
  commitFiles,
  commitDiff,
  commitIndexForDirectory,
  gitAuthor,
} from "./git.mjs";
import { projectsForFiles } from "./projects.mjs";
import { describeChange } from "./describe.mjs";
import { readEntries } from "./build.mjs";

const SCHEMA_VERSION = 1;

/**
 * Materialize db/<sha>.json for every recent commit not already stored.
 * Idempotent + backfilling: safe to run on every commit, merge, or startup.
 * One file per commit → unique names → conflict-free merges.
 */
export async function generate(config) {
  mkdirSync(config.dbDir, { recursive: true });
  const creator = gitAuthor(config.root);
  const represented = new Set(
    [...commitIndexForDirectory(config.root, config.dbDir).values()].map((meta) => meta.sha),
  );
  for (const entry of readEntries(config.dbDir)) {
    if (entry.commit?.sha) represented.add(entry.commit.sha);
  }

  let created = 0;
  for (const sha of recentShas(config.limit, config.root)) {
    const file = join(config.dbDir, `${sha}.json`);
    if (represented.has(sha) || existsSync(file)) continue;

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
    writeFileSync(file, JSON.stringify(entry, null, 2) + "\n");
    created++;
  }
  return created;
}
