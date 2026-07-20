import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  describe as describeWithOpenAI,
  nameProject as nameProjectWithOpenAI,
} from "../src/agents/codex.mjs";
import { describe as describeWithDeepSeek } from "../src/agents/deepseek.mjs";
import { getAgent } from "../src/agents/index.mjs";
import { WHATIJUSTDID_SCHEMA, parseAgentJson } from "../src/agents/shared.mjs";
import { ENV_PREFIX } from "../src/brand.mjs";
import { build } from "../src/build.mjs";
import { describeChange } from "../src/describe.mjs";
import { applyEntryEdit, editEntry } from "../src/edit.mjs";
import { generate, planGeneration } from "../src/generate.mjs";
import { projectsForFiles } from "../src/projects.mjs";
import { openSummaryStore } from "../src/store.mjs";

const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);
const SHA_C = "c".repeat(40);

test("maps one commit to every touched project", () => {
  assert.deepEqual(
    projectsForFiles(
      ["apps/main/src/a.ts", "packages/shared/src/b.ts", "README.md"],
      { web: ["apps/main"], shared: ["packages/shared"] },
    ),
    ["web", "shared"],
  );
});

test("normalizes agent JSON, requires a summary, and has no raw agent", () => {
  assert.deepEqual(
    parseAgentJson(
      JSON.stringify({
        type: "made-up",
        changes: [{ type: "fix", summary: " Fixed the retry loop. " }],
      }),
    ),
    {
      type: "fix",
      changes: [{ type: "fix", summary: "Fixed the retry loop." }],
    },
  );
  assert.throws(
    () => parseAgentJson("not json"),
    /Agent returned invalid JSON/,
  );
  assert.throws(
    () => parseAgentJson(JSON.stringify({ type: "feat", changes: [] })),
    /Agent returned no usable change summaries/,
  );
  assert.equal(getAgent("codex"), getAgent("openai"));
  assert.equal(typeof getAgent("deepseek").describe, "function");
  assert.throws(() => getAgent("raw"), /Unknown agent "raw"/);
});

test("repairs truncated JSON from max_tokens cut-off in changes array", () => {
  const complete = JSON.stringify({
    type: "feat",
    changes: [
      { type: "feat", summary: "Added a login form." },
      { type: "fix", summary: "Fixed the spinner animation." },
    ],
  });

  assert.deepEqual(parseAgentJson(complete), {
    type: "feat",
    changes: [
      { type: "feat", summary: "Added a login form." },
      { type: "fix", summary: "Fixed the spinner animation." },
    ],
  });

  const truncatedArray = complete.slice(0, -2);
  assert.deepEqual(parseAgentJson(truncatedArray), {
    type: "feat",
    changes: [
      { type: "feat", summary: "Added a login form." },
      { type: "fix", summary: "Fixed the spinner animation." },
    ],
  });

  const truncatedOuter = complete.slice(0, -1);
  assert.deepEqual(parseAgentJson(truncatedOuter), {
    type: "feat",
    changes: [
      { type: "feat", summary: "Added a login form." },
      { type: "fix", summary: "Fixed the spinner animation." },
    ],
  });
});

test("agent failure never falls back to commit-message text", async () => {
  const originalKey = process.env.OPENAI_API_KEY;
  const originalGenericKey = process.env[`${ENV_PREFIX}_AGENT_API_KEY`];
  delete process.env.OPENAI_API_KEY;
  delete process.env[`${ENV_PREFIX}_AGENT_API_KEY`];
  try {
    await assert.rejects(
      () =>
        describeChange(
          {
            subject: "feat: misleading fallback",
            body: "- Not an AI summary",
            files: ["feature.js"],
            diff: "+export const feature = true;",
          },
          { agent: "codex", model: null, timeoutMs: 100 },
        ),
      /Agent "codex" could not generate a summary: OPENAI_API_KEY not set/,
    );
  } finally {
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
    if (originalGenericKey === undefined)
      delete process.env[`${ENV_PREFIX}_AGENT_API_KEY`];
    else process.env[`${ENV_PREFIX}_AGENT_API_KEY`] = originalGenericKey;
  }
});

