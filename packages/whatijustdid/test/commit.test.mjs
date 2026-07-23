import assert from "node:assert/strict";
import test from "node:test";
import {
  draftCommitMessage,
  formatCommitMessage,
  stagedChange,
} from "../src/commit.mjs";
import { verbosityPrompt } from "../src/agents/shared.mjs";

const config = { root: "/repo", maxDiffBytes: 80_000 };

test("formats a single change as a bare conventional subject", () => {
  assert.equal(
    formatCommitMessage({
      type: "fix",
      changes: [{ type: "fix", summary: "Fix the retry loop." }],
    }),
    "fix: fix the retry loop",
  );
});

test("preserves acronyms inside an imperative subject", () => {
  assert.equal(
    formatCommitMessage({
      type: "docs",
      changes: [{ type: "docs", summary: "Document API pagination" }],
    }),
    "docs: document API pagination",
  );
});

test("puts additional changes into a bulleted body", () => {
  assert.equal(
    formatCommitMessage({
      type: "feat",
      changes: [
        { type: "feat", summary: "Add a commit command" },
        { type: "fix", summary: "Fix staged diff truncation" },
      ],
    }),
    "feat: add a commit command\n\n- Fix staged diff truncation",
  );
});

test("targets 50-character subjects and keeps the full text in the body", () => {
  const summary =
    "Add a commit wrapper that generates the message, asks for confirmation, and can regenerate";
  const message = formatCommitMessage({
    type: "feat",
    changes: [{ type: "feat", summary }],
  });
  const [subject, blank, ...body] = message.split("\n");
  assert.ok(subject.length <= 50, `subject too long: ${subject.length}`);
  assert.ok(subject.endsWith("…"));
  assert.equal(blank, "");
  assert.equal(body.join(" ").replace(/\s+/g, " "), `- ${summary}`);
  assert.ok(
    body.every((line) => line.length <= 72),
    `body line too long: ${body.join("\n")}`,
  );
});

test("never exceeds the 72-character hard subject limit", () => {
  const message = formatCommitMessage({
    type: "fix",
    changes: [{ type: "fix", summary: `Fix ${"x".repeat(100)}` }],
  });
  const [subject] = message.split("\n");
  assert.equal(subject.length, 72);
  assert.ok(subject.endsWith("…"));
});

test("maps non-conventional types to chore", () => {
  assert.equal(
    formatCommitMessage({
      type: "other",
      changes: [{ type: "other", summary: "Update repository metadata" }],
    }),
    "chore: update repository metadata",
  );
});

test("uses a commit-specific imperative prompt", () => {
  const prompt = verbosityPrompt("normal", "commit");
  assert.match(prompt, /Conventional Commit/);
  assert.match(prompt, /imperative mood/);
  assert.match(prompt, /5–10 words/);
  assert.match(prompt, /50 characters or fewer/);
  assert.match(prompt, /never need more than 72/);
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
    describeChange: async (input, cfg, options) => {
      assert.equal(input, change);
      assert.equal(cfg, config);
      assert.deepEqual(options, { purpose: "commit" });
      return {
        type: "perf",
        changes: [{ type: "perf", summary: "Cache the viewer build." }],
      };
    },
  });
  assert.equal(message, "perf: cache the viewer build");
  assert.equal(description.type, "perf");
});
