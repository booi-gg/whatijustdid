import { execFileSync } from "node:child_process";
import { relative, sep } from "node:path";

function git(args, opts = {}) {
  const output = execFileSync("git", args, {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    ...opts,
  });
  return Buffer.isBuffer(output) ? output : output.trimEnd();
}

function tryGit(args, opts = {}) {
  try {
    return git(args, { stdio: ["ignore", "pipe", "ignore"], ...opts });
  } catch {
    return "";
  }
}

export function repoRoot(cwd = process.cwd()) {
  return git(["rev-parse", "--show-toplevel"], { cwd });
}

/** Most recent commit SHAs, newest first, capped at `limit`. */
export function recentShas(limit, cwd = process.cwd()) {
  const out = git(["log", `-n${limit}`, "--no-merges", "--format=%H"], { cwd });
  return out ? out.split("\n") : [];
}

const FIELD = "\x1f"; // unit separator
const RECORD = "\x1e"; // record separator

/** Structured metadata for a single commit. */
export function commitMeta(sha, cwd = process.cwd()) {
  const fmt = ["%H", "%h", "%an", "%ae", "%cn", "%ce", "%aI", "%s", "%b"].join(FIELD) + RECORD;
  const raw = git(["show", "--no-patch", `--format=${fmt}`, sha], { cwd });
  const end = raw.indexOf(RECORD);
  const [hash, short, author, authorEmail, committer, committerEmail, date, subject, body] = raw
    .slice(0, end >= 0 ? end : undefined)
    .split(FIELD);
  return {
    sha: hash,
    shortSha: short,
    author,
    authorEmail,
    committer,
    committerEmail,
    date,
    subject,
    body: body ?? "",
  };
}

/** Paths changed by a commit. */
export function commitFiles(sha, cwd = process.cwd()) {
  const out = git(["show", "--name-only", "--format=", sha], { cwd });
  return out ? out.split("\n").filter(Boolean) : [];
}

export function commitDiff(sha, maxBytes, cwd = process.cwd()) {
  const out = git(["show", "--format=", "--no-ext-diff", "--unified=2", sha], { cwd });
  return truncateUtf8(out, maxBytes);
}

export function stagedFiles(cwd = process.cwd()) {
  const out = git(["diff", "--cached", "--name-only", "--diff-filter=ACMRD", "-z"], {
    cwd,
    encoding: "buffer",
  });
  return out ? out.toString("utf8").split("\0").filter(Boolean) : [];
}

export function stagedDiff(files, maxBytes, cwd = process.cwd()) {
  if (!files.length) return "";
  const out = git(
    ["diff", "--cached", "--no-ext-diff", "--unified=2", "--", ...files],
    { cwd },
  );
  return truncateUtf8(out, maxBytes);
}

export function stagedIdentity(files, cwd = process.cwd()) {
  if (!files.length) return "";
  return git(["diff", "--cached", "--raw", "--no-abbrev", "--", ...files], { cwd });
}

export function stageFile(path, cwd = process.cwd()) {
  git(["add", "--", path], { cwd });
}

export function currentHead(cwd = process.cwd()) {
  return tryGit(["rev-parse", "HEAD"], { cwd });
}

export function gitAuthor(cwd = process.cwd()) {
  return {
    name: tryGit(["config", "--get", "user.name"], { cwd }) || "Unknown",
    email: tryGit(["config", "--get", "user.email"], { cwd }) || "",
  };
}

/**
 * Resolve DB row paths to commits that introduced them. One git process for
 * every row would make post-commit hooks increasingly slow; parse one log.
 */
export function commitIndexForDirectory(root, directory, revision = "HEAD") {
  const directoryPath = toGitPath(relative(root, directory));
  const format = `%x1e%H%x1f%h%x1f%an%x1f%ae%x1f%cn%x1f%ce%x1f%aI%x1f%s%x1f%b%x1d`;
  const out = tryGit(
    ["log", `--format=${format}`, "--name-only", "--diff-filter=A", revision, "--", directoryPath],
    { cwd: root },
  );
  return parseCommitIndexLog(out);
}