test("OpenAI defaults to the Codex model and receives code, not commit messages", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousGenericKey = process.env[`${ENV_PREFIX}_AGENT_API_KEY`];
  const previousFetch = globalThis.fetch;
  let request;
  process.env.OPENAI_API_KEY = "test-key";
  delete process.env[`${ENV_PREFIX}_AGENT_API_KEY`];
  globalThis.fetch = async (_url, options) => {
    request = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          type: "feat",
          changes: [{ type: "feat", summary: "Added a default model." }],
        }),
      }),
    };
  };

  try {
    await describeWithOpenAI(
      {
        subject: "SECRET COMMIT MESSAGE",
        files: ["feature.js"],
        diff: "+export const feature = true;",
      },
      { model: null, timeoutMs: 1000 },
    );
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
    if (previousGenericKey === undefined)
      delete process.env[`${ENV_PREFIX}_AGENT_API_KEY`];
    else process.env[`${ENV_PREFIX}_AGENT_API_KEY`] = previousGenericKey;
  }

  assert.equal(request.model, "gpt-5.4-mini");
  assert.match(JSON.stringify(request), /export const feature/);
  assert.doesNotMatch(JSON.stringify(request), /SECRET COMMIT MESSAGE/);
  assert.equal(request.reasoning, undefined);
});

test("OpenAI generates a structured dish name for first-time setup", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousFetch = globalThis.fetch;
  let request;
  process.env.OPENAI_API_KEY = "test-key";
  globalThis.fetch = async (_url, options) => {
    request = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({ output_text: '{"name":"Miso Katsu"}' }),
    };
  };

  let result;
  try {
    result = await nameProjectWithOpenAI(
      { randomCue: "Jollof Rice" },
      { model: null, timeoutMs: 1000 },
    );
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }

  assert.equal(result.name, "Miso Katsu");
  assert.equal(request.text.format.name, "project_name");
  assert.deepEqual(request.text.format.schema.required, ["name"]);
  assert.match(JSON.stringify(request.input), /Jollof Rice/);
});

test("DeepSeek uses its API key, fast model, and JSON output mode", async () => {
  const previousKey = process.env.DEEPSEEK_API_KEY;
  const previousGenericKey = process.env[`${ENV_PREFIX}_AGENT_API_KEY`];
  const previousBaseUrl = process.env.DEEPSEEK_BASE_URL;
  const previousFetch = globalThis.fetch;
  let url;
  let headers;
  let request;
  process.env.DEEPSEEK_API_KEY = "deepseek-test-key";
  delete process.env[`${ENV_PREFIX}_AGENT_API_KEY`];
  delete process.env.DEEPSEEK_BASE_URL;
  globalThis.fetch = async (requestUrl, options) => {
    url = requestUrl;
    headers = options.headers;
    request = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                type: "feat",
                changes: [
                  { type: "feat", summary: "Added DeepSeek summaries." },
                ],
              }),
            },
          },
        ],
      }),
    };
  };

  let result;
  try {
    result = await describeWithDeepSeek(
      {
        subject: "SECRET COMMIT MESSAGE",
        files: ["feature.js"],
        diff: "+export const deepseek = true;",
      },
      { model: null, timeoutMs: 1000 },
    );
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previousKey;
    if (previousGenericKey === undefined)
      delete process.env[`${ENV_PREFIX}_AGENT_API_KEY`];
    else process.env[`${ENV_PREFIX}_AGENT_API_KEY`] = previousGenericKey;
    if (previousBaseUrl === undefined) delete process.env.DEEPSEEK_BASE_URL;
    else process.env.DEEPSEEK_BASE_URL = previousBaseUrl;
  }

  assert.equal(url, "https://api.deepseek.com/chat/completions");
  assert.equal(headers.authorization, "Bearer deepseek-test-key");
  assert.equal(request.model, "deepseek-v4-flash");
  assert.deepEqual(request.response_format, { type: "json_object" });
  assert.deepEqual(request.thinking, { type: "disabled" });
  assert.match(JSON.stringify(request), /export const deepseek/);
  assert.match(request.messages[0].content, /"changes"/);
  assert.doesNotMatch(JSON.stringify(request), /SECRET COMMIT MESSAGE/);
  assert.equal(result.model, "deepseek-v4-flash");
});

