import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
      "changetrail.json",
      "changetrail/changetrail.html",
      "changetrail/db/.gitkeep",
    ]);
    assert.deepEqual(first.updated, [".gitignore"]);
    const viewerPath = join(root, "changetrail", "changetrail.html");
    assert.match(readFileSync(viewerPath, "utf8"), /Change,<br>recorded\./);
    assert.match(readFileSync(viewerPath, "utf8"), /<script src="\.\/data\.js"><\/script>/);
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
