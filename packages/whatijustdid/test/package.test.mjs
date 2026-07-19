import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CLI_NAME, ENV_PREFIX } from "../src/brand.mjs";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));

test("packed package keeps AI summaries private and persistent", { timeout: 60_000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), "whatijustdid-package-"));
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
    assert.equal(manifest.name, "whatijustdid");
    const paths = manifest.files.map((file) => file.path);
    assert.ok(paths.includes("assets/whatijustdid.html"));
    assert.ok(paths.includes("assets/whatijustdid.css"));
    assert.ok(paths.includes("assets/whatijustdid.js"));
    assert.ok(paths.includes("bin/cli.mjs"));
    assert.ok(paths.includes("src/clear.mjs"));
    assert.ok(paths.includes("src/store.mjs"));
    assert.ok(paths.includes("whatijustdid.json"));
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
    const cli = join(consumer, "node_modules", ".bin", "whatijustdid");
    mockAgent = await startMockOpenAi();
    const initOutput = run(cli, ["init", "--no-preview"], consumer, {
      OPENAI_API_KEY: "test-key",
      OPENAI_BASE_URL: mockAgent.url,
    });
    assert.match(initOutput, /private database/);
    assert.match(initOutput, /named this project Jollof Rice with codex/);
    assert.equal(existsSync(join(consumer, ".git", "hooks", "pre-commit")), false);
    assert.match(
      readFileSync(join(consumer, ".git", "hooks", "post-commit"), "utf8"),
      /nohup.*record --silent.*>\/dev\/null.*&/,
    );
    assert.equal(existsSync(join(consumer, "whatijustdid")), false);
    assert.equal(existsSync(join(consumer, ".git", "whatijustdid", "summaries.sqlite")), true);
    assert.deepEqual(
      JSON.parse(readFileSync(join(consumer, "whatijustdid.json"), "utf8")),
      {
        projectName: "Jollof Rice",
        agent: "codex",
        model: null,
        verbosity: "normal",
        viewerLimit: 200,
        generationLimit: 50,
        showTokens: false,
        maxDiffBytes: 80000,
        timeoutMs: 20000,
        projects: {},
      },
    );

    const previewModule = pathToFileURL(
      join(consumer, "node_modules", manifest.name, "src", "preview.mjs"),
    ).href;
    const { startPreview } = await import(previewModule);
    const preview = await startPreview(
      {
        root: consumer,
        dataFile: join(consumer, ".git", "whatijustdid", "data.js"),
      },
      { open: false, port: 0 },
    );
    try {
      const response = await fetch(`${preview.url}/whatijustdid.html`);
      assert.equal(response.status, 200);
      assert.match(await response.text(), /src="\.\/whatijustdid\.js"/);
      const script = await fetch(`${preview.url}/whatijustdid.js`);
      assert.equal(script.status, 200);
      assert.match(await script.text(), /Repository ledger/);
    } finally {
      await preview.close();
    }

    run("git", ["add", "."], consumer);
    const successfulCommit = spawnSync(
      "git",
      ["commit", "--quiet", "-m", "THIS MESSAGE MUST NOT BECOME THE SUMMARY"],
      {
        cwd: consumer,
        encoding: "utf8",
        env: {
          ...process.env,
          NO_COLOR: "1",
          [`${ENV_PREFIX}_AGENT`]: undefined,
          [`${ENV_PREFIX}_MODEL`]: undefined,
          [`${ENV_PREFIX}_AGENT_API_KEY`]: undefined,
          OPENAI_API_KEY: "test-key",
          OPENAI_BASE_URL: mockAgent.url,
        },
      },
    );
    assert.equal(successfulCommit.status, 0);
    // The hook spawns record in the background, so the commit output stays
    // quiet and the summary lands shortly after the commit returns.
    assert.doesNotMatch(successfulCommit.stderr, /saved an AI summary/);

    const sha = run("git", ["rev-parse", "HEAD"], consumer).trim();
    const summariesDb = join(consumer, ".git", "whatijustdid", "summaries.sqlite");
    const row = await waitFor(() => {
      const database = new DatabaseSync(summariesDb);
      try {
        const found = database.prepare(
          "SELECT status, agent, model, changes_json FROM commit_summaries WHERE commit_sha = ?",
        ).get(sha);
        return found && found.status !== "generating" ? found : null;
      } finally {
        database.close();
      }
    });
    assert.equal(row.status, "ready");
    assert.equal(row.agent, "codex");
    assert.equal(row.model, "gpt-5.4-mini");
    assert.equal(
      JSON.parse(row.changes_json)[0].summary,
      "Initialized whatijustdid from the committed code",
    );

    const viewerDataFile = join(consumer, ".git", "whatijustdid", "data.js");
    let viewerData = await waitFor(() => {
      const data = readFileSync(viewerDataFile, "utf8");
      return /Initialized whatijustdid from the committed code/.test(data) ? data : null;
    });
    assert.doesNotMatch(viewerData, /THIS MESSAGE MUST NOT BECOME THE SUMMARY/);
    assert.equal(existsSync(join(consumer, "whatijustdid")), false);
    assert.equal(run("git", ["status", "--short"], consumer).trim(), "");

    writeFileSync(join(consumer, "failed.js"), "export const failed = true;\n");
    run("git", ["add", "failed.js"], consumer);
    const failedCommit = spawnSync(
      "git",
      ["commit", "--quiet", "-m", "failure remains visible"],
      {
        cwd: consumer,
        encoding: "utf8",
        env: {
          ...process.env,
          NO_COLOR: "1",
          [`${ENV_PREFIX}_AGENT`]: undefined,
          [`${ENV_PREFIX}_MODEL`]: undefined,
          [`${ENV_PREFIX}_AGENT_API_KEY`]: undefined,
          OPENAI_API_KEY: "",
          OPENAI_BASE_URL: "",
        },
      },
    );
    assert.equal(failedCommit.status, 0);
    viewerData = await waitFor(() => {
      const data = readFileSync(viewerDataFile, "utf8");
      return /Summary failed:.*OPENAI_API_KEY not set/.test(data) ? data : null;
    });
    assert.doesNotMatch(viewerData, /failure remains visible/);

    const unconfirmedClear = spawnSync(cli, ["clear"], {
      cwd: consumer,
      encoding: "utf8",
      env: { ...process.env, NO_COLOR: "1" },
    });
    assert.equal(unconfirmedClear.status, 1);
    assert.match(unconfirmedClear.stderr, /clear --yes/);

    const clearOutput = run(cli, ["clear", "--yes"], consumer);
    assert.match(clearOutput, /cleared 2 entries; viewer now has 0 entries/);
    const clearedDatabase = new DatabaseSync(summariesDb);
    try {
      assert.equal(
        clearedDatabase.prepare("SELECT count(*) AS count FROM commit_summaries").get().count,
        0,
      );
    } finally {
      clearedDatabase.close();
    }
    assert.match(readFileSync(viewerDataFile, "utf8"), /window\.__WHATIJUSTDID__ = \[\]/);

    const scopePreview = run(cli, ["backfill"], consumer);
    assert.match(scopePreview, /no AI calls made/);
    assert.match(scopePreview, /choose a scope/);

    const sync = spawnSync(cli, ["sync"], {
      cwd: consumer,
      encoding: "utf8",
      env: { ...process.env, NO_COLOR: "1" },
    });
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
        /# >>> whatijustdid >>>/,
      );
    }
    assert.match(run(cli, ["hook"], consumer), /hooks already current/);

    const initWithPreview = spawn(cli, ["init", "--no-open", "--port", "0"], {
      cwd: consumer,
      env: { ...process.env, NO_COLOR: "1", OPENAI_API_KEY: "test-key" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const previewOutput = await waitForOutput(initWithPreview, /previewing the bundled viewer at/);
    assert.match(previewOutput, /previewing the bundled viewer at http:\/\/127\.0\.0\.1:\d+/);
    initWithPreview.kill();
    await once(initWithPreview, "exit");
  } finally {
    mockAgent?.process.kill();
    rmSync(root, { recursive: true, force: true });
  }
});

