import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadConfig } from "../src/config.mjs";
import { initializeProject } from "../src/init.mjs";

test("initializes private SQLite without copying or tracking data assets", () => {
  const root = repository("changetrail-init-");
  try {
    writeFileSync(
      join(root, ".gitignore"),
      "node_modules/\n\n" +
        "# >>> changetrail >>>\n" +
        "/changetrail/data.js\n" +
        "/changetrail/changetrail.local.json\n" +
        "# <<< changetrail <<<\n",
    );
    const config = loadConfig({ root, env: {} });
    const first = initializeProject(config);

    assert.deepEqual(first.created, ["changetrail.json"]);
    assert.deepEqual(first.updated, [".gitignore"]);
    assert.deepEqual(
      JSON.parse(readFileSync(join(root, "changetrail.json"), "utf8")),
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
    assert.equal(config.dbFile, join(realpathSync(root), ".git", "changetrail", "summaries.sqlite"));
    assert.equal(existsSync(config.dbFile), true);
    assert.equal(existsSync(join(root, "changetrail", "db", ".gitkeep")), false);
    assert.equal(existsSync(join(root, "changetrail", "changetrail.html")), false);
    assert.equal(
      readFileSync(join(root, ".gitignore"), "utf8"),
      "node_modules/\n\n" +
        "# >>> changetrail >>>\n" +
        "/changetrail/data.js\n" +
        "/changetrail/changetrail.html\n" +
        "/changetrail/changetrail.local.json\n" +
        "/changetrail/db/\n" +
        "# <<< changetrail <<<\n",
    );

    const second = initializeProject(config);
    assert.equal(second.created.length, 0);
    assert.equal(second.updated.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("uses the configured viewer directory while keeping SQLite private", () => {
  const root = repository("changetrail-custom-dir-");
  try {
    writeFileSync(join(root, "changetrail.json"), '{"dir":"docs/changes"}\n');
    const config = loadConfig({ root, env: {} });
    initializeProject(config);

    const ignore = readFileSync(join(root, ".gitignore"), "utf8");
    assert.match(ignore, /\/docs\/changes\/data\.js/);
    assert.match(ignore, /\/docs\/changes\/db\//);
    assert.equal(config.dbFile, join(realpathSync(root), ".git", "changetrail", "summaries.sqlite"));
    assert.equal(readFileSync(join(root, "changetrail.json"), "utf8"), '{"dir":"docs/changes"}\n');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("migrates provider to agent, retires raw, and respects injected env", () => {
  const root = repository("changetrail-config-");
  try {
    const path = join(root, "changetrail.json");
    writeFileSync(path, '{"provider":"claude"}\n');
    assert.equal(loadConfig({ root, env: {} }).agent, "claude");

    writeFileSync(path, '{"provider":"raw","model":"not-an-ai-model"}\n');
    const retiredRaw = loadConfig({ root, env: {} });
    assert.equal(retiredRaw.agent, "codex");
    assert.equal(retiredRaw.model, null);

    const environment = loadConfig({
      root,
      env: { CHANGELOG_PROVIDER: "llama", CHANGELOG_MODEL: "local-model" },
    });
    assert.equal(environment.agent, "llama");
    assert.equal(environment.model, "local-model");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("linked worktrees share the clone-private database", () => {
  const root = repository("changetrail-worktrees-");
  const linked = `${root}-linked`;
  try {
    writeFileSync(join(root, "README.md"), "worktree test\n");
    git(["add", "README.md"], root);
    git(["commit", "--quiet", "-m", "initial"], root);
    git(["worktree", "add", "--quiet", "--detach", linked, "HEAD"], root);

    const primary = loadConfig({ root, env: {} });
    const secondary = loadConfig({ root: linked, env: {} });
    assert.equal(primary.dbFile, secondary.dbFile);
    assert.equal(primary.dbFile, join(realpathSync(root), ".git", "changetrail", "summaries.sqlite"));
  } finally {
    try {
      git(["worktree", "remove", "--force", linked], root);
    } catch {
      rmSync(linked, { recursive: true, force: true });
    }
    rmSync(root, { recursive: true, force: true });
  }
});

function repository(prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  git(["init", "--quiet"], root);
  git(["config", "user.name", "Test User"], root);
  git(["config", "user.email", "test@example.com"], root);
  return root;
}

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}
