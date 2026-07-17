import { parseSubject } from "./raw.mjs";
import {
  CHANGELOG_SCHEMA,
  SYSTEM_PROMPT,
  apiUrl,
  coerceModelJson,
  formatProviderInput,
  postJson,
} from "./shared.mjs";

// Raw HTTP keeps the package dependency-free inside latency-sensitive hooks.
const DEFAULT_MODEL = "claude-sonnet-5";

export async function describe(input, { model, timeoutMs }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("claude provider: ANTHROPIC_API_KEY not set");

  const data = await postJson(
    apiUrl(process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com", "v1/messages"),
    {
      label: "claude provider",
      timeoutMs,
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: {
        model: model ?? DEFAULT_MODEL,
        max_tokens: 1200,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: formatProviderInput(input) }],
        output_config: {
          format: { type: "json_schema", schema: CHANGELOG_SCHEMA },
        },
      },
    }
  );

  const text = data.content?.map((block) => block.text ?? "").join("") ?? "";
  const { type, title } = parseSubject(input.subject ?? "");
  return coerceModelJson(text, { type, summary: title });
}
