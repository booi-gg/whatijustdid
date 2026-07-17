import * as raw from "./raw.mjs";
import * as claude from "./claude.mjs";
import * as codex from "./codex.mjs";
import * as llama from "./llama.mjs";

const REGISTRY = { raw, claude, codex, openai: codex, llama };

/** Pick a provider by name. Unknown → error listing valid options. */
export function getProvider(name) {
  const provider = REGISTRY[name];
  if (!provider) {
    throw new Error(`Unknown provider "${name}". Options: ${Object.keys(REGISTRY).join(", ")}`);
  }
  return provider;
}
