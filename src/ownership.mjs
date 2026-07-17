import {
  commitMeta,
  commitActorsBetween,
  commitIndexForDirectory,
  fileAtIndex,
  fileAtRevision,
  fileModeAtIndex,
  fileModeAtRevision,
  firstAddedCommitBetween,
  gitAuthor,
  mergeBase,
  modifiedPathsBetween,
  stagedModifiedPaths,
} from "./git.mjs";
import { isDeepStrictEqual } from "node:util";

const MUTABLE_FIELDS = new Set(["type", "projects", "changes", "updatedAt", "updatedBy"]);

export function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

/** Creator + source commit author + source commit committer own a row. */
export function ownerEmails(entry, commit = {}) {
  return new Set(
    [
      entry.author?.email,
      commit.authorEmail,
      commit.committerEmail,
    ]
      .map(normalizeEmail)
      .filter(Boolean),
  );
}

export function canEditEntry(entry, commit, actorEmail) {
  const email = normalizeEmail(actorEmail);
  return Boolean(email) && ownerEmails(entry, commit).has(email);
}

export function assertEntryOwner(entry, commit, actorEmail, path = entry.id ?? "entry") {
  const email = normalizeEmail(actorEmail);
  if (canEditEntry(entry, commit, email)) return;

  const owners = [...ownerEmails(entry, commit)];
  const actor = email || "missing git user.email";
  throw new Error(
    `Unauthorized changelog edit: ${path} (${actor}). ` +
      (owners.length ? `Allowed emails: ${owners.join(", ")}` : "No owner email is recorded."),
  );
}

/** Local pre-commit gate. New rows need a matching creator; existing rows are owned. */
export function assertStagedOwnership(config, dependencies = {}) {
  const staged = dependencies.stagedModifiedPaths ?? stagedModifiedPaths;
  const readRevision = dependencies.fileAtRevision ?? fileAtRevision;
  const readIndex = dependencies.fileAtIndex ?? fileAtIndex;
  const indexMode = dependencies.fileModeAtIndex ?? fileModeAtIndex;
  const indexDirectory = dependencies.commitIndexForDirectory ?? commitIndexForDirectory;
  const currentAuthor = dependencies.gitAuthor ?? gitAuthor;

  const paths = staged(config.root, config.dbDir).filter(isRowPath);
  if (!paths.length) return 0;

  const actor = currentAuthor(config.root).email;
  const commitIndex = indexDirectory(config.root, config.dbDir, "HEAD");
  for (const path of paths) {
    const originalText = readRevision(config.root, "HEAD", path);
    const stagedText = readIndex(config.root, path);
    const stagedEntry = stagedText === null ? null : parseRegularEntry(stagedText, indexMode(config.root, path), path);

    if (originalText === null) {
      if (stagedEntry) assertEntryCreator(stagedEntry, actor, path);
      continue;
    }

    const original = parseEntry(originalText, path);
    const commit = entrySourceCommit(
      original,
      config.root,
      dependencies,
      commitIndex.get(path) ?? {},
    );
    assertEntryOwner(original, commit, actor, path);
    if (stagedEntry) assertImmutableFields(original, stagedEntry, path);
  }
  return paths.length;
}

