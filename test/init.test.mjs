import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadConfig } from "../src/config.mjs";
import { initializeProject } from "../src/init.mjs";

test("initializes consumer files without overwriting user-owned assets", () => {
  const root = mkdtempSync(join(tmpdir(), "changetrail-init-"));
  try {
    writeFileSync(join(root, ".gitignore"), "node_modules/\n");
    const config = consumerConfig(root);
    const first = initializeProject(config);

    assert.deepEqual(first.created.sort(), [
      "changetrail.json",
      "changetrail/changetrail.html",
      "changetrail/db/.gitkeep",
    ]);
    assert.deepEqual(first.updated, [".gitignore"]);
    assert.deepEqual(
      JSON.parse(readFileSync(join(root, "changetrail.json"), "utf8")),
      {
        provider: "openai",
        model: "gpt-5.4-mini",
        dir: "changetrail",
        limit: 200,
        maxDiffBytes: 80000,
        timeoutMs: 20000,
        projects: {},
      },
    );
    const viewerPath = join(root, "changetrail", "changetrail.html");
    const viewer = readFileSync(viewerPath, "utf8");
    assert.match(viewer, /<title>Changetrail · Changelog<\/title>/);
    assert.match(viewer, /<link rel="icon" href="data:image\/svg\+xml;base64,/);
    assert.match(viewer, /<span class="brand-name">changetrail<\/span>/);
    assert.match(viewer, /\.day-heading::before\s*\{/);
    assert.match(viewer, /\.day:last-child::before \{ bottom: 0; \}/);
    assert.match(viewer, /Change,<br>recorded\./);
    assert.match(viewer, /<script src="\.\/data\.js"><\/script>/);
    assert.equal(
      readFileSync(join(root, ".gitignore"), "utf8"),
      "node_modules/\n\n" +
        "# >>> changetrail >>>\n" +
        "/changetrail/data.js\n" +
        "/changetrail/changetrail.local.json\n" +
        "# <<< changetrail <<<\n",
    );

    writeFileSync(viewerPath, "custom viewer\n");
    const second = initializeProject(config);
    assert.equal(readFileSync(viewerPath, "utf8"), "custom viewer\n");
    assert.equal(second.created.length, 0);
    assert.equal(second.updated.length, 0);

    const forced = initializeProject(config, { force: true });
    assert.deepEqual(forced.updated, ["changetrail/changetrail.html"]);
    assert.match(readFileSync(viewerPath, "utf8"), /Repository ledger/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("uses the configured directory in generated ignore rules", () => {
  const root = mkdtempSync(join(tmpdir(), "changetrail-custom-dir-"));
  try {
    const configPath = join(root, "changetrail.json");
    writeFileSync(configPath, "{}\n");
    initializeProject({
      ...consumerConfig(root),
      dir: "docs/changes",
      dbDir: join(root, "docs", "changes", "db"),
      dataFile: join(root, "docs", "changes", "data.js"),
      configPath,
      isDefaultConfig: false,
    });

    assert.match(
      readFileSync(join(root, ".gitignore"), "utf8"),
      /\/docs\/changes\/data\.js/,
    );
    assert.equal(readFileSync(configPath, "utf8"), "{}\n");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("loads OpenAI defaults without leaking its model into another provider", () => {
  const root = mkdtempSync(join(tmpdir(), "changetrail-config-"));
  try {
    const defaults = loadConfig({ root, env: {} });
    assert.equal(defaults.provider, "openai");
    assert.equal(defaults.model, "gpt-5.4-mini");

    writeFileSync(join(root, "changetrail.json"), '{"provider":"claude"}\n');
    const sharedOverride = loadConfig({ root, env: {} });
    assert.equal(sharedOverride.provider, "claude");
    assert.equal(sharedOverride.model, null);

    const environmentOverride = loadConfig({
      root,
      env: { CHANGELOG_PROVIDER: "llama" },
    });
    assert.equal(environmentOverride.provider, "llama");
    assert.equal(environmentOverride.model, null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function consumerConfig(root) {
  return {
    root,
    dir: "changetrail",
    dbDir: join(root, "changetrail", "db"),
    dataFile: join(root, "changetrail", "data.js"),
    configPath: null,
    isDefaultConfig: true,
  };
}
