import { parseSubject } from "./raw.mjs";
import {
  CHANGELOG_SCHEMA,
  SYSTEM_PROMPT,
  apiUrl,
  coerceModelJson,
  formatProviderInput,
  postJson,
} from "./shared.mjs";

// Local Ollama. No API key, no cloud. Zero-dependency raw HTTP.
const DEFAULT_MODEL = "llama3.2";

export async function describe(input, { model, timeoutMs }) {
  const data = await postJson(
    apiUrl(process.env.OLLAMA_HOST ?? "http://localhost:11434", "api/chat"),
    {
      label: "llama provider",
      timeoutMs,
      headers: {},
      body: {
        model: model ?? DEFAULT_MODEL,
        format: CHANGELOG_SCHEMA,
        stream: false,
        options: { temperature: 0 },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: formatProviderInput(input) },
        ],
      },
    }
  );

  const { type, title } = parseSubject(input.subject ?? "");
  return coerceModelJson(data.message?.content ?? "", { type, summary: title });
}
