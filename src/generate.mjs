import { commitShas } from "./git.mjs";
import { recordCommittedChange } from "./record.mjs";
import { openSummaryStore } from "./store.mjs";
import { MAX_FILE_LIST_BYTES } from "./agents/shared.mjs";

/** Inspect the token-spending scope without calling an AI agent. */
export function planGeneration(config, options = {}, dependencies = {}) {
  const limit = generationScope(options);
  const listCommits = dependencies.commitShas ?? commitShas;
  const shas = listCommits(limit, config.root);
  const store = dependencies.store ?? openSummaryStore(config);
  const ownsStore = !dependencies.store;
  try {
    const records = store.listByShas(shas);
    const candidates = shas.filter((sha) => options.force === true || records.get(sha)?.status !== "ready");
    const worstCaseInputBytes = candidates.length * (config.maxDiffBytes + MAX_FILE_LIST_BYTES);
    return {
      all: options.all === true,
      limit,
      selectedCommits: shas.length,
      readyCommits: shas.length - candidates.length,
      commitsToGenerate: candidates.length,
      candidateShas: candidates,
      worstCaseInputBytes,
      estimatedInputTokens: Math.ceil(worstCaseInputBytes / 4),
    };
  } finally {
    if (ownsStore) store.close();
  }
}

/** Generate only the history range the user explicitly approved. */
export async function generate(config, options = {}, dependencies = {}) {
  if (options.all === true && options.confirmAll !== true) {
    throw new Error("Full-history generation requires explicit confirmation (--all --yes)");
  }
  const store = dependencies.store ?? openSummaryStore(config);
  const ownsStore = !dependencies.store;
  try {
    const plan = options.plan ?? planGeneration(config, options, { ...dependencies, store });
    let generated = 0;
    let skipped = 0;
    const failures = [];
    for (const sha of plan.candidateShas) {
      try {
        const result = await recordCommittedChange(
          config,
          { ...dependencies, store },
          { sha, force: options.force === true },
        );
        if (result.created) generated++;
        else skipped++;
      } catch (error) {
        failures.push({ sha, error });
        if (options.continueOnError !== true) {
          const failure = new Error(
            `Stopped after ${generated} summaries; ${sha.slice(0, 12)} failed: ${error.message}`,
            { cause: error },
          );
          failure.result = { plan, generated, skipped, failures };
          throw failure;
        }
      }
    }
    return { plan, generated, skipped, failures };
  } finally {
    if (ownsStore) store.close();
  }
}

function generationScope(options) {
  if (options.all === true) return undefined;
  if (Number.isInteger(options.limit) && options.limit > 0) return options.limit;
  throw new Error("Choose a generation scope with --limit N or --all --yes");
}
