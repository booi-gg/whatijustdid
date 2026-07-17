import { readFileSync, writeFileSync, chmodSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));
const HOOKS = {
  "pre-commit": "record",
  "post-commit": "build",
  "post-merge": "build",
  "post-checkout": "build",
  "post-rewrite": "build",
};
const MARKER = "# >>> @funroll/changelog >>>";
const END_MARKER = "# <<< @funroll/changelog <<<";
const BLOCK = /\n?# >>> @funroll\/changelog >>>[\s\S]*?# <<< @funroll\/changelog <<<(?:\n|$)/g;

/**
 * pre-commit stages the merge-safe DB row into the same commit as the code.
 * Post hooks only rebuild the ignored browser cache. Existing hook logic stays.
 */
export function installHooks(root) {
  const hooksDir = join(execFileSync("git", ["rev-parse", "--git-path", "hooks"], {
    cwd: root,
    encoding: "utf8",
  }).trim());
  const absHooksDir = hooksDir.startsWith("/") ? hooksDir : join(root, hooksDir);
  mkdirSync(absHooksDir, { recursive: true });

  const runner = join(packageDir, "bin", "changelog.mjs");

  const installed = [];
  for (const [name, command] of Object.entries(HOOKS)) {
    const path = join(absHooksDir, name);
    let content = existsSync(path) ? readFileSync(path, "utf8") : "#!/bin/sh\n";
    if (!content.startsWith("#!")) content = "#!/bin/sh\n" + content;
    const suffix = name === "pre-commit" ? "" : " || true";
    const block = `${MARKER}\nnode ${shellQuote(runner)} ${command} --silent${suffix}\n${END_MARKER}\n`;
    const base = content.replace(BLOCK, "\n").trimEnd();
    const next = `${base}\n\n${block}`;
    if (next === content) continue;
    writeFileSync(path, next);
    chmodSync(path, 0o755);
    installed.push(name);
  }
  return installed;
}

function shellQuote(value) {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}
