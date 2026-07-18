import {
  FESSUP_SCHEMA,
  apiUrl,
  formatAgentInput,
  parseAgentJson,
  postJson,
  verbosityConfig,
  verbosityPrompt,
} from "./shared.mjs";

// Local Ollama. No API key, no cloud, and no runtime dependency.
const DEFAULT_MODEL = "llama3.2";

export async function describe(
  input,
  { model, timeoutMs, verbosity = "normal" },
) {
  const selectedModel = model ?? DEFAULT_MODEL;
  const { maxSummaryChars } = verbosityConfig(verbosity);
  const data = await postJson(
    apiUrl(process.env.OLLAMA_HOST ?? "http://localhost:11434", "api/chat"),
    {
      label: "Ollama API",
      timeoutMs,
      headers: {},
      body: {
        model: selectedModel,
        format: FESSUP_SCHEMA,
        stream: false,
        options: { temperature: 0 },
        messages: [
          { role: "system", content: verbosityPrompt(verbosity) },
          { role: "user", content: formatAgentInput(input) },
        ],
      },
    },
  );

  const usage =
    typeof data.prompt_eval_count === "number" || typeof data.eval_count === "number"
      ? {
          input: data.prompt_eval_count ?? 0,
          output: data.eval_count ?? 0,
          total: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
        }
      : null;
  return {
    ...parseAgentJson(data.message?.content ?? "", { maxSummaryChars }),
    model: selectedModel,
    usage,
  };
}