test("DeepSeek reports its missing credential clearly", async () => {
  const previousKey = process.env.DEEPSEEK_API_KEY;
  const previousGenericKey = process.env[`${ENV_PREFIX}_AGENT_API_KEY`];
  delete process.env.DEEPSEEK_API_KEY;
  delete process.env[`${ENV_PREFIX}_AGENT_API_KEY`];
  try {
    await assert.rejects(
      () =>
        describeWithDeepSeek(
          { files: ["feature.js"], diff: "+export const deepseek = true;" },
          { model: null, timeoutMs: 100 },
        ),
      /DEEPSEEK_API_KEY not set/,
    );
  } finally {
    if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previousKey;
    if (previousGenericKey === undefined)
      delete process.env[`${ENV_PREFIX}_AGENT_API_KEY`];
    else process.env[`${ENV_PREFIX}_AGENT_API_KEY`] = previousGenericKey;
  }
});

test("uses a strict-agent-compatible structured output schema", () => {
  const changes = WHATIJUSTDID_SCHEMA.properties.changes;
  const summary = changes.items.properties.summary;
  assert.equal(changes.minItems, undefined);
  assert.equal(changes.maxItems, undefined);
  assert.equal(summary.minLength, undefined);
  assert.equal(summary.maxLength, undefined);
});

