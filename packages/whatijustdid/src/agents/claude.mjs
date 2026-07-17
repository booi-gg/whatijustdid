import {
  WHATIJUSTDID_SCHEMA,
  SYSTEM_PROMPT,
  apiUrl,
  formatAgentInput,
  parseAgentJson,
  postJson,
} from "./shared.mjs";

// Raw HTTP keeps the package dependency-free inside latency-sensitive hooks.
const DEFAULT_MODEL = "claude-sonnet-5";

export async function describe(input, { model, timeoutMs }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not set");
  const selectedModel = model ?? DEFAULT_MODEL;

  const data = await postJson(
    apiUrl(process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com", "v1/messages"),
    {
      label: "Anthropic Messages API",
      timeoutMs,
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: {
        model: selectedModel,
        max_tokens: 1200,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: formatAgentInput(input) }],
        output_config: {
          format: { type: "json_schema", schema: WHATIJUSTDID_SCHEMA },
        },
      },
    }
  );

  const text = data.content?.map((block) => block.text ?? "").join("") ?? "";
  return { ...parseAgentJson(text), model: selectedModel };
}
