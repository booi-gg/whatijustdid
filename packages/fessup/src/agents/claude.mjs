import {
  FESSUP_SCHEMA,
  apiUrl,
  formatAgentInput,
  parseAgentJson,
  postJson,
  verbosityConfig,
  verbosityPrompt,
} from "./shared.mjs";

// Raw HTTP keeps the package dependency-free inside latency-sensitive hooks.
const DEFAULT_MODEL = "claude-sonnet-5";

export async function describe(input, { model, timeoutMs, verbosity = "normal" }) {
  const key = resolveApiKey("ANTHROPIC_API_KEY");
  if (!key) throw new Error("ANTHROPIC_API_KEY not set");
  const selectedModel = model ?? DEFAULT_MODEL;
  const { maxTokens, maxSummaryChars } = verbosityConfig(verbosity);

  const data = await postJson(
    apiUrl(
      process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com",
      "v1/messages",
    ),
    {
      label: "Anthropic Messages API",
      timeoutMs,
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: {
        model: selectedModel,
        max_tokens: maxTokens,
        system: verbosityPrompt(verbosity),
        messages: [{ role: "user", content: formatAgentInput(input) }],
        output_config: {
              format: { type: "json_schema", schema: FESSUP_SCHEMA },
        },
      },
    },
  );

  const text = data.content?.map((block) => block.text ?? "").join("") ?? "";
  const usage = data.usage
    ? {
        input: data.usage.input_tokens ?? 0,
        output: data.usage.output_tokens ?? 0,
        total: (data.usage.input_tokens ?? 0) + (data.usage.output_tokens ?? 0),
      }
    : null;
  return { ...parseAgentJson(text, { maxSummaryChars }), model: selectedModel, usage };
}
