import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { installHooks, uninstallHooks } from "../src/hooks.mjs";

const hookNames = [
  "post-commit",
  "post-merge",
  "post-checkout",
  "post-rewrite",
];

test("uninstalls whatijustdid hooks while preserving unrelated hook logic", () => {
  const root = mkdtempSync(join(tmpdir(), "whatijustdid-hooks-"));
  try {
    git(["init", "--quiet"], root);
    const hooksDir = join(root, ".git", "hooks");
    mkdirSync(hooksDir, { recursive: true });
    const preCommit = join(hooksDir, "pre-commit");
    writeFileSync(
      preCommit,
      "#!/bin/sh\n" +
        "echo user-hook\n" +
        "# >>> whatijustdid >>>\n" +
        "node old-runner record --silent\n" +
        "# <<< whatijustdid <<<\n",
    );

    assert.deepEqual(installHooks(root), hookNames);
    for (const name of hookNames) {
      assert.match(
        readFileSync(join(hooksDir, name), "utf8"),
        /# >>> whatijustdid >>>/,
      );
    }
    assert.equal(
      readFileSync(preCommit, "utf8"),
      "#!/bin/sh\necho user-hook\n",
    );
    const postCommit = readFileSync(join(hooksDir, "post-commit"), "utf8");
    assert.match(postCommit, /record \|\| true/);
    assert.doesNotMatch(postCommit, /--silent| build/);
    assert.match(
      readFileSync(join(hooksDir, "post-merge"), "utf8"),
      /record --merge-only \|\| true/,
    );
    for (const name of ["post-checkout", "post-rewrite"]) {
      assert.match(
        readFileSync(join(hooksDir, name), "utf8"),
        /build \|\| true/,
      );
      assert.doesNotMatch(
        readFileSync(join(hooksDir, name), "utf8"),
        /--silent|record/,
      );
    }

    assert.deepEqual(uninstallHooks(root), hookNames);
    assert.equal(
      readFileSync(preCommit, "utf8"),
      "#!/bin/sh\necho user-hook\n",
    );
    for (const name of hookNames) {
      assert.equal(existsSync(join(hooksDir, name)), false);
    }
    assert.deepEqual(uninstallHooks(root), []);
    assert.deepEqual(installHooks(root), hookNames);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("uninstalls hook blocks written by earlier package names", () => {
  const root = mkdtempSync(join(tmpdir(), "whatijustdid-legacy-hooks-"));
  try {
    git(["init", "--quiet"], root);
    const postMerge = join(root, ".git", "hooks", "post-merge");
    writeFileSync(
      postMerge,
      "#!/bin/sh\n" +
        "echo before\n" +
        "# >>> ctrail >>>\n" +
        "node old-runner build --silent || true\n" +
        "# <<< ctrail <<<\n" +
        "echo after\n",
    );

    assert.deepEqual(uninstallHooks(root), ["post-merge"]);
    assert.equal(
      readFileSync(postMerge, "utf8"),
      "#!/bin/sh\necho before\necho after\n",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}
