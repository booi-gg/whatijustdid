import * as claude from "./claude.mjs";
import * as codex from "./codex.mjs";
import * as deepseek from "./deepseek.mjs";
import * as llama from "./llama.mjs";
import { ENV_PREFIX } from "../brand.mjs";

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
  if (key && !env[key] && !env[`${ENV_PREFIX}_AGENT_API_KEY`]) {
    return {
      valid: false,
      agent,
      key,
      error:
        `${key} environment variable is not set. ` +
        `Add it to a .env file in your repo root: ${ENV_PREFIX}_AGENT_API_KEY=<your-api-key> ` +
        `(works for any agent; or use ${key}=<your-api-key> for this agent specifically), ` +
        `or export it in your shell instead`,
    };
  }
  return { valid: true, agent };
}
