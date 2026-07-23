import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { startPreview } from "../src/preview.mjs";

const COMMIT_SHA = "a".repeat(40);
const READY_GROUP = {
  kind: "commit",
  sha: COMMIT_SHA,
  ref: "aaaaaaa",
  author: "Ada",
  date: "2026-07-20T10:00:00.000Z",
  status: "ready",
  projects: [],
  entries: [
    { letter: "", tags: ["feat"], description: "Added streaming summaries." },
  ],
};
const VIEWER_SNAPSHOT = {
  databaseSizeBytes: 4096,
  generationLimit: 50,
  groups: [READY_GROUP],
  projectName: "Miso Katsu",
  projectNames: ["All", "Repo"],
  viewerLimit: 200,
};

test("serves the bundled viewer with live data updates", async () => {
  const root = mkdtempSync(join(tmpdir(), "whatijustdid-preview-"));
  const directory = join(root, "whatijustdid");
  const dataFile = join(directory, "data.js");
  mkdirSync(directory);
  writeFileSync(dataFile, "window.__WHATIJUSTDID__ = [];\n");

  let clearCalls = 0;
  let generatedSha = null;
  let backfillLimit = null;
  let backfillCalls = 0;
  const preview = await startPreview(
    { root, dir: "whatijustdid", dataFile, viewerLimit: 200 },
    { open: false, port: 0 },
    {
      clearHistory: () => {
        clearCalls++;
        return { cleared: 2, viewerEntries: 0 };
      },
      planGeneration: (_config, options) => {
        backfillLimit = options.limit;
        return {
          selectedCommits: options.limit,
          candidateShas: [COMMIT_SHA],
        };
      },
      generate: async (_config, options) => {
        backfillCalls++;
        assert.equal(options.plan.candidateShas[0], COMMIT_SHA);
        assert.equal(options.continueOnError, true);
        return { generated: 1, skipped: 0, failures: [] };
      },
      build: () => 1,
      commitShas: () => [COMMIT_SHA],
      readViewerSnapshot: () => VIEWER_SNAPSHOT,
      recordCommittedChange: async (_config, _dependencies, options) => {
        generatedSha = options.sha;
        options.onOutputTextDelta(
          '{"type":"feat","changes":[{"type":"feat","summary":"Added ',
        );
        options.onOutputTextDelta('streaming summaries."}]}');
        return { created: true, reason: "generated" };
      },
    },
  );
  try {
    const redirect = await fetch(preview.url, { redirect: "manual" });
    assert.equal(redirect.status, 302);
    assert.equal(redirect.headers.get("location"), "/whatijustdid.html");

    const html = await fetch(`${preview.url}/whatijustdid.html`);
    assert.equal(html.status, 200);
    const htmlBody = await html.text();
    assert.match(htmlBody, /<title>whatijustdid · Changelog<\/title>/);
    assert.match(htmlBody, /src="\.\/whatijustdid\.js"/);
    assert.match(htmlBody, /new EventSource\("\/__whatijustdid_live"\)/);
    const token = htmlBody.match(
      /name="whatijustdid-action-token"\s+content="([^"]+)"/,
    )?.[1];
    assert.equal(typeof token, "string");
    assert.notEqual(token, "__WHATIJUSTDID_ACTION_TOKEN__");

    const unauthorized = await fetch(
      `${preview.url}/api/actions/clear-history`,
      {
        method: "POST",
        headers: { "X-Whatijustdid-Confirm": "clear-history" },
      },
    );
    assert.equal(unauthorized.status, 403);

    const unconfirmed = await fetch(
      `${preview.url}/api/actions/clear-history`,
      {
        method: "POST",
        headers: { "X-Whatijustdid-Action-Token": token },
      },
    );
    assert.equal(unconfirmed.status, 400);

    const cleared = await fetch(`${preview.url}/api/actions/clear-history`, {
      method: "POST",
      headers: {
        "X-Whatijustdid-Action-Token": token,
        "X-Whatijustdid-Confirm": "clear-history",
      },
    });
    assert.equal(cleared.status, 200);
    assert.deepEqual(await cleared.json(), { cleared: 2, viewerEntries: 0 });
    assert.equal(clearCalls, 1);

    const unauthorizedBackfill = await fetch(
      `${preview.url}/api/actions/backfill`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Whatijustdid-Confirm": "backfill",
        },
        body: JSON.stringify({ limit: 12 }),
      },
    );
    assert.equal(unauthorizedBackfill.status, 403);

    const unconfirmedBackfill = await fetch(
      `${preview.url}/api/actions/backfill`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Whatijustdid-Action-Token": token,
        },
        body: JSON.stringify({ limit: 12 }),
      },
    );
    assert.equal(unconfirmedBackfill.status, 400);

    const invalidBackfill = await fetch(`${preview.url}/api/actions/backfill`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Whatijustdid-Action-Token": token,
        "X-Whatijustdid-Confirm": "backfill",
      },
      body: JSON.stringify({ limit: 201 }),
    });
    assert.equal(invalidBackfill.status, 400);

    const backfilled = await fetch(`${preview.url}/api/actions/backfill`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Whatijustdid-Action-Token": token,
        "X-Whatijustdid-Confirm": "backfill",
      },
      body: JSON.stringify({ limit: 12 }),
    });
    assert.equal(backfilled.status, 200);
    assert.deepEqual(await backfilled.json(), {
      selectedCommits: 12,
      generated: 1,
      skipped: 0,
      failed: 0,
      viewerEntries: 1,
    });
    assert.equal(backfillLimit, 12);
    assert.equal(backfillCalls, 1);

    const unauthorizedGeneration = await fetch(
      `${preview.url}/api/actions/generate-summary/${COMMIT_SHA}`,
      { method: "POST" },
    );
    assert.equal(unauthorizedGeneration.status, 403);

    const staleGeneration = await fetch(
      `${preview.url}/api/actions/generate-summary/${"b".repeat(40)}`,
      {
        method: "POST",
        headers: { "X-Whatijustdid-Action-Token": token },
      },
    );
    assert.equal(staleGeneration.status, 404);

    const generated = await fetch(
      `${preview.url}/api/actions/generate-summary/${COMMIT_SHA}`,
      {
        method: "POST",
        headers: { "X-Whatijustdid-Action-Token": token },
      },
    );
    assert.equal(generated.status, 200);
    assert.match(
      generated.headers.get("content-type"),
      /^application\/x-ndjson/,
    );
    const generationEvents = (await generated.text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.deepEqual(
      generationEvents.map((event) => event.type),
      ["started", "draft", "draft", "complete"],
    );
    assert.deepEqual(generationEvents[2].changes, [
      "Added streaming summaries.",
    ]);
    assert.deepEqual(generationEvents[3].group, READY_GROUP);
    assert.equal(generationEvents[3].viewerEntries, 1);
    assert.equal(generatedSha, COMMIT_SHA);

    const viewerModel = await fetch(`${preview.url}/api/viewer-model`);
    assert.equal(viewerModel.status, 200);
    assert.deepEqual(await viewerModel.json(), VIEWER_SNAPSHOT);

    const script = await fetch(`${preview.url}/whatijustdid.js`);
    assert.equal(script.status, 200);
    assert.match(script.headers.get("content-type"), /^text\/javascript/);
    assert.match(await script.text(), /Repository ledger/);

    const data = await fetch(`${preview.url}/data.js`);
    assert.equal(data.status, 200);
    assert.equal(await data.text(), "window.__WHATIJUSTDID__ = [];\n");

    const events = new AbortController();
    const stream = await fetch(`${preview.url}/__whatijustdid_live`, {
      signal: events.signal,
    });
    const reader = stream.body.getReader();
    await reader.read();
    writeFileSync(dataFile, "window.__WHATIJUSTDID__ = [1];\n");
    const message = await readUntil(reader, /event: data/, 5_000);
    assert.match(message, /event: data/);
    events.abort();
  } finally {
    await preview.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("streams a readable draft before generation completes", async () => {
  const root = mkdtempSync(join(tmpdir(), "whatijustdid-preview-stream-"));
  const directory = join(root, "whatijustdid");
  const dataFile = join(directory, "data.js");
  mkdirSync(directory);
  writeFileSync(dataFile, "window.__WHATIJUSTDID__ = [];\n");

  let finishGeneration;
  const generationGate = new Promise((resolve) => {
    finishGeneration = resolve;
  });
  const preview = await startPreview(
    { root, dir: "whatijustdid", dataFile, viewerLimit: 200 },
    { open: false, port: 0 },
    {
      build: () => 1,
      commitShas: () => [COMMIT_SHA],
      readViewerSnapshot: () => VIEWER_SNAPSHOT,
      recordCommittedChange: async (_config, _dependencies, options) => {
        options.onOutputTextDelta(
          '{"type":"feat","changes":[{"type":"feat","summary":"Visible now',
        );
        await generationGate;
        options.onOutputTextDelta('."}]}');
        return { created: true, reason: "generated" };
      },
    },
  );

  try {
    const html = await fetch(`${preview.url}/whatijustdid.html`);
    const token = (await html.text()).match(
      /name="whatijustdid-action-token"\s+content="([^"]+)"/,
    )?.[1];
    const generated = await fetch(
      `${preview.url}/api/actions/generate-summary/${COMMIT_SHA}`,
      {
        method: "POST",
        headers: { "X-Whatijustdid-Action-Token": token },
      },
    );
    const reader = generated.body.getReader();
    const draft = await readUntil(reader, /"type":"draft"/, 5_000);
    assert.match(draft, /"changes":\["Visible now"\]/);
    assert.doesNotMatch(draft, /"type":"complete"/);

    finishGeneration();
    const complete = await readUntil(reader, /"type":"complete"/, 5_000);
    assert.match(complete, /"type":"complete"/);
  } finally {
    finishGeneration();
    await preview.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("falls back to a free port when the default port is busy", async () => {
  const root = mkdtempSync(join(tmpdir(), "whatijustdid-preview-"));
  const directory = join(root, "whatijustdid");
  const dataFile = join(directory, "data.js");
  mkdirSync(directory);
  writeFileSync(dataFile, "window.__WHATIJUSTDID__ = [];\n");

  /* Occupy the default port; if another process already holds it, that
     serves the same purpose and the fallback is exercised either way. */
  const blocker = createServer(() => {});
  await new Promise((resolve, reject) => {
    blocker.once("error", (error) =>
      error.code === "EADDRINUSE" ? resolve() : reject(error),
    );
    blocker.once("listening", resolve);
    blocker.listen(9453, "127.0.0.1");
  });

  const preview = await startPreview(
    { root, dir: "whatijustdid", dataFile },
    { open: false },
  );
  try {
    assert.notEqual(new URL(preview.url).port, "9453");
    const redirect = await fetch(preview.url, { redirect: "manual" });
    assert.equal(redirect.status, 302);
  } finally {
    await preview.close();
    blocker.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects an explicitly requested port that is busy", async () => {
  const root = mkdtempSync(join(tmpdir(), "whatijustdid-preview-"));
  const directory = join(root, "whatijustdid");
  const dataFile = join(directory, "data.js");
  mkdirSync(directory);
  writeFileSync(dataFile, "window.__WHATIJUSTDID__ = [];\n");

  const blocker = createServer(() => {});
  await new Promise((resolve, reject) => {
    blocker.once("error", reject);
    blocker.once("listening", resolve);
    blocker.listen(0, "127.0.0.1");
  });
  const busyPort = blocker.address().port;

  try {
    await assert.rejects(
      startPreview(
        { root, dir: "whatijustdid", dataFile },
        { open: false, port: busyPort },
      ),
      new RegExp(`Port ${busyPort} is already in use`),
    );
  } finally {
    blocker.close();
    rmSync(root, { recursive: true, force: true });
  }
});

async function readUntil(reader, pattern, timeoutMs) {
  let value = "";
  let timeout;
  try {
    return await Promise.race([
      (async () => {
        while (!pattern.test(value)) {
          const chunk = await reader.read();
          if (chunk.done) break;
          value += new TextDecoder().decode(chunk.value);
        }
        return value;
      })(),
      new Promise((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("Timed out waiting for reload")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}
