import { randomUUID } from "node:crypto";
import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { TITLE_NAME } from "./brand.mjs";

// Node 22.13+ exposes node:sqlite without a flag, while some supported Node
// releases still emit a process-wide experimental notice on first import.
// Suppress only that known notice; all other runtime warnings keep flowing.
const originalEmitWarning = process.emitWarning;
process.emitWarning = function emitWarning(warning, ...args) {
  const message = warning instanceof Error ? warning.message : String(warning);
  if (message === "SQLite is an experimental feature and might change at any time") return;
  return originalEmitWarning.call(process, warning, ...args);
};
let DatabaseSync;
try {
  ({ DatabaseSync } = await import("node:sqlite"));
  await new Promise((resolve) => setImmediate(resolve));
} finally {
  process.emitWarning = originalEmitWarning;
}

export const STORE_SCHEMA_VERSION = 2;
export const PROMPT_VERSION = 1;
const LEASE_MS = 5 * 60 * 1000;

/**
 * Compact, clone-private summary storage. Git remains the source of commit
 * metadata; SQLite stores only generation state and the expensive AI result.
 */
export class LocalSummaryStore {
  constructor(dbFile) {
    const directory = dirname(dbFile);
    const directoryExisted = existsSync(directory);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    if (!directoryExisted) chmodSync(directory, 0o700);
    this.dbFile = dbFile;
    this.database = new DatabaseSync(dbFile);
    this.database.exec("PRAGMA journal_mode = WAL");
    this.database.exec("PRAGMA foreign_keys = ON");
    this.database.exec("PRAGMA busy_timeout = 5000");
    this.database.exec("PRAGMA wal_autocheckpoint = 1000");
    this.#migrate();
    chmodSync(dbFile, 0o600);
  }

