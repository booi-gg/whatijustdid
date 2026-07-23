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

// Raw HTTP keeps the package dependency-free inside latency-sensitive hooks.
export const DEFAULT_MODEL = "claude-sonnet-5";

export async function nameProject(input, { model, timeoutMs }) {
  const key = resolveApiKey("ANTHROPIC_API_KEY");
  if (!key) throw new Error("ANTHROPIC_API_KEY not set");
  const selectedModel = model ?? DEFAULT_MODEL;
  const data = await postJson(
    apiUrl(
      process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com",
      "v1/messages",
    ),
    {
      label: "Anthropic Messages API",
      timeoutMs,
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: {
        model: selectedModel,
        max_tokens: 300,
        system: projectNamePrompt(),
        messages: [{ role: "user", content: formatProjectNameInput(input) }],
        output_config: {
          format: { type: "json_schema", schema: PROJECT_NAME_SCHEMA },
        },
      },
    },
  );
  const text = data.content?.map((block) => block.text ?? "").join("") ?? "";
  return { name: parseProjectNameJson(text), model: selectedModel };
}

export async function describe(
  input,
  {
    model,
    timeoutMs,
    verbosity = "normal",
    purpose = "changelog",
    onOutputTextDelta,
  },
) {
  const key = resolveApiKey("ANTHROPIC_API_KEY");
  if (!key) throw new Error("ANTHROPIC_API_KEY not set");
  const selectedModel = model ?? DEFAULT_MODEL;
  const { maxTokens, maxSummaryChars } = verbosityConfig(verbosity);
  const url = apiUrl(
    process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com",
    "v1/messages",
  );
  const request = {
    model: selectedModel,
    max_tokens: maxTokens,
    system: verbosityPrompt(verbosity, purpose),
    messages: [{ role: "user", content: formatAgentInput(input) }],
    output_config: {
      format: { type: "json_schema", schema: WHATIJUSTDID_SCHEMA },
    },
  };
  const requestOptions = {
    label: "Anthropic Messages API",
    timeoutMs,
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
  };

  if (typeof onOutputTextDelta === "function") {
    return describeStreaming(url, requestOptions, request, {
      maxSummaryChars,
      onOutputTextDelta,
      selectedModel,
    });
  }

  const data = await postJson(url, { ...requestOptions, body: request });

  const text = data.content?.map((block) => block.text ?? "").join("") ?? "";
  const usage = data.usage
    ? {
        input: data.usage.input_tokens ?? 0,
        output: data.usage.output_tokens ?? 0,
        total: (data.usage.input_tokens ?? 0) + (data.usage.output_tokens ?? 0),
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
  let inputTokens = 0;
  let outputTokens = 0;
  let hasUsage = false;
  for await (const event of postSseJson(url, {
    ...requestOptions,
    body: { ...request, stream: true },
  })) {
    if (
      event.type === "content_block_delta" &&
      event.delta?.type === "text_delta"
    ) {
      const delta =
        typeof event.delta.text === "string" ? event.delta.text : "";
      text += delta;
      if (delta) await onOutputTextDelta(delta);
      continue;
    }
    if (event.type === "message_start") {
      if (event.message?.usage) {
        hasUsage = true;
        inputTokens = event.message.usage.input_tokens ?? inputTokens;
        outputTokens = event.message.usage.output_tokens ?? outputTokens;
      }
      continue;
    }
    if (event.type === "message_delta") {
      if (event.usage) {
        hasUsage = true;
        outputTokens = event.usage.output_tokens ?? outputTokens;
      }
      continue;
    }
    if (event.type === "error") {
      throw new Error(
        event.error?.message ?? "Anthropic Messages API stream failed",
      );
    }
  }

  return {
    ...parseAgentJson(text, { maxSummaryChars }),
    model: selectedModel,
    usage: hasUsage
      ? {
          input: inputTokens,
          output: outputTokens,
          total: inputTokens + outputTokens,
        }
      : null,
  };
}
