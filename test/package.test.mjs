import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));

test("packed package installs and initializes a working consumer repository", { timeout: 30_000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), "changetrail-package-"));
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
    assert.ok(paths.includes("changetrail.json"));
    assert.ok(paths.includes("src/init.mjs"));
    assert.equal(paths.some((path) => path.startsWith("test/")), false);
    assert.equal(paths.some((path) => path.startsWith("hooks/")), false);

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
    assert.equal(existsSync(cli), true);
    const initOutput = run(cli, ["init"], consumer);
    assert.match(initOutput, /initialized/);
    assert.match(initOutput, /installed\/updated hooks/);
    assert.match(readFileSync(join(consumer, ".git", "hooks", "pre-commit"), "utf8"), /# >>> changetrail >>>/);
    assert.equal(existsSync(join(consumer, "changetrail", "changetrail.html")), false);
    const viewer = readFileSync(
      join(consumer, "node_modules", "changetrail", "assets", "changetrail.html"),
      "utf8",
    );
    assert.match(viewer, /Repository ledger/);
    assert.match(viewer, /<script src="\.\/data\.js"><\/script>/);
    assert.match(
      readFileSync(join(consumer, ".gitignore"), "utf8"),
      /\/changetrail\/changetrail\.html/,
    );
    assert.equal(existsSync(join(consumer, "changetrail.json")), true);
    assert.equal(existsSync(join(consumer, "changetrail", "config.json")), false);
    assert.equal(existsSync(join(consumer, "ctrail", "config.json")), false);
    assert.equal(existsSync(join(consumer, "changelog", "changetrail.json")), false);
    assert.equal(existsSync(join(consumer, "changelog", "ctrail.json")), false);
    assert.equal(existsSync(join(consumer, "changelog", "changelog.json")), false);

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

    run("git", ["add", "."], consumer);
    run("git", ["commit", "--quiet", "-m", "chore: initialize changelog"], consumer);
    const rows = jsonFiles(join(consumer, "changetrail", "db"));
    assert.equal(rows.length, 1);
    assert.match(rows[0], /[/\\][0-9a-f]{2}[/\\][0-9a-f]{2}[/\\][0-9a-f]{64}\.json$/);
    assert.match(
      readFileSync(join(consumer, "changetrail", "data.js"), "utf8"),
      /initialize changelog/,
    );

    const unhookOutput = run(cli, ["unhook"], consumer);
    assert.match(unhookOutput, /removed hooks/);
    for (const name of ["pre-commit", "post-commit", "post-merge", "post-checkout", "post-rewrite"]) {
      assert.equal(existsSync(join(consumer, ".git", "hooks", name)), false);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function jsonFiles(root) {
  const files = [];
  const pending = [root];
  while (pending.length) {
    const directory = pending.pop();
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, item.name);
      if (item.isDirectory()) pending.push(path);
      else if (item.isFile() && item.name.endsWith(".json")) files.push(path);
    }
  }
  return files;
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
