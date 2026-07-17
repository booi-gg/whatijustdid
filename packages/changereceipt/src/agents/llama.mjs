import {
  CHANGELOG_SCHEMA,
  SYSTEM_PROMPT,
  apiUrl,
  formatAgentInput,
  parseAgentJson,
  postJson,
} from "./shared.mjs";

// Local Ollama. No API key, no cloud, and no runtime dependency.
const DEFAULT_MODEL = "llama3.2";

export async function describe(input, { model, timeoutMs }) {
  const selectedModel = model ?? DEFAULT_MODEL;
  const data = await postJson(
    apiUrl(process.env.OLLAMA_HOST ?? "http://localhost:11434", "api/chat"),
    {
      label: "Ollama API",
      timeoutMs,
      headers: {},
      body: {
        model: selectedModel,
        format: CHANGELOG_SCHEMA,
        stream: false,
        options: { temperature: 0 },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: formatAgentInput(input) },
        ],
      },
    }
  );

  return { ...parseAgentJson(data.message?.content ?? ""), model: selectedModel };
}
