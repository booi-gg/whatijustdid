import * as claude from "./claude.mjs";
import * as codex from "./codex.mjs";
import * as deepseek from "./deepseek.mjs";
import * as llama from "./llama.mjs";

const AGENTS = { codex, openai: codex, claude, deepseek, llama };

export const AGENT_KEY = {
  codex: "OPENAI_API_KEY",
  openai: "OPENAI_API_KEY",
  claude: "ANTHROPIC_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
};

export const AGENT_NAMES = Object.freeze(["codex", "openai", "claude", "deepseek", "llama"]);

/** Pick an AI agent by name. */
export function getAgent(name) {
  const agent = AGENTS[name];
  if (!agent) {
    throw new Error(`Unknown agent "${name}". Options: ${Object.keys(AGENTS).join(", ")}`);
  }
  return agent;
}

export function validateAgentConfig(agent, env = process.env) {
  if (!AGENTS[agent]) {
    return {
      valid: false,
      agent,
      error: `Unknown agent "${agent}". Options: ${AGENT_NAMES.join(", ")}`,
    };
  }
  const key = AGENT_KEY[agent];
  if (key && !env[key]) {
    return {
      valid: false,
      agent,
      error: `${key} environment variable is not set`,
    };
  }
  return { valid: true, agent };
}
