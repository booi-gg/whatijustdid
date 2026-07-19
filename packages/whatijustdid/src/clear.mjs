import { build } from "./build.mjs";
import { openSummaryStore } from "./store.mjs";

/** Clear clone-private summaries and rebuild the derived viewer data. */
export function clearHistory(config, options = {}, dependencies = {}) {
  if (options.confirm !== true) {
    throw new Error("Clearing local history requires explicit confirmation");
  }

  const store = dependencies.store ?? openSummaryStore(config);
  const ownsStore = !dependencies.store;
  let cleared;
  try {
    cleared = store.clearSummaries(options.now);
  } finally {
    if (ownsStore) store.close();
  }

  const viewerEntries = (dependencies.build ?? build)(config);
  return { cleared, viewerEntries };
}
