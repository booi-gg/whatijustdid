import { parseSubject } from "./raw.mjs";
import {
  CHANGELOG_SCHEMA,
  SYSTEM_PROMPT,
  apiUrl,
  coerceModelJson,
  formatProviderInput,
  postJson,
} from "./shared.mjs";

// "codex" is the package's OpenAI provider alias. It uses the Responses API,
// not a ChatGPT/Codex subscription or local CLI session.
const DEFAULT_MODEL = "gpt-5.4-mini";

export async function describe(input, { model, timeoutMs }) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("codex provider: OPENAI_API_KEY not set");

  const data = await postJson(
    apiUrl(process.env.OPENAI_BASE_URL ?? "https://api.openai.com", "v1/responses"),
    {
      label: "codex provider",
      timeoutMs,
      headers: { authorization: `Bearer ${key}` },
      body: {
        model: model ?? DEFAULT_MODEL,
        max_output_tokens: 1200,
        input: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: formatProviderInput(input) },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "changelog_entry",
            strict: true,
            schema: CHANGELOG_SCHEMA,
          },
        },
      },
    }
  );

  const text =
    data.output_text ??
    data.output
      ?.flatMap((item) => item.content ?? [])
      .filter((item) => item.type === "output_text")
      .map((item) => item.text ?? "")
      .join("") ??
    "";
  const { type, title } = parseSubject(input.subject ?? "");
  return coerceModelJson(text, { type, summary: title });
}
