import { getAgent } from "./agents/index.mjs";

/** Every stored description must come from the configured AI agent. */
export async function describeChange(input, config, options = {}) {
  const agent = getAgent(config.agent);

  try {
    const result = await agent.describe(input, {
      model: config.model,
      timeoutMs: config.timeoutMs,
      verbosity: config.verbosity,
      purpose: options.purpose,
      onOutputTextDelta: options.onOutputTextDelta,
    });
    return { ...result, agent: config.agent };
  } catch (error) {
    throw new Error(
      `Agent "${config.agent}" could not generate a summary: ${error.message}`,
      {
        cause: error,
      },
    );
  }
}
