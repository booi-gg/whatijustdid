import { spawnSync } from "node:child_process";
import { describeChange } from "./describe.mjs";
import { stagedDiff, stagedFiles } from "./git.mjs";

const SUBJECT_TARGET = 50;
const SUBJECT_LIMIT = 72;
const BODY_LIMIT = 72;
const COMMIT_TYPES = new Set([
  "feat",
  "fix",
  "refactor",
  "perf",
  "docs",
  "test",
  "chore",
  "build",
  "ci",
  "style",
  "revert",
]);

/** Files and diff currently staged in the index, or null when nothing is staged. */
export function stagedChange(config, dependencies = {}) {
  const files = (dependencies.stagedFiles ?? stagedFiles)(config.root);
  if (!files.length) return null;
  const diff = (dependencies.stagedDiff ?? stagedDiff)(
    config.maxDiffBytes,
    config.root,
  );
  return { files, diff };
}

/** Ask the configured agent to describe the staged diff and shape it into a commit message. */
export async function draftCommitMessage(config, change, dependencies = {}) {
  const describe = dependencies.describeChange ?? describeChange;
  const description = await describe(change, config, { purpose: "commit" });
  return { message: formatCommitMessage(description), description };
}

export function formatCommitMessage({ type, changes }) {
  const [first, ...rest] = changes;
  const full = `${commitType(type)}: ${subjectCase(first.summary)}`;
  const subject = truncateSubject(full);
  const bullets = subject === full ? rest : changes;
  if (!bullets.length) return subject;
  return `${subject}\n\n${bullets.map((change) => wrapBullet(change.summary)).join("\n")}`;
}

export function runGitCommit(message, { cwd, args = [] } = {}) {
  const result = spawnSync("git", ["commit", "-m", message, ...args], {
    cwd,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`git commit exited with status ${result.status}`);
}

function subjectCase(summary) {
  const text = summary.trim().replace(/\s+/g, " ").replace(/\.+$/, "");
  // Lowercase the leading word unless it looks like an acronym or identifier.
  return /^[A-Z][a-z]/.test(text)
    ? text.charAt(0).toLowerCase() + text.slice(1)
    : text;
}

function truncateSubject(subject) {
  if (subject.length <= SUBJECT_TARGET) return subject;
  const preferred = wordBoundary(subject, SUBJECT_TARGET - 1);
  if (preferred.length >= 40) return `${preferred}…`;
  if (subject.length <= SUBJECT_LIMIT) return subject;
  const hardLimit = wordBoundary(subject, SUBJECT_LIMIT - 1);
  const truncated =
    hardLimit.length >= 40
      ? hardLimit
      : subject.slice(0, SUBJECT_LIMIT - 1).trimEnd();
  return `${truncated}…`;
}

function wordBoundary(text, limit) {
  const cut = text.slice(0, limit);
  const space = cut.lastIndexOf(" ");
  return (space > 0 ? cut.slice(0, space) : cut).trimEnd();
}

function commitType(type) {
  return COMMIT_TYPES.has(type) ? type : "chore";
}

function wrapBullet(summary) {
  const words = summary.trim().replace(/\s+/g, " ").split(" ");
  const lines = [];
  let line = "-";
  for (const word of words) {
    const candidate = `${line} ${word}`;
    if (candidate.length <= BODY_LIMIT || line === "-") {
      line = candidate;
      continue;
    }
    lines.push(line);
    line = `  ${word}`;
  }
  lines.push(line);
  return lines.join("\n");
}
