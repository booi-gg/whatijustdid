import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadConfig } from "../src/config.mjs";
import { initializeProject } from "../src/init.mjs";

<<<<<<<< HEAD:packages/changereceipt/test/init.test.mjs
test("creates only changereceipt.json in the repository", () => {
  const root = repository("changereceipt-init-");
========
test("creates only whatijustdid.json in the repository", () => {
  const root = repository("whatijustdid-init-");
>>>>>>>> 443f132b3b4a75f2dea8054f500ce651e7eecb4c:packages/whatijustdid/test/init.test.mjs
  try {
    writeFileSync(join(root, ".gitignore"), "node_modules/\n");
    const config = loadConfig({ root, env: {} });
    const first = initializeProject(config);

    assert.deepEqual(first.created, ["changereceipt.json"]);
    assert.deepEqual(first.updated, []);
    assert.deepEqual(
      JSON.parse(readFileSync(join(root, "changereceipt.json"), "utf8")),
      {
        agent: "codex",
        model: null,
        viewerLimit: 200,
        generationLimit: 50,
        maxDiffBytes: 80000,
        timeoutMs: 20000,
        projects: {},
      },
    );
    assert.equal(
      config.dbFile,
      join(realpathSync(root), ".git", "whatijustdid", "summaries.sqlite"),
    );
    assert.equal(
      config.dataFile,
      join(realpathSync(root), ".git", "whatijustdid", "data.js"),
    );
    assert.equal(existsSync(config.dbFile), true);
    assert.equal(existsSync(join(root, "whatijustdid")), false);
    assert.equal(
      readFileSync(join(root, ".gitignore"), "utf8"),
      "node_modules/\n",
    );

    const second = initializeProject(config);
    assert.equal(second.created.length, 0);
    assert.equal(second.updated.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("does not read or preserve changereceipt.json", () => {
  const root = repository("whatijustdid-removed-config-");
  try {
    writeFileSync(join(root, "changereceipt.json"), '{"agent":"claude"}\n');
    const config = loadConfig({ root, env: {} });
    initializeProject(config);

    assert.equal(config.agent, "codex");
    assert.equal(
      config.dbFile,
      join(realpathSync(root), ".git", "whatijustdid", "summaries.sqlite"),
    );
    assert.equal(existsSync(join(root, "changereceipt.json")), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("migrates provider to agent, retires raw, and respects injected env", () => {
  const root = repository("whatijustdid-config-");
  try {
    const path = join(root, "changereceipt.json");
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
  const root = repository("whatijustdid-worktrees-");
  const linked = `${root}-linked`;
  try {
    writeFileSync(join(root, "README.md"), "worktree test\n");
    git(["add", "README.md"], root);
    git(["commit", "--quiet", "-m", "initial"], root);
    git(["worktree", "add", "--quiet", "--detach", linked, "HEAD"], root);

    const primary = loadConfig({ root, env: {} });
    const secondary = loadConfig({ root: linked, env: {} });
    assert.equal(primary.dbFile, secondary.dbFile);
    assert.equal(
      primary.dbFile,
      join(realpathSync(root), ".git", "whatijustdid", "summaries.sqlite"),
    );
    assert.notEqual(primary.dataFile, secondary.dataFile);
    assert.match(
      secondary.dataFile,
      /\.git\/worktrees\/.*\/whatijustdid\/data\.js$/,
    );
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
