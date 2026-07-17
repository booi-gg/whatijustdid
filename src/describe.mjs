import { getProvider } from "./providers/index.mjs";
import * as raw from "./providers/raw.mjs";

/** AI failure must never strand a developer mid-commit. Raw output is safe. */
export async function describeChange(input, config) {
  const provider = getProvider(config.provider);

  try {
    const result = await provider.describe(input, {
      model: config.model,
      timeoutMs: config.timeoutMs,
    });
    return { ...result, provider: config.provider };
  } catch (error) {
    if (config.provider !== "raw") {
      console.warn(
        `ctrial: ${config.provider} failed (${error.message}); using commit-message fallback`,
      );
    }
    return { ...(await raw.describe(input)), provider: "raw" };
  }
}
