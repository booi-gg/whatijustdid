import { commitDiff, commitFiles, commitMeta, currentHead } from "./git.mjs";
import { projectsForFiles } from "./projects.mjs";
import { describeChange } from "./describe.mjs";
import { openSummaryStore, PROMPT_VERSION } from "./store.mjs";

/** Generate and persist the AI summary for an already-created Git commit. */
export async function recordCommittedChange(
  config,
  dependencies = {},
  options = {},
) {
  const sha = options.sha ?? currentHead(config.root);
  if (!sha) return { created: false, reason: "no-commit", entry: null };
  if (options.mergeOnly === true) {
    const meta = (dependencies.commitMeta ?? commitMeta)(sha, config.root);
    if (meta.parents.length < 2) {
      return { created: false, reason: "not-a-merge", entry: null };
    }
  }

  const store = dependencies.store ?? openSummaryStore(config);
  const ownsStore = !dependencies.store;
  const summarize = dependencies.describeChange ?? describeChange;
  let leaseToken;
  try {
    const files = (dependencies.commitFiles ?? commitFiles)(sha, config.root);
    const diff = (dependencies.commitDiff ?? commitDiff)(
      sha,
      config.maxDiffBytes,
      config.root,
    );
    if (!files.length && !diff.trim()) {
      return { created: false, reason: "no-code-changes", entry: null };
    }
    const projects = projectsForFiles(files, config.projects);
    leaseToken = store.claim(sha, {
      projects,
      agent: config.agent,
      model: config.model,
      promptVersion: PROMPT_VERSION,
      force: options.force === true,
    });
    if (!leaseToken) {
      return {
        created: false,
        reason: "already-ready-or-generating",
        entry: store.getBySha(sha),
      };
    }

    const result = await summarize({ files, diff }, config, {
      onOutputTextDelta: options.onOutputTextDelta,
    });
    const entry = store.complete(sha, leaseToken, {
      ...result,
      promptVersion: PROMPT_VERSION,
      origin: "local-ai",
    });
    return { created: true, reason: "generated", entry };
  } catch (error) {
    if (leaseToken) store.fail(sha, leaseToken, error);
    throw error;
  } finally {
    if (ownsStore) store.close();
  }
}