export function parseCommitIndexLog(out) {
  const END = "\x1d";
  const index = new Map();

  for (const chunk of out.split(RECORD)) {
    const metaEnd = chunk.indexOf(END);
    if (metaEnd < 0) continue;
    const [
      sha,
      shortSha,
      author,
      authorEmail,
      committer,
      committerEmail,
      date,
      subject,
      body = "",
    ] = chunk
      .slice(0, metaEnd)
      .split(FIELD);
    const meta = {
      sha,
      shortSha,
      author,
      authorEmail,
      committer,
      committerEmail,
      date,
      subject,
      body,
    };
    const paths = chunk
      .slice(metaEnd + END.length)
      .split("\n")
      .map((path) => path.trim())
      .filter(Boolean);
    for (const path of paths) {
      if (!index.has(path)) index.set(path, meta);
    }
  }

  return index;
}

export function toGitPath(path) {
  return sep === "/" ? path : path.split(sep).join("/");
}

/** DB rows added, modified, deleted, or type-changed in the pending commit. */
export function stagedModifiedPaths(root, directory) {
  const directoryPath = toGitPath(relative(root, directory));
  const out = git(
    [
      "diff",
      "--cached",
      "--name-only",
      "--diff-filter=AMDT",
      "--no-renames",
      "-z",
      "--",
      directoryPath,
    ],
    { cwd: root, encoding: "buffer" },
  );
  return nulPaths(out);
}

/** DB rows added, modified, deleted, or type-changed between two revisions. */
export function modifiedPathsBetween(root, directory, base, head) {
  const directoryPath = toGitPath(relative(root, directory));
  const out = git(
    [
      "diff",
      "--name-only",
      "--diff-filter=AMDT",
      "--no-renames",
      "-z",
      `${base}..${head}`,
      "--",
      directoryPath,
    ],
    { cwd: root, encoding: "buffer" },
  );
  return nulPaths(out);
}

export function fileAtRevision(root, revision, path) {
  try {
    return git(["show", `${revision}:${path}`], { cwd: root });
  } catch {
    return null;
  }
}

export function fileAtIndex(root, path) {
  try {
    return git(["show", `:${path}`], { cwd: root });
  } catch {
    return null;
  }
}

export function fileModeAtIndex(root, path) {
  const out = tryGit(["ls-files", "--stage", "--", path], { cwd: root });
  return out ? out.split(/\s/, 1)[0] : null;
}

export function fileModeAtRevision(root, revision, path) {
  const out = tryGit(["ls-tree", revision, "--", path], { cwd: root });
  return out ? out.split(/\s/, 1)[0] : null;
}

export function mergeBase(root, base, head) {
  return git(["merge-base", base, head], { cwd: root });
}

export function commitActorsBetween(root, base, head, path) {
  const format = `%x1e%H%x1f%ae%x1f%ce`;
  const out = tryGit(["log", `--format=${format}`, `${base}..${head}`, "--", path], {
    cwd: root,
  });
  return parseCommitActors(out);
}

export function firstAddedCommitBetween(root, base, head, path) {
  const out = tryGit(
    ["log", "--reverse", "--diff-filter=A", "--format=%H", `${base}..${head}`, "--", path],
    { cwd: root },
  );
  return out.split("\n").find(Boolean) ?? "";
}

export function parseCommitActors(out) {
  return out
    .split(RECORD)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const [sha, authorEmail, committerEmail] = chunk.split(FIELD);
      return { sha, authorEmail, committerEmail };
    });
}

function nulPaths(output) {
  return output ? output.toString("utf8").split("\0").filter(Boolean) : [];
}

function truncateUtf8(value, maxBytes) {
  const bytes = Buffer.from(value, "utf8");
  if (bytes.length <= maxBytes) return value;
  return `${bytes.subarray(0, maxBytes).toString("utf8")}\n\n[diff truncated]`;
}
