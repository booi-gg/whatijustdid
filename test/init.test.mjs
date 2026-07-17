import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { initializeProject } from "../src/init.mjs";

test("initializes consumer files without overwriting user-owned assets", () => {
  const root = mkdtempSync(join(tmpdir(), "changetrail-init-"));
  try {
    writeFileSync(join(root, ".gitignore"), "node_modules/\n");
    const config = consumerConfig(root);
    const first = initializeProject(config);

    assert.deepEqual(first.created.sort(), [
      "changelog/changelog.html",
      "changelog/db/.gitkeep",
      "changetrail/config.json",
    ]);
    assert.deepEqual(first.updated, [".gitignore"]);
    assert.match(readFileSync(join(root, "changelog", "changelog.html"), "utf8"), /Change,<br>recorded\./);
    assert.equal(
      readFileSync(join(root, ".gitignore"), "utf8"),
      "node_modules/\n\n" +
        "# >>> changetrail >>>\n" +
        "/changelog/changelog.data.js\n" +
        "/changelog/changelog.local.json\n" +
        "# <<< changetrail <<<\n",
    );

    writeFileSync(join(root, "changelog", "changelog.html"), "custom viewer\n");
    const second = initializeProject(config);
    assert.equal(readFileSync(join(root, "changelog", "changelog.html"), "utf8"), "custom viewer\n");
    assert.equal(second.created.length, 0);
    assert.equal(second.updated.length, 0);

    const forced = initializeProject(config, { force: true });
    assert.deepEqual(forced.updated, ["changelog/changelog.html"]);
    assert.match(readFileSync(join(root, "changelog", "changelog.html"), "utf8"), /Repository ledger/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("uses the configured directory in generated ignore rules", () => {
  const root = mkdtempSync(join(tmpdir(), "changetrail-custom-dir-"));
  try {
    const configPath = join(root, "changetrail", "config.json");
    mkdirSync(join(root, "changetrail"));
    writeFileSync(configPath, "{}\n");
    initializeProject({
      ...consumerConfig(root),
      dir: "docs/changes",
      dbDir: join(root, "docs", "changes", "db"),
      dataFile: join(root, "docs", "changes", "changelog.data.js"),
      configPath,
      isDefaultConfig: false,
    });

    assert.match(
      readFileSync(join(root, ".gitignore"), "utf8"),
      /\/docs\/changes\/changelog\.data\.js/,
    );
    assert.equal(readFileSync(configPath, "utf8"), "{}\n");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function consumerConfig(root) {
  return {
    root,
    dir: "changelog",
    dbDir: join(root, "changelog", "db"),
    dataFile: join(root, "changelog", "changelog.data.js"),
    configPath: null,
    isDefaultConfig: true,
  };
}
