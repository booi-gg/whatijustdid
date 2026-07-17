import { execFileSync } from "node:child_process";
import { isAbsolute, relative, resolve, sep } from "node:path";

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

/** Git-private directory for this specific worktree. */
export function gitDir(cwd = process.cwd()) {
  const root = repoRoot(cwd);
  const directory = git(["rev-parse", "--git-dir"], { cwd: root });
  return isAbsolute(directory) ? directory : resolve(root, directory);
}

/** Git-private directory shared by every worktree in this clone. */
export function gitCommonDir(cwd = process.cwd()) {
  const root = repoRoot(cwd);
  const directory = git(["rev-parse", "--git-common-dir"], { cwd: root });
  return isAbsolute(directory) ? directory : resolve(root, directory);
}

/** Commit SHAs, newest first. Omitting `limit` walks all reachable history. */
export function commitShas(limit, cwd = process.cwd()) {
  const count = Number.isInteger(limit) && limit > 0 ? [`-n${limit}`] : [];
  const out = tryGit(["rev-list", "--topo-order", ...count, "HEAD"], { cwd });
  return out ? out.split("\n") : [];
}

/** Backwards-compatible name for API consumers. */
export const recentShas = commitShas;

const FIELD = "\x1f"; // unit separator
const RECORD = "\x1e"; // record separator
const END = "\x1d";

/** Recent reachable commit metadata in one Git process, newest first. */
export function recentCommitMetas(limit, cwd = process.cwd()) {
  const count = Number.isInteger(limit) && limit > 0 ? [`-n${limit}`] : [];
  const format = `%x1e%H%x1f%h%x1f%P%x1f%an%x1f%ae%x1f%cn%x1f%ce%x1f%cI%x1d`;
  const out = tryGit(["log", "--topo-order", ...count, `--format=${format}`, "HEAD"], { cwd });
  return out
    .split(RECORD)
    .map((chunk) => parseCompactCommit(chunk))
    .filter(Boolean);
}

/** Structured metadata for a single commit. */
export function commitMeta(sha, cwd = process.cwd()) {
  const fmt = ["%H", "%h", "%P", "%an", "%ae", "%cn", "%ce", "%cI"].join(FIELD) + RECORD;
  const raw = git(["show", "--no-patch", `--format=${fmt}`, sha], { cwd });
  const end = raw.indexOf(RECORD);
  const [hash, short, parents, author, authorEmail, committer, committerEmail, date] = raw
    .slice(0, end >= 0 ? end : undefined)
    .split(FIELD);
  return {
    sha: hash,
    shortSha: short,
    parents: parents ? parents.split(" ") : [],
    author,
    authorEmail,
    committer,
    committerEmail,
    date,
  };
}

function parseCompactCommit(chunk) {
  const end = chunk.indexOf(END);
  if (end < 0) return null;
  const [sha, shortSha, parents, author, authorEmail, committer, committerEmail, date] = chunk
    .slice(0, end)
    .trimStart()
    .split(FIELD);
  if (!sha) return null;
  return {
    sha,
    shortSha,
    parents: parents ? parents.split(" ") : [],
    author,
    authorEmail,
    committer,
    committerEmail,
    date,
  };
}

/** Paths changed by a commit. */
export function commitFiles(sha, cwd = process.cwd()) {
  const parent = tryGit(["rev-parse", "--verify", `${sha}^1`], { cwd });
  const out = parent
    ? git(["diff", "--name-only", "--no-ext-diff", parent, sha], { cwd })
    : git(["show", "--root", "--name-only", "--format=", sha], { cwd });
  return out ? out.split("\n").filter(Boolean) : [];
}

export function commitDiff(sha, maxBytes, cwd = process.cwd()) {
  const parent = tryGit(["rev-parse", "--verify", `${sha}^1`], { cwd });
  const out = parent
    ? git(["diff", "--no-ext-diff", "--unified=2", parent, sha], { cwd })
    : git(["show", "--root", "--format=", "--no-ext-diff", "--unified=2", sha], { cwd });
  return truncateUtf8(out, maxBytes);
}

export function currentHead(cwd = process.cwd()) {
  return tryGit(["rev-parse", "HEAD"], { cwd });
}

/** Resolve legacy JSON row paths to their adding commits in one Git process. */
export function commitIndexForDirectory(root, directory, revision = "HEAD", maxCount) {
  const directoryPath = toGitPath(relative(root, directory));
  const format = `%x1e%H%x1f%h%x1f%an%x1f%ae%x1f%cn%x1f%ce%x1f%aI%x1f%s%x1f%b%x1d`;
  const count = Number.isInteger(maxCount) && maxCount > 0 ? [`-n${maxCount}`] : [];
  const out = tryGit(
    ["log", ...count, `--format=${format}`, "--name-only", "--diff-filter=A", revision, "--", directoryPath],
    { cwd: root },
  );
  return parseCommitIndexLog(out);
}

export function parseCommitIndexLog(out) {
  const END = "\x1d";
  const index = new Map();

  for (const chunk of out.split(RECORD)) {
    const meta = parseIndexedCommit(chunk);
    if (!meta) continue;
    const metaEnd = chunk.indexOf(END);
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

function parseIndexedCommit(chunk) {
  const END = "\x1d";
  const metaEnd = chunk.indexOf(END);
  if (metaEnd < 0) return null;
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
  ] = chunk.slice(0, metaEnd).split(FIELD);
  return {
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
}

export function toGitPath(path) {
  return sep === "/" ? path : path.split(sep).join("/");
}

function truncateUtf8(value, maxBytes) {
  const bytes = Buffer.from(value, "utf8");
  if (bytes.length <= maxBytes) return value;
  return `${bytes.subarray(0, maxBytes).toString("utf8")}\n\n[diff truncated]`;
}
