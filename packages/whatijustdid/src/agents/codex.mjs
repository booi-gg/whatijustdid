import {
  PROJECT_NAME_SCHEMA,
  WHATIJUSTDID_SCHEMA,
  apiUrl,
  formatAgentInput,
  formatProjectNameInput,
  parseAgentJson,
  parseProjectNameJson,
  postJson,
  postSseJson,
  projectNamePrompt,
  resolveApiKey,
  verbosityConfig,
  verbosityPrompt,
} from "./shared.mjs";

// "codex" is the package's OpenAI agent name. It uses the Responses API,
// not a ChatGPT/Codex subscription or local CLI session.
export const DEFAULT_MODEL = "gpt-5.4-mini";

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

export async function describe(
  input,
  { model, timeoutMs, verbosity = "normal", onOutputTextDelta },
) {
  const key = resolveApiKey("OPENAI_API_KEY");
  if (!key) throw new Error("OPENAI_API_KEY not set");
  const selectedModel = model ?? DEFAULT_MODEL;
  const { maxTokens, maxSummaryChars } = verbosityConfig(verbosity);
  const url = apiUrl(
    process.env.OPENAI_BASE_URL ?? "https://api.openai.com",
    "v1/responses",
  );
  const request = {
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
  };
  const requestOptions = {
    label: "OpenAI Responses API",
    timeoutMs,
    headers: { authorization: `Bearer ${key}` },
  };

  if (typeof onOutputTextDelta === "function") {
    return describeStreaming(url, requestOptions, request, {
      maxSummaryChars,
      onOutputTextDelta,
      selectedModel,
    });
  }

  const data = await postJson(url, { ...requestOptions, body: request });

  const text =
    data.output_text ??
    data.output
      ?.flatMap((item) => item.content ?? [])
      .filter((item) => item.type === "output_text")
      .map((item) => item.text ?? "")
      .join("") ??
    "";
  const usage = data.usage
    ? {
        input: data.usage.input_tokens ?? 0,
        output: data.usage.output_tokens ?? 0,
        total: data.usage.total_tokens ?? 0,
      }
    : null;
  return {
    ...parseAgentJson(text, { maxSummaryChars }),
    model: selectedModel,
    usage,
  };
}

async function describeStreaming(
  url,
  requestOptions,
  request,
  { maxSummaryChars, onOutputTextDelta, selectedModel },
) {
  let text = "";
  let completedResponse;
  for await (const event of postSseJson(url, {
    ...requestOptions,
    body: { ...request, stream: true },
  })) {
    if (event.type === "response.output_text.delta") {
      const delta = typeof event.delta === "string" ? event.delta : "";
      text += delta;
      if (delta) await onOutputTextDelta(delta);
      continue;
    }
    if (event.type === "response.output_text.done" && !text) {
      const delta = typeof event.text === "string" ? event.text : "";
      text = delta;
      if (delta) await onOutputTextDelta(delta);
      continue;
    }
    if (event.type === "response.completed") {
      completedResponse = event.response;
      continue;
    }
    if (event.type === "error" || event.type === "response.failed") {
      throw new Error(openAiStreamError(event));
    }
  }

  const usage = completedResponse?.usage
    ? {
        input: completedResponse.usage.input_tokens ?? 0,
        output: completedResponse.usage.output_tokens ?? 0,
        total: completedResponse.usage.total_tokens ?? 0,
      }
    : null;
  return {
    ...parseAgentJson(text, { maxSummaryChars }),
    model: selectedModel,
    usage,
  };
}

function openAiStreamError(event) {
  return (
    event.message ??
    event.error?.message ??
    event.response?.error?.message ??
    "OpenAI Responses API stream failed"
  );
}
