import {
  PROJECT_NAME_SCHEMA,
  WHATIJUSTDID_SCHEMA,
  apiUrl,
  formatAgentInput,
  formatProjectNameInput,
  parseAgentJson,
  parseProjectNameJson,
  postJson,
  projectNamePrompt,
  resolveApiKey,
  verbosityConfig,
  verbosityPrompt,
} from "./shared.mjs";

// Raw HTTP keeps the package dependency-free inside latency-sensitive hooks.
export const DEFAULT_MODEL = "claude-sonnet-5";

export async function nameProject(input, { model, timeoutMs }) {
  const key = resolveApiKey("ANTHROPIC_API_KEY");
  if (!key) throw new Error("ANTHROPIC_API_KEY not set");
  const selectedModel = model ?? DEFAULT_MODEL;
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
        max_tokens: 300,
        system: projectNamePrompt(),
        messages: [{ role: "user", content: formatProjectNameInput(input) }],
        output_config: {
          format: { type: "json_schema", schema: PROJECT_NAME_SCHEMA },
        },
      },
    },
  );
  const text = data.content?.map((block) => block.text ?? "").join("") ?? "";
  return { name: parseProjectNameJson(text), model: selectedModel };
}

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
          format: { type: "json_schema", schema: WHATIJUSTDID_SCHEMA },
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
