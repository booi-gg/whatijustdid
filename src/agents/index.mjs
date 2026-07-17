import * as claude from "./claude.mjs";
import * as codex from "./codex.mjs";
import * as deepseek from "./deepseek.mjs";
import * as llama from "./llama.mjs";

const AGENTS = { codex, openai: codex, claude, deepseek, llama };

/** Pick an AI agent by name. */
export function getAgent(name) {
  const agent = AGENTS[name];
  if (!agent) {
    throw new Error(`Unknown agent "${name}". Options: ${Object.keys(AGENTS).join(", ")}`);
  }
  return agent;
}
