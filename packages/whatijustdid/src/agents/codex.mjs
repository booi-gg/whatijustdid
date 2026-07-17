import {
  CHANGELOG_SCHEMA,
  apiUrl,
  formatAgentInput,
  parseAgentJson,
  postJson,
  verbosityConfig,
  verbosityPrompt,
} from "./shared.mjs";

// "codex" is the package's OpenAI agent name. It uses the Responses API,
// not a ChatGPT/Codex subscription or local CLI session.
const DEFAULT_MODEL = "gpt-5.4-mini";

export async function describe(input, { model, timeoutMs, verbosity = "normal" }) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not set");
  const selectedModel = model ?? DEFAULT_MODEL;
  const { maxTokens, maxSummaryChars } = verbosityConfig(verbosity);

  const data = await postJson(
    apiUrl(process.env.OPENAI_BASE_URL ?? "https://api.openai.com", "v1/responses"),
    {
      label: "OpenAI Responses API",
      timeoutMs,
      headers: { authorization: `Bearer ${key}` },
      body: {
        model: selectedModel,
        max_output_tokens: maxTokens,
        input: [
          { role: "system", content: verbosityPrompt(verbosity) },
          { role: "user", content: formatAgentInput(input) },
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
  return { ...parseAgentJson(text, { maxSummaryChars }), model: selectedModel };
}
