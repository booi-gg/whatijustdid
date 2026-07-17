import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { startPreview } from "../src/preview.mjs";

test("serves the bundled viewer with live reload", async () => {
  const root = mkdtempSync(join(tmpdir(), "whatijustdid-preview-"));
  const directory = join(root, "whatijustdid");
  const dataFile = join(directory, "data.js");
  mkdirSync(directory);
  writeFileSync(dataFile, "window.__CHANGELOG__ = [];\n");

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
    assert.match(htmlBody, /new EventSource\("\/__whatijustdid_live"\)/);

    const data = await fetch(`${preview.url}/data.js`);
    assert.equal(data.status, 200);
    assert.equal(await data.text(), "window.__CHANGELOG__ = [];\n");

    const events = new AbortController();
    const stream = await fetch(`${preview.url}/__whatijustdid_live`, {
      signal: events.signal,
    });
    const reader = stream.body.getReader();
    await reader.read();
    writeFileSync(dataFile, "window.__CHANGELOG__ = [1];\n");
    const message = await readUntil(reader, /event: reload/, 5_000);
    assert.match(message, /event: reload/);
    events.abort();
  } finally {
    await preview.close();
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
