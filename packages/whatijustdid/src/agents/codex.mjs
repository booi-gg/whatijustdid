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

// "codex" is the package's OpenAI agent name. It uses the Responses API,
// not a ChatGPT/Codex subscription or local CLI session.
const DEFAULT_MODEL = "gpt-5.4-mini";

export async function nameProject(input, { model, timeoutMs }) {
  const key = resolveApiKey("OPENAI_API_KEY");
  if (!key) throw new Error("OPENAI_API_KEY not set");
  const selectedModel = model ?? DEFAULT_MODEL;
  const data = await postJson(
    apiUrl(
      process.env.OPENAI_BASE_URL ?? "https://api.openai.com",
      "v1/responses",
    ),
    {
      label: "OpenAI Responses API",
      timeoutMs,
      headers: { authorization: `Bearer ${key}` },
      body: {
        model: selectedModel,
        max_output_tokens: 300,
        input: [
          { role: "system", content: projectNamePrompt() },
          { role: "user", content: formatProjectNameInput(input) },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "project_name",
            strict: true,
            schema: PROJECT_NAME_SCHEMA,
          },
        },
      },
    },
  );
  const text =
    data.output_text ??
    data.output
      ?.flatMap((item) => item.content ?? [])
      .filter((item) => item.type === "output_text")
      .map((item) => item.text ?? "")
      .join("") ??
    "";
  return { name: parseProjectNameJson(text), model: selectedModel };
}

export async function describe(input, { model, timeoutMs, verbosity = "normal" }) {
  const key = resolveApiKey("OPENAI_API_KEY");
  if (!key) throw new Error("OPENAI_API_KEY not set");
  const selectedModel = model ?? DEFAULT_MODEL;
  const { maxTokens, maxSummaryChars } = verbosityConfig(verbosity);

  const data = await postJson(
    apiUrl(
      process.env.OPENAI_BASE_URL ?? "https://api.openai.com",
      "v1/responses",
    ),
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
            schema: WHATIJUSTDID_SCHEMA,
          },
        },
      },
    },
  );

  const text =
    data.output_text ??
    data.output
      ?.flatMap((item) => item.content ?? [])
      .filter((item) => item.type === "output_text")
      .map((item) => item.text ?? "")
      .join("") ??
    "";
  const usage = data.usage
    ? { input: data.usage.input_tokens ?? 0, output: data.usage.output_tokens ?? 0, total: data.usage.total_tokens ?? 0 }
    : null;
  return { ...parseAgentJson(text, { maxSummaryChars }), model: selectedModel, usage };
}
