import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { importLegacyRows } from "../src/legacy.mjs";
import { openSummaryStore } from "../src/store.mjs";

const SHA = "a".repeat(40);

test("persists one compact ready summary and coordinates concurrent writers", () => {
  const root = mkdtempSync(join(tmpdir(), "fessup-store-"));
  const dbFile = join(root, "private", "summaries.sqlite");
  const first = openSummaryStore(dbFile);
  const second = openSummaryStore(dbFile);
  try {
    const lease = first.claim(SHA, {
      projects: ["web"],
      agent: "codex",
      model: null,
    });
    assert.equal(typeof lease, "string");
    assert.equal(
      second.claim(SHA, { projects: ["web"], agent: "codex" }),
      null,
    );

    first.complete(SHA, lease, {
      type: "feat",
      changes: [{ type: "feat", summary: "Added the committed feature" }],
      agent: "codex",
      model: "gpt-test",
    });
    assert.equal(
      second.getBySha(SHA).changes[0].summary,
      "Added the committed feature",
    );
    assert.equal(second.getBySha(SHA).model, "gpt-test");
    assert.equal(second.claim(SHA, { projects: [], agent: "codex" }), null);

    const columns = first.database
      .prepare("PRAGMA table_info(commit_summaries)")
      .all()
      .map((column) => column.name);
    assert.equal(columns.includes("diff"), false);
    assert.equal(columns.includes("subject"), false);
    assert.equal(statSync(dbFile).mode & 0o777, 0o600);
  } finally {
    first.close();
    second.close();
  }

  const reopened = openSummaryStore(dbFile);
  try {
    assert.equal(reopened.getBySha(SHA).status, "ready");
  } finally {
    reopened.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("failed and expired generations are resumable", () => {
  const root = mkdtempSync(join(tmpdir(), "fessup-lease-"));
  const store = openSummaryStore(join(root, "summaries.sqlite"));
  try {
    const start = new Date("2026-07-17T00:00:00.000Z");
    const first = store.claim(SHA, {
      now: start,
      leaseMs: 100,
      projects: [],
      agent: "codex",
    });
    assert.equal(
      store.claim(SHA, {
        now: new Date(start.valueOf() + 50),
        leaseMs: 100,
        projects: [],
        agent: "codex",
      }),
      null,
    );
    const replacement = store.claim(SHA, {
      now: new Date(start.valueOf() + 101),
      leaseMs: 100,
      projects: [],
      agent: "codex",
    });
    assert.notEqual(replacement, first);
    assert.equal(
      store.fail(SHA, replacement, new Error("agent unavailable")),
      true,
    );
    assert.equal(store.getBySha(SHA).status, "failed");
    assert.match(store.getBySha(SHA).lastError, /agent unavailable/);
    assert.equal(
      typeof store.claim(SHA, { projects: [], agent: "codex" }),
      "string",
    );
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects malformed JSON if the database is externally corrupted", () => {
  const root = mkdtempSync(join(tmpdir(), "fessup-corrupt-"));
  const store = openSummaryStore(join(root, "summaries.sqlite"));
  try {
    store.ensurePending(SHA, []);
    store.database
      .prepare(
        "UPDATE commit_summaries SET projects_json = 'not-json' WHERE commit_sha = ?",
      )
      .run(SHA);
    assert.throws(() => store.getBySha(SHA), /Corrupt summary data/);
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("imports legacy AI rows but leaves raw rows pending", () => {
  const root = mkdtempSync(join(tmpdir(), "fessup-legacy-"));
  const legacyDbDir = join(root, "fessup", "db");
  const store = openSummaryStore(
    join(root, ".git", "fessup", "summaries.sqlite"),
  );
  const rawSha = "b".repeat(40);
  try {
    mkdirSync(legacyDbDir, { recursive: true });
    writeFileSync(
      join(legacyDbDir, "ai.json"),
      JSON.stringify({
        id: "legacy-ai-fingerprint",
        type: "feat",
        projects: ["web"],
        changes: [{ type: "feat", summary: "Imported generated summary" }],
        agent: "codex",
        model: "gpt-test",
      }),
    );
    writeFileSync(
      join(legacyDbDir, "raw.json"),
      JSON.stringify({
        id: "legacy-raw-fingerprint",
        type: "other",
        projects: [],
        changes: [],
        provider: "raw",
      }),
    );
    const index = new Map([
      ["fessup/db/ai.json", { sha: SHA }],
      ["fessup/db/raw.json", { sha: rawSha }],
    ]);
    const config = { root, legacyDbDir, dbFile: store.dbFile };
    const result = importLegacyRows(config, {
      store,
      commitIndexForDirectory: () => index,
      commitMeta: (sha) => ({ sha }),
    });
    assert.deepEqual(
      {
        scanned: result.scanned,
        imported: result.imported,
        pending: result.pending,
        skipped: result.skipped,
      },
      { scanned: 2, imported: 1, pending: 1, skipped: 0 },
    );
    assert.equal(
      store.getBySha(SHA).changes[0].summary,
      "Imported generated summary",
    );
    assert.equal(store.getBySha(rawSha).status, "pending");
    assert.equal(importLegacyRows(config, { store }).alreadyImported, true);
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});
