import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { commitMeta, recentCommitMetas } from "../src/git.mjs";

test("reads the original subject and body from Git commit metadata", () => {
  const root = mkdtempSync(join(tmpdir(), "whatijustdid-git-message-"));
  const message =
    "feat(viewer): reveal commit context\n\nExplain why the change was made.\n\n- Preserve body formatting";

  try {
    git(["init", "--quiet"], root);
    git(["config", "user.name", "Test User"], root);
    git(["config", "user.email", "test@example.com"], root);
    git(
      [
        "commit",
        "--quiet",
        "--allow-empty",
        "-m",
        "feat(viewer): reveal commit context",
        "-m",
        "Explain why the change was made.\n\n- Preserve body formatting",
      ],
      root,
    );

    const [recent] = recentCommitMetas(1, root);
    assert.equal(recent.message, message);
    assert.equal(commitMeta(recent.sha, root).message, message);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}
