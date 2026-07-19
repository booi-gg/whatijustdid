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

// DeepSeek's fast model keeps generation practical inside post-commit hooks.
const DEFAULT_MODEL = "deepseek-v4-flash";

export async function nameProject(input, { model, timeoutMs }) {
  const key = resolveApiKey("DEEPSEEK_API_KEY");
  if (!key) throw new Error("DEEPSEEK_API_KEY not set");
  const selectedModel = model ?? DEFAULT_MODEL;
  const data = await postJson(
    apiUrl(
      process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
      "chat/completions",
    ),
    {
      label: "DeepSeek Chat Completions API",
      timeoutMs,
      headers: { authorization: `Bearer ${key}` },
      body: {
        model: selectedModel,
        max_tokens: 300,
        temperature: 1,
        thinking: { type: "disabled" },
        messages: [
          {
            role: "system",
            content: `${projectNamePrompt()}\nThe required JSON schema is:\n${JSON.stringify(PROJECT_NAME_SCHEMA)}`,
          },
          { role: "user", content: formatProjectNameInput(input) },
        ],
        response_format: { type: "json_object" },
      },
    },
  );
  const text = data.choices?.[0]?.message?.content ?? "";
  return { name: parseProjectNameJson(text), model: selectedModel };
}

export async function describe(input, { model, timeoutMs, verbosity = "normal" }) {
  const key = resolveApiKey("DEEPSEEK_API_KEY");
  if (!key) throw new Error("DEEPSEEK_API_KEY not set");
  const selectedModel = model ?? DEFAULT_MODEL;
  const { maxTokens, maxSummaryChars } = verbosityConfig(verbosity);
  const systemPrompt = `${verbosityPrompt(verbosity)}
The required JSON schema is:
${JSON.stringify(WHATIJUSTDID_SCHEMA)}
Example JSON output:
{"type":"feat","changes":[{"type":"feat","summary":"Added a new user-facing capability."}]}`;

  const data = await postJson(
    apiUrl(process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com", "chat/completions"),
    {
      label: "DeepSeek Chat Completions API",
      timeoutMs,
      headers: { authorization: `Bearer ${key}` },
      body: {
        model: selectedModel,
        max_tokens: maxTokens,
        temperature: 0,
        thinking: { type: "disabled" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: formatAgentInput(input) },
        ],
        response_format: { type: "json_object" },
      },
    },
  );

  const text = data.choices?.[0]?.message?.content ?? "";
  const usage = data.usage
    ? { input: data.usage.prompt_tokens ?? 0, output: data.usage.completion_tokens ?? 0, total: data.usage.total_tokens ?? 0 }
    : null;
  return { ...parseAgentJson(text, { maxSummaryChars }), model: selectedModel, usage };
}
