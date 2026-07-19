import { spawnSync } from "node:child_process";
import { describeChange } from "./describe.mjs";
import { stagedDiff, stagedFiles } from "./git.mjs";

const SUBJECT_LIMIT = 72;

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
  const description = await describe(change, config);
  return { message: formatCommitMessage(description), description };
}

export function formatCommitMessage({ type, changes }) {
  const [first, ...rest] = changes;
  const full = `${type}: ${subjectCase(first.summary)}`;
  const subject = truncateSubject(full);
  const bullets = subject === full ? rest : changes;
  if (!bullets.length) return subject;
  return `${subject}\n\n${bullets.map((change) => `- ${change.summary}`).join("\n")}`;
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
  const text = summary.replace(/\.+$/, "");
  // Lowercase the leading word unless it looks like an acronym or identifier.
  return /^[A-Z][a-z]/.test(text)
    ? text.charAt(0).toLowerCase() + text.slice(1)
    : text;
}

function truncateSubject(subject) {
  if (subject.length <= SUBJECT_LIMIT) return subject;
  const cut = subject.slice(0, SUBJECT_LIMIT - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > 40 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
