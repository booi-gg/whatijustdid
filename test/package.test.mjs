import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));

test("packed package keeps AI summaries private and persistent", { timeout: 30_000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), "changetrail-package-"));
  let mockAgent = null;
  try {
    const packDirectory = join(root, "pack");
    const consumer = join(root, "consumer");
    const npmEnvironment = { npm_config_cache: join(root, "npm-cache") };
    mkdirSync(packDirectory);
    mkdirSync(consumer);

    const packed = JSON.parse(run("npm", [
      "pack",
      "--json",
      "--ignore-scripts",
      "--pack-destination",
      packDirectory,
    ], packageRoot, npmEnvironment));
    const manifest = packed[0];
    assert.equal(manifest.name, "changetrail");
    const paths = manifest.files.map((file) => file.path);
    assert.ok(paths.includes("assets/changetrail.html"));
    assert.ok(paths.includes("bin/changetrail.mjs"));
    assert.ok(paths.includes("src/store.mjs"));
    assert.equal(paths.some((path) => path.startsWith("test/")), false);

    run("git", ["init", "--quiet"], consumer);
    run("git", ["config", "user.name", "Package Test"], consumer);
    run("git", ["config", "user.email", "package@example.com"], consumer);
    writeFileSync(join(consumer, "package.json"), "{\"name\":\"consumer\",\"private\":true}\n");
    writeFileSync(join(consumer, ".gitignore"), "node_modules/\n");

    const tarball = join(packDirectory, manifest.filename);
    run("npm", [
      "install",
      "--save-dev",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      tarball,
    ], consumer, npmEnvironment);
    const cli = join(consumer, "node_modules", ".bin", "changetrail");
    const initOutput = run(cli, ["init"], consumer);
    assert.match(initOutput, /private database/);
    assert.equal(existsSync(join(consumer, ".git", "hooks", "pre-commit")), false);
    assert.match(
      readFileSync(join(consumer, ".git", "hooks", "post-commit"), "utf8"),
      /record --silent \|\| true[\s\S]*build --silent \|\| true/,
    );
    assert.equal(existsSync(join(consumer, "changetrail", "changetrail.html")), false);
    assert.equal(existsSync(join(consumer, ".git", "changetrail", "summaries.sqlite")), true);
    assert.deepEqual(
      JSON.parse(readFileSync(join(consumer, "changetrail.json"), "utf8")),
      {
        agent: "codex",
        model: null,
        dir: "changetrail",
        viewerLimit: 200,
        generationLimit: 50,
        maxDiffBytes: 80000,
        timeoutMs: 20000,
        projects: {},
      },
    );

    const previewModule = pathToFileURL(
      join(consumer, "node_modules", "changetrail", "src", "preview.mjs"),
    ).href;
    const { startPreview } = await import(previewModule);
    const preview = await startPreview(
      {
        root: consumer,
        dir: "changetrail",
        dataFile: join(consumer, "changetrail", "data.js"),
      },
      { open: false, port: 0 },
    );
    try {
      const response = await fetch(`${preview.url}/changetrail.html`);
      assert.equal(response.status, 200);
      assert.match(await response.text(), /Repository ledger/);
    } finally {
      await preview.close();
    }

    mockAgent = await startMockOpenAi();
    run("git", ["add", "."], consumer);
    run(
      "git",
      ["commit", "--quiet", "-m", "THIS MESSAGE MUST NOT BECOME THE SUMMARY"],
      consumer,
      { OPENAI_API_KEY: "test-key", OPENAI_BASE_URL: mockAgent.url },
    );

    const sha = run("git", ["rev-parse", "HEAD"], consumer).trim();
    const database = new DatabaseSync(join(consumer, ".git", "changetrail", "summaries.sqlite"));
    try {
      const row = database.prepare(
        "SELECT status, agent, model, changes_json FROM commit_summaries WHERE commit_sha = ?",
      ).get(sha);
      assert.equal(row.status, "ready");
      assert.equal(row.agent, "codex");
      assert.equal(row.model, "gpt-5.4-mini");
      assert.equal(
        JSON.parse(row.changes_json)[0].summary,
        "Initialized Changetrail from the committed code",
      );
    } finally {
      database.close();
    }

    const viewerData = readFileSync(join(consumer, "changetrail", "data.js"), "utf8");
    assert.match(viewerData, /Initialized Changetrail from the committed code/);
    assert.doesNotMatch(viewerData, /THIS MESSAGE MUST NOT BECOME THE SUMMARY/);
    assert.equal(run("git", ["ls-files", "changetrail"], consumer).trim(), "");
    assert.equal(run("git", ["status", "--short"], consumer).trim(), "");

    const scopePreview = run(cli, ["backfill"], consumer);
    assert.match(scopePreview, /no AI calls made/);
    assert.match(scopePreview, /choose a scope/);

    const sync = spawnSync(cli, ["sync"], { cwd: consumer, encoding: "utf8" });
    assert.equal(sync.status, 1);
    assert.match(sync.stderr, /Cloud sync is not available yet/);

    const unhookOutput = run(cli, ["unhook"], consumer);
    assert.match(unhookOutput, /removed hooks/);
    for (const name of ["post-commit", "post-merge", "post-checkout", "post-rewrite"]) {
      assert.equal(existsSync(join(consumer, ".git", "hooks", name)), false);
    }

    const hookOutput = run(cli, ["hook"], consumer);
    assert.match(hookOutput, /installed\/updated hooks/);
    for (const name of ["post-commit", "post-merge", "post-checkout", "post-rewrite"]) {
      assert.match(
        readFileSync(join(consumer, ".git", "hooks", name), "utf8"),
        /# >>> changetrail >>>/,
      );
    }
    assert.match(run(cli, ["hook"], consumer), /hooks already current/);
  } finally {
    mockAgent?.process.kill();
    rmSync(root, { recursive: true, force: true });
  }
});

async function startMockOpenAi() {
  const script = `
    const { createServer } = require("node:http");
    const output = JSON.stringify({
      type: "chore",
      changes: [{
        type: "chore",
        summary: "Initialized Changetrail from the committed code",
      }],
    });
    const server = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ output_text: output }));
    });
    server.listen(0, "127.0.0.1", () => {
      process.stdout.write(String(server.address().port) + "\\n");
    });
    process.on("SIGTERM", () => server.close(() => process.exit(0)));
  `;
  const child = spawn(process.execPath, ["-e", script], {
    stdio: ["ignore", "pipe", "inherit"],
  });
  const [chunk] = await once(child.stdout, "data");
  const port = String(chunk).trim();
  return { process: child, url: `http://127.0.0.1:${port}` };
}

function run(command, args, cwd, environment = {}) {
  return execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      npm_config_update_notifier: "false",
      ...environment,
    },
  });
}
