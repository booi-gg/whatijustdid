import {
  PROJECT_NAME_SCHEMA,
  WHATIJUSTDID_SCHEMA,
  apiUrl,
  formatAgentInput,
  formatProjectNameInput,
  parseAgentJson,
  parseProjectNameJson,
  postNdjson,
  postJson,
  projectNamePrompt,
  verbosityConfig,
  verbosityPrompt,
} from "./shared.mjs";

// Local Ollama. No API key, no cloud, and no runtime dependency.
export const DEFAULT_MODEL = "llama3.2";

export async function nameProject(input, { model, timeoutMs }) {
  const selectedModel = model ?? DEFAULT_MODEL;
  const data = await postJson(
    apiUrl(process.env.OLLAMA_HOST ?? "http://localhost:11434", "api/chat"),
    {
      label: "Ollama API",
      timeoutMs,
      headers: {},
      body: {
        model: selectedModel,
        format: PROJECT_NAME_SCHEMA,
        stream: false,
        options: { temperature: 1 },
        messages: [
          { role: "system", content: projectNamePrompt() },
          { role: "user", content: formatProjectNameInput(input) },
        ],
      },
    },
  );
  return {
    name: parseProjectNameJson(data.message?.content ?? ""),
    model: selectedModel,
  };
}

export async function describe(
  input,
  { model, timeoutMs, verbosity = "normal", onOutputTextDelta },
) {
  const selectedModel = model ?? DEFAULT_MODEL;
  const { maxSummaryChars } = verbosityConfig(verbosity);
  const url = apiUrl(
    process.env.OLLAMA_HOST ?? "http://localhost:11434",
    "api/chat",
  );
  const request = {
    model: selectedModel,
    format: WHATIJUSTDID_SCHEMA,
    options: { temperature: 0 },
    messages: [
      { role: "system", content: verbosityPrompt(verbosity) },
      { role: "user", content: formatAgentInput(input) },
    ],
  };
  const requestOptions = {
    label: "Ollama API",
    timeoutMs,
    headers: {},
  };

  if (typeof onOutputTextDelta === "function") {
    return describeStreaming(url, requestOptions, request, {
      maxSummaryChars,
      onOutputTextDelta,
      selectedModel,
    });
  }

  const data = await postJson(url, {
    ...requestOptions,
    body: { ...request, stream: false },
  });

  const usage =
    typeof data.prompt_eval_count === "number" ||
    typeof data.eval_count === "number"
      ? {
          input: data.prompt_eval_count ?? 0,
          output: data.eval_count ?? 0,
          total: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
        }
      : null;
  return {
    ...parseAgentJson(data.message?.content ?? "", { maxSummaryChars }),
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
  let usage = null;
  for await (const event of postNdjson(url, {
    ...requestOptions,
    body: { ...request, stream: true },
  })) {
    if (event.error) throw new Error(`Ollama API: ${event.error}`);
    const delta = event.message?.content;
    if (typeof delta === "string" && delta) {
      text += delta;
      await onOutputTextDelta(delta);
    }
    if (event.done) {
      usage =
        typeof event.prompt_eval_count === "number" ||
        typeof event.eval_count === "number"
          ? {
              input: event.prompt_eval_count ?? 0,
              output: event.eval_count ?? 0,
              total: (event.prompt_eval_count ?? 0) + (event.eval_count ?? 0),
            }
          : null;
    }
  }

  return {
    ...parseAgentJson(text, { maxSummaryChars }),
    model: selectedModel,
    usage,
  };
}
