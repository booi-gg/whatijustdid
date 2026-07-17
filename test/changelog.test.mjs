import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import test from "node:test";
import { build } from "../src/build.mjs";
import { parseCommitIndexLog, toGitPath } from "../src/git.mjs";
import { applyEntryEdit, editEntry } from "../src/edit.mjs";
import {
  assertEntryOwner,
  assertStagedOwnership,
  canEditEntry,
  verifyOwnershipRange,
} from "../src/ownership.mjs";
import { projectsForFiles } from "../src/projects.mjs";
import { bulletLines, parseSubject } from "../src/providers/raw.mjs";
import { CHANGELOG_SCHEMA, coerceModelJson } from "../src/providers/shared.mjs";
import {
  entryPathForId,
  findEntryPath,
  readEntryRecords,
  writeEntry,
} from "../src/store.mjs";

test("hash-shards new rows and reads legacy flat rows recursively", () => {
  const root = mkdtempSync(join(tmpdir(), "bm-changelog-store-"));
  try {
    const dbDir = join(root, "changelog", "db");
    const id = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
    const path = writeEntry(dbDir, { id, createdAt: "2026-07-17T10:00:00.000Z" });
    mkdirSync(dbDir, { recursive: true });
    writeFileSync(join(dbDir, "legacy-row.json"), JSON.stringify({ id: "legacy-row" }));

    assert.equal(
      toGitPath(relative(dbDir, path)),
      `ab/cd/${id}.json`,
    );
    assert.equal(entryPathForId(dbDir, id), path);
    assert.equal(findEntryPath(dbDir, id.slice(0, 12)), path);
    assert.deepEqual(
      readEntryRecords(dbDir).map(({ entry }) => entry.id).sort(),
      [id, "legacy-row"].sort(),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("parses conventional subjects and body bullets", () => {
  assert.deepEqual(parseSubject("feat(ui): add project tabs"), {
    type: "feat",
    title: "add project tabs",
  });
  assert.deepEqual(bulletLines("context\n- added tabs\n* fixed badges\nnot a bullet"), [
    "added tabs",
    "fixed badges",
  ]);
});

test("maps one commit to every touched project", () => {
  assert.deepEqual(
    projectsForFiles(
      ["apps/main/src/a.ts", "packages/shared/src/b.ts", "README.md"],
      { web: ["apps/main"], shared: ["packages/shared"] },
    ),
    ["web", "shared"],
  );
});

test("normalizes model JSON and rejects unknown types", () => {
  const result = coerceModelJson(
    JSON.stringify({
      type: "made-up",
      changes: [{ type: "fix", summary: " Fixed the retry loop. " }],
    }),
    { type: "other", summary: "fallback" },
  );
  assert.deepEqual(result, {
    type: "fix",
    changes: [{ type: "fix", summary: "Fixed the retry loop." }],
  });
});

test("uses a strict-provider-compatible structured output schema", () => {
  const changes = CHANGELOG_SCHEMA.properties.changes;
  const summary = changes.items.properties.summary;

  assert.equal(changes.minItems, undefined);
  assert.equal(changes.maxItems, undefined);
  assert.equal(summary.minLength, undefined);
  assert.equal(summary.maxLength, undefined);
});

test("maps DB paths to the commits that introduced them", () => {
  const log =
    "\x1efullsha\x1fabc1234\x1fAlice\x1falice@example.com\x1fMerger\x1fmerger@example.com\x1f2026-07-17T10:00:00Z\x1ffeat: tracker\x1f- Added tabs\x1d\n\n" +
    "changelog/db/row-a.json\nchangelog/db/row-b.json\n";
  const index = parseCommitIndexLog(log);
  assert.equal(index.get("changelog/db/row-a.json").shortSha, "abc1234");
  assert.equal(index.get("changelog/db/row-a.json").authorEmail, "alice@example.com");
  assert.equal(index.get("changelog/db/row-a.json").committerEmail, "merger@example.com");
  assert.equal(index.get("changelog/db/row-b.json").body, "- Added tabs");
});

test("allows creator, source author, or source committer to edit", () => {
  const entry = {
    id: "row",
    author: { email: "creator@example.com" },
    commit: { committerEmail: "forged@example.com" },
  };
  const commit = {
    authorEmail: "author@example.com",
    committerEmail: "committer@example.com",
  };

  assert.equal(canEditEntry(entry, commit, "CREATOR@example.com"), true);
  assert.equal(canEditEntry(entry, commit, "author@example.com"), true);
  assert.equal(canEditEntry(entry, commit, "committer@example.com"), true);
  assert.equal(canEditEntry(entry, commit, "forged@example.com"), false);
  assert.equal(canEditEntry(entry, commit, "stranger@example.com"), false);
  assert.throws(
    () => assertEntryOwner(entry, commit, "stranger@example.com", "changelog/db/row.json"),
    /Unauthorized changelog edit/,
  );
});

test("local gate rejects staged edits from non-owners", () => {
  const config = { root: "/repo", dbDir: "/repo/changelog/db" };
  const entry = JSON.stringify({ id: "row", author: { email: "creator@example.com" } });
  const dependencies = {
    stagedModifiedPaths: () => ["changelog/db/row.json"],
    fileAtRevision: () => entry,
    fileAtIndex: () => entry,
    fileModeAtIndex: () => "100644",
    commitIndexForDirectory: () =>
      new Map([["changelog/db/row.json", { authorEmail: "author@example.com" }]]),
    gitAuthor: () => ({ name: "Mallory", email: "mallory@example.com" }),
  };

  assert.throws(() => assertStagedOwnership(config, dependencies), /Unauthorized changelog edit/);
  dependencies.gitAuthor = () => ({ name: "Alice", email: "author@example.com" });
  assert.equal(assertStagedOwnership(config, dependencies), 1);
});

test("range gate checks every modifying commit identity", () => {
  const config = { root: "/repo", dbDir: "/repo/changelog/db" };
  const entry = JSON.stringify({ id: "row", author: { email: "creator@example.com" } });
  const dependencies = {
    mergeBase: () => "common",
    modifiedPathsBetween: () => ["changelog/db/row.json"],
    fileAtRevision: () => entry,
    fileModeAtRevision: () => "100644",
    commitIndexForDirectory: () => new Map(),
    commitActorsBetween: () => [
      { sha: "abc123456", authorEmail: "creator@example.com", committerEmail: "bot@example.com" },
    ],
  };

  assert.deepEqual(
    verifyOwnershipRange(config, { base: "base", head: "head" }, dependencies),
    { checked: 1, mergeBase: "common" },
  );
  dependencies.commitActorsBetween = () => [
    { sha: "bad123456", authorEmail: "mallory@example.com", committerEmail: "bot@example.com" },
  ];
  assert.throws(
    () => verifyOwnershipRange(config, { base: "base", head: "head" }, dependencies),
    /Unauthorized changelog changes/,
  );
});

test("range gate owns rows added and then edited in the same branch", () => {
  const config = { root: "/repo", dbDir: "/repo/changelog/db" };
  const entry = JSON.stringify({ id: "row", author: { email: "creator@example.com" } });
  const dependencies = {
    mergeBase: () => "common",
    modifiedPathsBetween: () => ["changelog/db/row.json"],
    fileAtRevision: (_root, revision) => (revision === "common" ? null : entry),
    fileModeAtRevision: () => "100644",
    commitIndexForDirectory: () => new Map(),
    firstAddedCommitBetween: () => "added123",
    commitMeta: () => ({
      sha: "added123",
      authorEmail: "creator@example.com",
      committerEmail: "creator@example.com",
    }),
    commitActorsBetween: () => [
      { sha: "added123", authorEmail: "creator@example.com", committerEmail: "creator@example.com" },
      { sha: "bad12345", authorEmail: "mallory@example.com", committerEmail: "mallory@example.com" },
    ],
  };

  assert.throws(
    () => verifyOwnershipRange(config, { base: "base", head: "head" }, dependencies),
    /bad1234 authored by mallory@example.com/,
  );
});

test("local gate rejects immutable identity and file-type changes", () => {
  const config = { root: "/repo", dbDir: "/repo/changelog/db" };
  const original = JSON.stringify({ id: "row", author: { email: "creator@example.com" } });
  const forged = JSON.stringify({ id: "row", author: { email: "mallory@example.com" } });
  const dependencies = {
    stagedModifiedPaths: () => ["changelog/db/row.json"],
    fileAtRevision: () => original,
    fileAtIndex: () => forged,
    fileModeAtIndex: () => "100644",
    commitIndexForDirectory: () => new Map(),
    gitAuthor: () => ({ name: "Creator", email: "creator@example.com" }),
  };

  assert.throws(() => assertStagedOwnership(config, dependencies), /Immutable changelog identity/);
  dependencies.fileAtIndex = () => original;
  dependencies.fileModeAtIndex = () => "120000";
  assert.throws(() => assertStagedOwnership(config, dependencies), /must be a regular file/);
});

test("entry edits preserve identity and record editor", () => {
  const entry = {
    id: "row",
    createdAt: "2026-07-17T10:00:00.000Z",
    author: { name: "Alice", email: "alice@example.com" },
    type: "feat",
    projects: ["main"],
    changes: [{ type: "feat", summary: "Old summary" }],
  };
  const edited = applyEntryEdit(
    entry,
    {
      type: "fix",
      projects: ["main", "worker"],
      changes: [{ type: "fix", summary: "Corrected summary" }],
    },
    { name: "Alice", email: "alice@example.com" },
    new Date("2026-07-18T10:00:00.000Z"),
  );

  assert.equal(edited.id, "row");
  assert.deepEqual(edited.author, entry.author);
  assert.equal(edited.updatedAt, "2026-07-18T10:00:00.000Z");
  assert.equal(edited.updatedBy.email, "alice@example.com");
  assert.equal(edited.changes[0].summary, "Corrected summary");
  assert.throws(
    () =>
      applyEntryEdit(
        entry,
        { type: "invalid", projects: [], changes: [] },
        entry.author,
      ),
    /Invalid type/,
  );
});

test("edit command restores canonical identity before writing", () => {
  const root = mkdtempSync(join(tmpdir(), "bm-changelog-edit-command-"));
  try {
    const dbDir = join(root, "changelog", "db");
    const path = join(dbDir, "row.json");
    mkdirSync(dbDir, { recursive: true });
    const canonical = {
      id: "row",
      author: { name: "Alice", email: "alice@example.com" },
      type: "feat",
      projects: ["main"],
      changes: [{ type: "feat", summary: "Original" }],
    };
    writeFileSync(path, JSON.stringify({ ...canonical, author: { email: "forged@example.com" } }));
    let staged = false;

    const result = editEntry(
      { root, dbDir },
      "row",
      {
        fileAtRevision: () => JSON.stringify(canonical),
        commitIndexForDirectory: () => new Map(),
        actor: canonical.author,
        edit: (draft) => ({
          ...draft,
          changes: [{ type: "fix", summary: "Corrected" }],
          type: "fix",
        }),
        now: () => new Date("2026-07-18T10:00:00.000Z"),
        stageFile: () => { staged = true; },
      },
    );

    const saved = JSON.parse(readFileSync(path, "utf8"));
    assert.equal(result.changed, true);
    assert.equal(staged, true);
    assert.deepEqual(saved.author, canonical.author);
    assert.equal(saved.changes[0].summary, "Corrected");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("build emits configured projects and gives human commit bullets precedence", () => {
  const root = mkdtempSync(join(tmpdir(), "bm-changelog-"));
  try {
    const dbDir = join(root, "changelog", "db");
    const dataFile = join(root, "changelog", "changelog.data.js");
    mkdirSync(dbDir, { recursive: true });
    writeFileSync(
      join(dbDir, "row.json"),
      JSON.stringify({
        schemaVersion: 1,
        id: "row-id",
        createdAt: "2026-07-17T10:00:00.000Z",
        projects: ["web"],
        type: "feat",
        changes: [{ type: "feat", summary: "AI summary" }],
        commit: {
          shortSha: "abc1234",
          author: "Alice",
          date: "2026-07-17T10:00:00.000Z",
          subject: "feat: release tracker",
          body: "- Added project tabs\n- Fixed project badges",
        },
      }),
    );

    assert.equal(
      build(
        { root, dbDir, dataFile, projects: { web: ["apps/main"], worker: ["apps/worker"] } },
        { commitIndex: new Map() },
      ),
      1,
    );
    const output = readFileSync(dataFile, "utf8");
    assert.match(output, /window\.__CHANGELOG_PROJECTS__ = \[\s+"web",\s+"worker"/);
    assert.match(output, /Added project tabs/);
    assert.match(output, /Fixed project badges/);
    assert.doesNotMatch(output, /AI summary/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("bounded builds read only recent indexed rows", () => {
  const root = mkdtempSync(join(tmpdir(), "bm-changelog-bounded-build-"));
  try {
    const dbDir = join(root, "changelog", "db");
    const dataFile = join(root, "changelog", "changelog.data.js");
    const commitIndex = new Map();
    const rows = [
      ["1111111111111111111111111111111111111111", "2026-07-16T10:00:00.000Z", "Older selected"],
      ["2222222222222222222222222222222222222222", "2026-07-17T10:00:00.000Z", "Newest selected"],
    ];
    for (const [id, date, summary] of rows) {
      const path = writeEntry(dbDir, {
        id,
        createdAt: date,
        type: "feat",
        projects: [],
        changes: [{ type: "feat", summary }],
      });
      commitIndex.set(toGitPath(relative(root, path)), {
        shortSha: id.slice(0, 7),
        author: "Alice",
        date,
        subject: `feat: ${summary}`,
      });
    }
    // A malformed historical row proves the bounded path does not scan the DB tail.
    writeFileSync(join(dbDir, "historical-invalid.json"), "not json\n");

    assert.equal(
      build(
        { root, dbDir, dataFile, limit: 2, projects: {} },
        { commitIndex },
      ),
      2,
    );
    const output = readFileSync(dataFile, "utf8");
    assert.match(output, /Older selected/);
    assert.match(output, /Newest selected/);
    assert.doesNotMatch(output, /historical-invalid/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an authorized edit overrides original commit-body bullets", () => {
  const root = mkdtempSync(join(tmpdir(), "bm-changelog-edit-"));
  try {
    const dbDir = join(root, "changelog", "db");
    const dataFile = join(root, "changelog", "changelog.data.js");
    mkdirSync(dbDir, { recursive: true });
    writeFileSync(
      join(dbDir, "row.json"),
      JSON.stringify({
        id: "row",
        createdAt: "2026-07-17T10:00:00.000Z",
        updatedAt: "2026-07-18T10:00:00.000Z",
        projects: ["main"],
        type: "fix",
        changes: [{ type: "fix", summary: "Corrected description" }],
        commit: {
          shortSha: "abc1234",
          author: "Alice",
          date: "2026-07-17T10:00:00.000Z",
          subject: "feat: tracker",
          body: "- Original description",
        },
      }),
    );

    build(
      { root, dbDir, dataFile, projects: { main: ["apps/main"] } },
      { commitIndex: new Map() },
    );
    const output = readFileSync(dataFile, "utf8");
    assert.match(output, /Corrected description/);
    assert.doesNotMatch(output, /Original description/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
