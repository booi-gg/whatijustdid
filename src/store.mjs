import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

const HASH_ID = /^[0-9a-f]{4,}$/i;

/**
 * Spread content-addressed rows across 65,536 leaf directories. This keeps
 * lookup constant-time and avoids putting an unbounded number of files in one
 * directory. Non-hash IDs retain the legacy flat layout for compatibility.
 */
export function entryPathForId(dbDir, id) {
  assertSafeId(id);
  if (!HASH_ID.test(id)) return join(dbDir, `${id}.json`);
  return join(dbDir, id.slice(0, 2).toLowerCase(), id.slice(2, 4).toLowerCase(), `${id}.json`);
}

/** Resolve an exact ID in either the sharded or pre-0.2 flat layout. */
export function existingEntryPath(dbDir, id) {
  assertSafeId(id);
  const sharded = entryPathForId(dbDir, id);
  if (existsSync(sharded)) return sharded;
  const flat = join(dbDir, `${id}.json`);
  return flat !== sharded && existsSync(flat) ? flat : null;
}

/** Resolve an exact ID or unique prefix without scanning unrelated hash shards. */
export function findEntryPath(dbDir, id) {
  assertSafeId(id);
  const exact = existingEntryPath(dbDir, id);
  if (exact) return exact;

  const searchRoots = HASH_ID.test(id) && id.length >= 4
    ? [join(dbDir, id.slice(0, 2).toLowerCase(), id.slice(2, 4).toLowerCase())]
    : [dbDir];
  const matches = new Set();
  for (const root of searchRoots) {
    for (const path of listEntryFiles(root)) {
      if (basename(path, ".json").startsWith(id)) matches.add(path);
    }
  }

  // Old flat hash rows live outside their optimized shard search.
  if (searchRoots[0] !== dbDir && existsSync(dbDir)) {
    for (const item of readdirSync(dbDir, { withFileTypes: true })) {
      if (item.isFile() && item.name.endsWith(".json") && basename(item.name, ".json").startsWith(id)) {
        matches.add(join(dbDir, item.name));
      }
    }
  }

  if (!matches.size) throw new Error(`No changelog entry matches "${id}"`);
  if (matches.size > 1) throw new Error(`Entry prefix "${id}" is ambiguous`);
  return [...matches][0];
}

/** Write one canonical row, creating its hash shard as needed. */
export function writeEntry(dbDir, entry, options = {}) {
  const path = entryPathForId(dbDir, entry?.id);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(entry, null, 2)}\n`, options.exclusive ? { flag: "wx" } : undefined);
  return path;
}

/** Recursively list legacy flat rows and sharded rows in deterministic order. */
export function listEntryFiles(dbDir) {
  if (!existsSync(dbDir)) return [];
  const files = [];
  const pending = [dbDir];

  while (pending.length) {
    const directory = pending.pop();
    const items = readdirSync(directory, { withFileTypes: true })
      .sort((a, b) => b.name.localeCompare(a.name));
    for (const item of items) {
      const path = join(directory, item.name);
      if (item.isDirectory()) {
        pending.push(path);
      } else if (item.name.endsWith(".json")) {
        if (!item.isFile()) throw new Error(`Changelog row must be a regular file: ${path}`);
        files.push(path);
      }
    }
  }

  return files.sort((a, b) => a.localeCompare(b));
}

/** Parse canonical rows. Passing paths makes bounded builds avoid a full walk. */
export function readEntryRecords(dbDir, paths = listEntryFiles(dbDir)) {
  const root = resolve(dbDir);
  return [...new Set(paths)].sort((a, b) => a.localeCompare(b)).map((path) => {
    const absolute = resolve(path);
    const inside = absolute === root || absolute.startsWith(`${root}${sep}`);
    if (!inside) throw new Error(`Changelog row is outside the database: ${path}`);
    if (!lstatSync(absolute).isFile()) {
      throw new Error(`Changelog row must be a regular file: ${repositoryRow(dbDir, absolute)}`);
    }
    try {
      return {
        path: absolute,
        file: repositoryRow(dbDir, absolute),
        entry: JSON.parse(readFileSync(absolute, "utf8")),
      };
    } catch (error) {
      throw new Error(`Invalid changelog row ${repositoryRow(dbDir, absolute)}: ${error.message}`);
    }
  });
}

function assertSafeId(id) {
  if (typeof id !== "string" || !id || id === "." || id === ".." || id.includes("/") || id.includes("\\")) {
    throw new Error("Changelog entry id must be a non-empty filename-safe string");
  }
}

function repositoryRow(dbDir, path) {
  const value = relative(dbDir, path);
  return sep === "/" ? value : value.split(sep).join("/");
}
