import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { startPreview } from "../src/preview.mjs";

test("serves the bundled viewer with live reload", async () => {
  const root = mkdtempSync(join(tmpdir(), "whatijustdid-preview-"));
  const directory = join(root, "whatijustdid");
  const dataFile = join(directory, "data.js");
  mkdirSync(directory);
  writeFileSync(dataFile, "window.__WHATIJUSTDID__ = [];\n");

  const preview = await startPreview(
    { root, dir: "whatijustdid", dataFile },
    { open: false, port: 0 },
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
    const message = await readUntil(reader, /event: reload/, 5_000);
    assert.match(message, /event: reload/);
    events.abort();
  } finally {
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
      error.code === "EADDRINUSE" ? resolve() : reject(error));
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