test("history generation requires an explicit scope and resumes ready commits", async () => {
  const root = mkdtempSync(join(tmpdir(), "whatijustdid-generate-"));
  const config = testConfig(root);
  const store = openSummaryStore(config);
  let calls = 0;
  const dependencies = {
    store,
    commitShas: () => [SHA_B, SHA_A],
    commitFiles: (sha) => [sha === SHA_A ? "apps/web/a.js" : "worker.js"],
    commitDiff: (sha) => `+export const value = '${sha[0]}';`,
    describeChange: async ({ diff }) => {
      calls++;
      return {
        type: "feat",
        changes: [
          { type: "feat", summary: `Generated from ${diff.slice(-4)}` },
        ],
        agent: "codex",
        model: "gpt-test",
      };
    },
  };
  try {
    await assert.rejects(
      () => generate(config, {}, dependencies),
      /Choose a generation scope/,
    );
    const plan = planGeneration(config, { limit: 2 }, dependencies);
    assert.equal(plan.commitsToGenerate, 2);
    assert.equal(plan.estimatedInputTokens, 50_000);

    const first = await generate(config, { limit: 2, plan }, dependencies);
    assert.equal(first.generated, 2);
    assert.equal(calls, 2);
    const resumedPlan = planGeneration(config, { limit: 2 }, dependencies);
    assert.equal(resumedPlan.commitsToGenerate, 0);
    const resumed = await generate(
      config,
      { limit: 2, plan: resumedPlan },
      dependencies,
    );
    assert.equal(resumed.generated, 0);
    assert.equal(calls, 2);
    await assert.rejects(
      () => generate(config, { all: true }, dependencies),
      /requires explicit confirmation/,
    );
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("build displays ready, pending, and missing summaries without commit-message text", () => {
  const root = mkdtempSync(join(tmpdir(), "whatijustdid-build-"));
  const config = testConfig(root);
  config.showTokens = true;
  const store = openSummaryStore(config);
  try {
    const lease = store.claim(SHA_A, { projects: ["web"], agent: "codex" });
    store.complete(SHA_A, lease, {
      type: "feat",
      changes: [{ type: "feat", summary: "AI summary from the code diff" }],
      agent: "codex",
      model: "gpt-test",
    });
    store.ensurePending(SHA_B, []);
    const commits = [
      {
        sha: SHA_C,
        shortSha: "ccccccc",
        author: "Carla",
        date: "2026-07-19T10:00:00.000Z",
        subject: "pulled commit message must never appear",
        additions: 54,
        deletions: 17,
        filesChanged: 4,
        linesChanged: 71,
      },
      {
        sha: SHA_B,
        shortSha: "bbbbbbb",
        author: "Bob",
        date: "2026-07-18T10:00:00.000Z",
        subject: "fix: must never appear",
        additions: 10,
        deletions: 2,
        filesChanged: 2,
        linesChanged: 12,
      },
      {
        sha: SHA_A,
        shortSha: "aaaaaaa",
        author: "Alice",
        date: "2026-07-17T10:00:00.000Z",
        body: "- Must also never appear",
        additions: 4,
        deletions: 1,
        filesChanged: 1,
        linesChanged: 5,
      },
    ];
    assert.equal(build(config, { store, commits }), 3);
    const output = readFileSync(config.dataFile, "utf8");
    assert.match(output, /AI summary from the code diff/);
    assert.match(output, /Summary is waiting to be generated/);
    assert.match(output, /"ref": "ccccccc"[\s\S]*?"description": "N\/A"/);
    assert.match(
      output,
      new RegExp(
        `"sha": "${SHA_C}"[\\s\\S]*?"status": "missing"[\\s\\S]*?"linesChanged": 71[\\s\\S]*?"agent": "codex"[\\s\\S]*?"model": "gpt-5\\.4-mini"[\\s\\S]*?"estimatedInputTokens": 1316`,
      ),
    );
    assert.match(output, /"maxOutputTokens": 1200/);
    assert.doesNotMatch(output, /must never appear/i);
    assert.match(
      output,
      /window\.__WHATIJUSTDID_PROJECT_NAME__ = "Miso Katsu"/,
    );
    assert.match(output, /window\.__WHATIJUSTDID_PROJECTS__ = \[\s+"web"/);
    assert.match(
      output,
      new RegExp(
        `window\\.__WHATIJUSTDID_META__ = \\{\\s+"databaseSizeBytes": ${store.sizeBytes()},\\s+"generationLimit": 50,\\s+"viewerLimit": 200\\s+\\}`,
      ),
    );
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("editing updates private SQLite without changing commit identity", () => {
  const root = mkdtempSync(join(tmpdir(), "whatijustdid-edit-"));
  const config = testConfig(root);
  const store = openSummaryStore(config);
  try {
    const lease = store.claim(SHA_A, { projects: ["web"], agent: "codex" });
    store.complete(SHA_A, lease, {
      type: "feat",
      changes: [{ type: "feat", summary: "Original" }],
      agent: "codex",
      model: "gpt-test",
    });
    const result = editEntry(config, SHA_A.slice(0, 8), {
      store,
      edit: (draft) => ({
        ...draft,
        type: "fix",
        projects: ["web", "worker"],
        changes: [{ type: "fix", summary: "Corrected local summary" }],
      }),
      now: () => new Date("2026-07-18T10:00:00.000Z"),
    });
    assert.equal(result.changed, true);
    assert.equal(result.entry.commitSha, SHA_A);
    assert.equal(result.entry.origin, "manual");
    assert.equal(
      store.getBySha(SHA_A).changes[0].summary,
      "Corrected local summary",
    );

    assert.throws(
      () =>
        applyEntryEdit(result.entry, {
          type: "invalid",
          projects: [],
          changes: [],
        }),
      /Invalid type/,
    );
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});

function testConfig(root) {
  return {
    root,
    projectName: "Miso Katsu",
    dbFile: join(root, ".git", "whatijustdid", "summaries.sqlite"),
    dataFile: join(root, "whatijustdid", "data.js"),
    viewerLimit: 200,
    maxDiffBytes: 80_000,
    projects: { web: ["apps/web"], worker: ["apps/worker"] },
    agent: "codex",
    model: null,
    timeoutMs: 100,
  };
}