/** PR/CI gate. Every commit touching a row must be by its creator/source owner. */
export function verifyOwnershipRange(config, { base, head }, dependencies = {}) {
  if (!base || !head) throw new Error("verify-ownership requires --base and --head");

  const resolveMergeBase = dependencies.mergeBase ?? mergeBase;
  const changed = dependencies.modifiedPathsBetween ?? modifiedPathsBetween;
  const readRevision = dependencies.fileAtRevision ?? fileAtRevision;
  const revisionMode = dependencies.fileModeAtRevision ?? fileModeAtRevision;
  const indexDirectory = dependencies.commitIndexForDirectory ?? commitIndexForDirectory;
  const actorsBetween = dependencies.commitActorsBetween ?? commitActorsBetween;
  const firstAddition = dependencies.firstAddedCommitBetween ?? firstAddedCommitBetween;
  const readCommit = dependencies.commitMeta ?? commitMeta;

  const common = resolveMergeBase(config.root, base, head);
  const paths = changed(config.root, config.dbDir, common, head).filter(isRowPath);
  const commitIndex = indexDirectory(config.root, config.dbDir, common);
  const failures = [];

  for (const path of paths) {
    try {
      const baseText = readRevision(config.root, common, path);
      let entry;
      let sourceCommit;

      if (baseText === null) {
        const additionSha = firstAddition(config.root, common, head, path);
        if (!additionSha) throw new Error("adding commit could not be established");
        const additionCommit = readCommit(additionSha, config.root);
        const additionText = readRevision(config.root, additionSha, path);
        entry = parseRegularEntry(
          additionText,
          revisionMode(config.root, additionSha, path),
          path,
        );
        assertEntryCreator(entry, [additionCommit.authorEmail, additionCommit.committerEmail], path);
        sourceCommit = entrySourceCommit(entry, config.root, dependencies, additionCommit);
      } else {
        entry = parseEntry(baseText, path);
        sourceCommit = entrySourceCommit(
          entry,
          config.root,
          dependencies,
          commitIndex.get(path) ?? {},
        );
      }

      const finalText = readRevision(config.root, head, path);
      if (finalText !== null) {
        const finalEntry = parseRegularEntry(
          finalText,
          revisionMode(config.root, head, path),
          path,
        );
        assertImmutableFields(entry, finalEntry, path);
      }

      const owners = ownerEmails(entry, sourceCommit);
      const actors = actorsBetween(config.root, common, head, path);
      if (!owners.size || !actors.length) throw new Error("ownership could not be established");

      for (const actor of actors) {
        const author = normalizeEmail(actor.authorEmail);
        const committer = normalizeEmail(actor.committerEmail);
        if (!owners.has(author) && !owners.has(committer)) {
          throw new Error(
            `${actor.sha.slice(0, 7)} authored by ${author || "unknown"}, ` +
              `committed by ${committer || "unknown"}`,
          );
        }
      }
    } catch (error) {
      failures.push(`${path}: ${error.message}`);
    }
  }

  if (failures.length) {
    throw new Error(`Unauthorized changelog changes:\n- ${failures.join("\n- ")}`);
  }
  return { checked: paths.length, mergeBase: common };
}

export function assertImmutableFields(original, current, path = current.id ?? "entry") {
  const immutable = (entry) =>
    Object.fromEntries(Object.entries(entry).filter(([key]) => !MUTABLE_FIELDS.has(key)));
  if (!isDeepStrictEqual(immutable(original), immutable(current))) {
    throw new Error(`Immutable changelog identity changed: ${path}`);
  }
}

function assertEntryCreator(entry, actorEmails, path) {
  const creator = normalizeEmail(entry.author?.email);
  const actors = (Array.isArray(actorEmails) ? actorEmails : [actorEmails])
    .map(normalizeEmail)
    .filter(Boolean);
  if (!creator || !actors.includes(creator)) {
    throw new Error(
      `Changelog row creator must match its adding commit: ${path} (${creator || "missing author.email"})`,
    );
  }
}

function entrySourceCommit(entry, root, dependencies, fallback = {}) {
  if (!entry.commit?.sha) return fallback;
  const readCommit = dependencies.commitMeta ?? commitMeta;
  return readCommit(entry.commit.sha, root);
}

function parseRegularEntry(text, mode, path) {
  if (!mode?.startsWith("100")) {
    throw new Error(`Changelog row must be a regular file: ${path}`);
  }
  const entry = parseEntry(text, path);
  const filename = path.split("/").at(-1);
  if (!entry.id || filename !== `${entry.id}.json`) {
    throw new Error(`Changelog row id must match its filename: ${path}`);
  }
  return entry;
}

function parseEntry(text, path) {
  let entry;
  try {
    entry = JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid changelog row ${path}: ${error.message}`);
  }
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error(`Invalid changelog row ${path}: expected a JSON object`);
  }
  return entry;
}

function isRowPath(path) {
  return path.endsWith(".json");
}
