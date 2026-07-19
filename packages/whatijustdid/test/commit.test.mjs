import assert from "node:assert/strict";
import test from "node:test";
import {
  draftCommitMessage,
  formatCommitMessage,
  stagedChange,
} from "../src/commit.mjs";

const config = { root: "/repo", maxDiffBytes: 80_000 };

test("formats a single change as a bare conventional subject", () => {
  assert.equal(
    formatCommitMessage({
      type: "fix",
      changes: [{ type: "fix", summary: "Fixed the retry loop." }],
    }),
    "fix: fixed the retry loop",
  );
});

test("keeps acronym-leading summaries untouched in the subject", () => {
  assert.equal(
    formatCommitMessage({
      type: "docs",
      changes: [{ type: "docs", summary: "API docs now cover pagination" }],
    }),
    "docs: API docs now cover pagination",
  );
});

test("puts additional changes into a bulleted body", () => {
  assert.equal(
    formatCommitMessage({
      type: "feat",
      changes: [
        { type: "feat", summary: "Added a commit command" },
        { type: "fix", summary: "Fixed staged diff truncation" },
      ],
    }),
    "feat: added a commit command\n\n- Fixed staged diff truncation",
  );
});

test("truncates long subjects at a word boundary and keeps the full text in the body", () => {
  const summary =
    "Added a commit wrapper that generates the message, asks for confirmation, and can regenerate";
  const message = formatCommitMessage({
    type: "feat",
    changes: [{ type: "feat", summary }],
  });
  const [subject, blank, body] = message.split("\n");
  assert.ok(subject.length <= 72, `subject too long: ${subject.length}`);
  assert.ok(subject.endsWith("…"));
  assert.equal(blank, "");
  assert.equal(body, `- ${summary}`);
});

test("stagedChange returns null when nothing is staged", () => {
  assert.equal(
    stagedChange(config, { stagedFiles: () => [] }),
    null,
  );
});

test("stagedChange bundles staged files with the bounded diff", () => {
  const seen = {};
  const change = stagedChange(config, {
    stagedFiles: (root) => {
      seen.root = root;
      return ["src/a.mjs"];
    },
    stagedDiff: (maxBytes, root) => {
      seen.maxBytes = maxBytes;
      seen.diffRoot = root;
      return "diff --git a/src/a.mjs b/src/a.mjs";
    },
  });
  assert.deepEqual(change, {
    files: ["src/a.mjs"],
    diff: "diff --git a/src/a.mjs b/src/a.mjs",
  });
  assert.deepEqual(seen, {
    root: "/repo",
    maxBytes: 80_000,
    diffRoot: "/repo",
  });
});

test("draftCommitMessage shapes the agent description into a message", async () => {
  const change = { files: ["src/a.mjs"], diff: "diff" };
  const { message, description } = await draftCommitMessage(config, change, {
    describeChange: async (input, cfg) => {
      assert.equal(input, change);
      assert.equal(cfg, config);
      return {
        type: "perf",
        changes: [{ type: "perf", summary: "Cached the viewer build." }],
      };
    },
  });
  assert.equal(message, "perf: cached the viewer build");
  assert.equal(description.type, "perf");
});
