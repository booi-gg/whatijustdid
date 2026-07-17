import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));

test("packed package installs and initializes a working consumer repository", { timeout: 30_000 }, () => {
  const root = mkdtempSync(join(tmpdir(), "bm-changelog-package-"));
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
    assert.equal(manifest.name, "@bm/changelog");
    const paths = manifest.files.map((file) => file.path);
    assert.ok(paths.includes("assets/changelog.html"));
    assert.ok(paths.includes("bin/changelog.mjs"));
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
    const cli = join(
      consumer,
      "node_modules",
      "@bm",
      "changelog",
      "bin",
      "changelog.mjs",
    );
    const initOutput = run(process.execPath, [cli, "init"], consumer);
    assert.match(initOutput, /initialized/);
    assert.match(initOutput, /installed\/updated hooks/);
    assert.match(readFileSync(join(consumer, ".git", "hooks", "pre-commit"), "utf8"), /@bm\/changelog/);
    assert.match(readFileSync(join(consumer, "changelog", "changelog.html"), "utf8"), /Repository ledger/);

    run("git", ["add", "."], consumer);
    run("git", ["commit", "--quiet", "-m", "chore: initialize changelog"], consumer);
    const rows = readdirSync(join(consumer, "changelog", "db"))
      .filter((file) => file.endsWith(".json"));
    assert.equal(rows.length, 1);
    assert.match(
      readFileSync(join(consumer, "changelog", "changelog.data.js"), "utf8"),
      /initialize changelog/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

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