async function waitFor(check, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const result = check();
    if (result) return result;
    if (Date.now() > deadline) {
      throw new Error("Timed out waiting for the background record to finish");
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

async function waitForOutput(child, pattern, timeoutMs = 5_000) {
  let output = "";
  let timeout;
  const onData = (chunk) => {
    output += String(chunk);
  };
  child.stdout.on("data", onData);
  child.stderr.on("data", onData);
  try {
    return await Promise.race([
      (async () => {
        while (!pattern.test(output)) await once(child.stdout, "data");
        return output;
      })(),
      new Promise((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`Timed out waiting for preview output: ${output}`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(timeout);
    child.stdout.off("data", onData);
    child.stderr.off("data", onData);
  }
}

async function startMockOpenAi() {
  const script = `
    const { createServer } = require("node:http");
    const summary = JSON.stringify({
      type: "chore",
      changes: [{
        type: "chore",
        summary: "Initialized whatijustdid from the committed code",
      }],
    });
    const server = createServer((request, response) => {
      let body = "";
      request.on("data", (chunk) => { body += chunk; });
      request.on("end", () => {
        const payload = JSON.parse(body);
        const output = payload?.text?.format?.name === "project_name"
          ? JSON.stringify({ name: "Jollof Rice" })
          : summary;
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ output_text: output }));
      });
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
      NO_COLOR: "1",
      [`${ENV_PREFIX}_AGENT`]: undefined,
      [`${ENV_PREFIX}_MODEL`]: undefined,
      [`${ENV_PREFIX}_AGENT_API_KEY`]: undefined,
      npm_config_update_notifier: "false",
      ...environment,
    },
  });
}