  #migrate() {
    const version = Number(this.database.prepare("PRAGMA user_version").get().user_version);
    if (version > STORE_SCHEMA_VERSION) {
      throw new Error(`Summary database schema ${version} is newer than this ${TITLE_NAME} build`);
    }
    if (version < 1) {
      this.database.exec(`
        BEGIN IMMEDIATE;
        CREATE TABLE IF NOT EXISTS commit_summaries (
          commit_sha TEXT PRIMARY KEY,
          status TEXT NOT NULL CHECK (status IN ('pending', 'generating', 'ready', 'failed')),
          change_type TEXT,
          projects_json TEXT NOT NULL DEFAULT '[]',
          changes_json TEXT,
          agent TEXT,
          model TEXT,
          prompt_version INTEGER NOT NULL DEFAULT 1,
          attempt_count INTEGER NOT NULL DEFAULT 0,
          last_error TEXT,
          lease_token TEXT,
          lease_expires_at INTEGER,
          origin TEXT NOT NULL DEFAULT 'local-ai' CHECK (origin IN ('local-ai', 'manual', 'legacy', 'cloud')),
          generated_at TEXT,
          updated_at TEXT NOT NULL
        ) STRICT;
        CREATE INDEX IF NOT EXISTS commit_summaries_status_idx
          ON commit_summaries(status, updated_at);
        CREATE TABLE IF NOT EXISTS store_metadata (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        ) STRICT;
        PRAGMA user_version = 2;
        COMMIT;
      `);
      this.database.prepare(
        "INSERT OR IGNORE INTO store_metadata (key, value) VALUES ('store_id', ?)",
      ).run(randomUUID());
    }
    if (version < 2) {
      this.database.exec(`
        BEGIN IMMEDIATE;
        ALTER TABLE commit_summaries ADD COLUMN usage_json TEXT;
        PRAGMA user_version = 2;
        COMMIT;
      `);
    }
  }

  ensurePending(commitSha, projects = [], now = new Date()) {
    assertSha(commitSha);
    const timestamp = iso(now);
    this.database.prepare(`
      INSERT INTO commit_summaries (
        commit_sha, status, projects_json, prompt_version, updated_at
      ) VALUES (?, 'pending', ?, ?, ?)
      ON CONFLICT(commit_sha) DO UPDATE SET
        projects_json = excluded.projects_json,
        updated_at = CASE
          WHEN commit_summaries.projects_json <> excluded.projects_json THEN excluded.updated_at
          ELSE commit_summaries.updated_at
        END
    `).run(commitSha, stringifyProjects(projects), PROMPT_VERSION, timestamp);
    return this.getBySha(commitSha);
  }

  /** Atomically reserve generation so parallel hooks/worktrees do not double-spend. */
  claim(commitSha, options = {}) {
    assertSha(commitSha);
    const now = options.now ?? new Date();
    const timestamp = iso(now);
    const nowMs = now.valueOf();
    const leaseToken = randomUUID();
    const leaseExpiresAt = nowMs + (options.leaseMs ?? LEASE_MS);
    return this.#transaction(() => {
      this.ensurePending(commitSha, options.projects, now);
      const current = this.getBySha(commitSha);
      const leased = current.status === "generating" && current.leaseExpiresAt > nowMs;
      if (leased || (current.status === "ready" && !options.force)) return null;

      this.database.prepare(`
        UPDATE commit_summaries SET
          status = 'generating',
          projects_json = ?,
          agent = ?,
          model = ?,
          prompt_version = ?,
          attempt_count = attempt_count + 1,
          last_error = NULL,
          lease_token = ?,
          lease_expires_at = ?,
          updated_at = ?
        WHERE commit_sha = ?
      `).run(
        stringifyProjects(options.projects),
        options.agent ?? null,
        options.model ?? null,
        options.promptVersion ?? PROMPT_VERSION,
        leaseToken,
        leaseExpiresAt,
        timestamp,
        commitSha,
      );
      return leaseToken;
    });
  }

  complete(commitSha, leaseToken, summary, now = new Date()) {
    assertSha(commitSha);
    validateSummary(summary);
    const timestamp = iso(now);
    const usageJson = summary.usage ? JSON.stringify(normalizeUsage(summary.usage)) : null;
    const result = this.database.prepare(`
      UPDATE commit_summaries SET
        status = 'ready',
        change_type = ?,
        changes_json = ?,
        agent = ?,
        model = ?,
        prompt_version = ?,
        last_error = NULL,
        lease_token = NULL,
        lease_expires_at = NULL,
        origin = ?,
        usage_json = ?,
        generated_at = ?,
        updated_at = ?
      WHERE commit_sha = ? AND status = 'generating' AND lease_token = ?
    `).run(
      summary.type,
      JSON.stringify(summary.changes),
      summary.agent,
      summary.model ?? null,
      summary.promptVersion ?? PROMPT_VERSION,
      summary.origin ?? "local-ai",
      usageJson,
      timestamp,
      timestamp,
      commitSha,
      leaseToken,
    );
    if (Number(result.changes) !== 1) {
      throw new Error(`Generation lease for ${commitSha.slice(0, 12)} is no longer active`);
    }
    return this.getBySha(commitSha);
  }

  fail(commitSha, leaseToken, error, now = new Date()) {
    assertSha(commitSha);
    const message = String(error?.message ?? error ?? "Unknown generation failure").slice(0, 2_000);
    const result = this.database.prepare(`
      UPDATE commit_summaries SET
        status = 'failed',
        last_error = ?,
        lease_token = NULL,
        lease_expires_at = NULL,
        updated_at = ?
      WHERE commit_sha = ? AND status = 'generating' AND lease_token = ?
    `).run(message, iso(now), commitSha, leaseToken);
    return Number(result.changes) === 1;
  }

  getBySha(commitSha) {
    assertSha(commitSha);
    const row = this.database.prepare(
      "SELECT * FROM commit_summaries WHERE commit_sha = ?",
    ).get(commitSha);
    return row ? decodeRow(row) : null;
  }

  findByPrefix(prefix) {
    if (typeof prefix !== "string" || !/^[0-9a-f]{4,40}$/i.test(prefix)) {
      throw new Error("Commit id must be a hexadecimal SHA or prefix (at least 4 characters)");
    }
    const rows = this.database.prepare(`
      SELECT * FROM commit_summaries
      WHERE substr(commit_sha, 1, length(?)) = lower(?)
      ORDER BY commit_sha
      LIMIT 2
    `).all(prefix, prefix);
    if (!rows.length) throw new Error(`No summary matches "${prefix}"`);
    if (rows.length > 1) throw new Error(`Commit prefix "${prefix}" is ambiguous`);
    return decodeRow(rows[0]);
  }

  listByShas(shas) {
    const unique = [...new Set(shas)];
    const records = new Map();
    for (let offset = 0; offset < unique.length; offset += 500) {
      const chunk = unique.slice(offset, offset + 500);
      if (!chunk.length) continue;
      const placeholders = chunk.map(() => "?").join(", ");
      const rows = this.database.prepare(
        `SELECT * FROM commit_summaries WHERE commit_sha IN (${placeholders})`,
      ).all(...chunk);
      for (const row of rows) records.set(row.commit_sha, decodeRow(row));
    }
    return records;
  }

  updateSummary(commitSha, editable, now = new Date()) {
    assertSha(commitSha);
    validateSummary(editable);
    const timestamp = iso(now);
    const result = this.database.prepare(`
      UPDATE commit_summaries SET
        status = 'ready',
        change_type = ?,
        projects_json = ?,
        changes_json = ?,
        origin = 'manual',
        last_error = NULL,
        lease_token = NULL,
        lease_expires_at = NULL,
        generated_at = coalesce(generated_at, ?),
        updated_at = ?
      WHERE commit_sha = ?
    `).run(
      editable.type,
      stringifyProjects(editable.projects),
      JSON.stringify(editable.changes),
      timestamp,
      timestamp,
      commitSha,
    );
    if (Number(result.changes) !== 1) throw new Error(`No summary exists for ${commitSha}`);
    return this.getBySha(commitSha);
  }

  importReady(commitSha, entry, now = new Date()) {
    assertSha(commitSha);
    validateSummary(entry);
    const timestamp = iso(now);
    const usageJson = entry.usage ? JSON.stringify(normalizeUsage(entry.usage)) : null;
    this.database.prepare(`
      INSERT INTO commit_summaries (
        commit_sha, status, change_type, projects_json, changes_json,
        agent, model, prompt_version, attempt_count, origin,
        usage_json, generated_at, updated_at
      ) VALUES (?, 'ready', ?, ?, ?, ?, ?, ?, 0, 'legacy', ?, ?, ?)
      ON CONFLICT(commit_sha) DO NOTHING
    `).run(
      commitSha,
      entry.type,
      stringifyProjects(entry.projects),
      JSON.stringify(entry.changes),
      entry.agent,
      entry.model ?? null,
      entry.promptVersion ?? PROMPT_VERSION,
      usageJson,
      entry.generatedAt ?? timestamp,
      timestamp,
    );
    return this.getBySha(commitSha);
  }

  metadata(key) {
    return this.database.prepare("SELECT value FROM store_metadata WHERE key = ?").get(key)?.value ?? null;
  }

  setMetadata(key, value) {
    this.database.prepare(`
      INSERT INTO store_metadata (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(key, String(value));
  }

  close() {
    this.database.close();
  }

  #transaction(action) {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const result = action();
      this.database.exec("COMMIT");
      return result;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

export function openSummaryStore(configOrPath) {
  const dbFile = typeof configOrPath === "string" ? configOrPath : configOrPath?.dbFile;
  if (!dbFile) throw new Error("A private SQLite dbFile is required");
  return new LocalSummaryStore(dbFile);
}

function decodeRow(row) {
  let projects;
  let changes;
  let usage;
  try {
    projects = JSON.parse(row.projects_json);
    changes = row.changes_json === null ? null : JSON.parse(row.changes_json);
    usage = row.usage_json === null ? null : JSON.parse(row.usage_json);
  } catch (error) {
    throw new Error(`Corrupt summary data for ${row.commit_sha}: ${error.message}`, { cause: error });
  }
  if (!Array.isArray(projects) || (changes !== null && !Array.isArray(changes))) {
    throw new Error(`Corrupt summary data for ${row.commit_sha}: expected JSON arrays`);
  }
  return {
    commitSha: row.commit_sha,
    status: row.status,
    type: row.change_type,
    projects,
    changes,
    usage,
    agent: row.agent,
    model: row.model,
    promptVersion: Number(row.prompt_version),
    attemptCount: Number(row.attempt_count),
    lastError: row.last_error,
    leaseToken: row.lease_token,
    leaseExpiresAt: row.lease_expires_at === null ? null : Number(row.lease_expires_at),
    origin: row.origin,
    generatedAt: row.generated_at,
    updatedAt: row.updated_at,
  };
}

function validateSummary(summary) {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) {
    throw new Error("Summary must be an object");
  }
  if (typeof summary.type !== "string" || !summary.type) {
    throw new Error("Summary needs a change type");
  }
  if (!Array.isArray(summary.changes) || !summary.changes.length) {
    throw new Error("Summary needs at least one generated change");
  }
  for (const change of summary.changes) {
    if (!change || typeof change.type !== "string" || typeof change.summary !== "string" || !change.summary.trim()) {
      throw new Error("Every generated change needs a type and non-empty summary");
    }
  }
  if (Object.hasOwn(summary, "projects") && !Array.isArray(summary.projects)) {
    throw new Error("Summary projects must be an array");
  }
  if (Object.hasOwn(summary, "agent") && typeof summary.agent !== "string") {
    throw new Error("Summary agent must be a string");
  }
}

function stringifyProjects(projects = []) {
  if (!Array.isArray(projects) || projects.some((project) => typeof project !== "string")) {
    throw new Error("Projects must be an array of strings");
  }
  return JSON.stringify([...new Set(projects)]);
}

function assertSha(value) {
  if (typeof value !== "string" || !/^[0-9a-f]{40}$/i.test(value)) {
    throw new Error(`Invalid commit SHA: ${value}`);
  }
}

function iso(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) throw new Error("Invalid timestamp");
  return date.toISOString();
}

function normalizeUsage(usage) {
  if (!usage || typeof usage !== "object") return null;
  const input = typeof usage.input === "number" ? usage.input : 0;
  const output = typeof usage.output === "number" ? usage.output : 0;
  return { input, output, total: (typeof usage.total === "number" ? usage.total : input + output) };
}
