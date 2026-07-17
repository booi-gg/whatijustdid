import {
  WHATIJUSTDID_SCHEMA,
  SYSTEM_PROMPT,
  apiUrl,
  formatAgentInput,
  parseAgentJson,
  postJson,
} from "./shared.mjs";

// DeepSeek's fast model keeps generation practical inside post-commit hooks.
const DEFAULT_MODEL = "deepseek-v4-flash";
const JSON_SYSTEM_PROMPT = `${SYSTEM_PROMPT}
The required JSON schema is:
${JSON.stringify(WHATIJUSTDID_SCHEMA)}
Example JSON output:
{"type":"feat","changes":[{"type":"feat","summary":"Added a new user-facing capability."}]}`;

export async function describe(input, { model, timeoutMs }) {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error("DEEPSEEK_API_KEY not set");
  const selectedModel = model ?? DEFAULT_MODEL;

  const data = await postJson(
    apiUrl(process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com", "chat/completions"),
    {
      label: "DeepSeek Chat Completions API",
      timeoutMs,
      headers: { authorization: `Bearer ${key}` },
      body: {
        model: selectedModel,
        max_tokens: 1200,
        temperature: 0,
        thinking: { type: "disabled" },
        messages: [
          { role: "system", content: JSON_SYSTEM_PROMPT },
          { role: "user", content: formatAgentInput(input) },
        ],
        response_format: { type: "json_object" },
      },
    },
  );

  const text = data.choices?.[0]?.message?.content ?? "";
  return { ...parseAgentJson(text), model: selectedModel };
}
