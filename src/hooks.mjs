import {
  readFileSync,
  writeFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { join, dirname, isAbsolute } from "node:path";
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
const MARKER = "# >>> changetrail >>>";
const END_MARKER = "# <<< changetrail <<<";
const BLOCK = /# >>> (?:@bm\/changelog|cvl|ctrial|ctrail|changetrail) >>>[\s\S]*?# <<< (?:@bm\/changelog|cvl|ctrial|ctrail|changetrail) <<<(?:\r?\n|$)/g;

/**
 * pre-commit stages the merge-safe DB row into the same commit as the code.
 * Post hooks only rebuild the ignored browser cache. Existing hook logic stays.
 */
export function installHooks(root) {
  const absHooksDir = hooksDirectory(root);
  mkdirSync(absHooksDir, { recursive: true });

  const runner = join(packageDir, "bin", "changetrail.mjs").replace(/\\/g, "/");

  const installed = [];
  for (const [name, command] of Object.entries(HOOKS)) {
    const path = join(absHooksDir, name);
    let content = existsSync(path) ? readFileSync(path, "utf8") : "#!/bin/sh\n";
    if (!content.startsWith("#!")) content = "#!/bin/sh\n" + content;
    const suffix = name === "pre-commit" ? "" : " || true";
    const block = `${MARKER}\nnode ${shellQuote(runner)} ${command} --silent${suffix}\n${END_MARKER}\n`;
    const base = content.replace(BLOCK, "").trimEnd();
    const next = `${base}\n\n${block}`;
    if (next === content) continue;
    writeFileSync(path, next);
    chmodSync(path, 0o755);
    installed.push(name);
  }
  return installed;
}

/** Remove only Changetrail-owned hook blocks, preserving all other hook logic. */
export function uninstallHooks(root) {
  const absHooksDir = hooksDirectory(root);
  const removed = [];

  for (const name of Object.keys(HOOKS)) {
    const path = join(absHooksDir, name);
    if (!existsSync(path)) continue;

    const content = readFileSync(path, "utf8");
    const withoutBlock = content.replace(BLOCK, "");
    if (withoutBlock === content) continue;

    const next = withoutBlock.trimEnd();
    if (!next || next === "#!/bin/sh") {
      rmSync(path);
    } else {
      writeFileSync(path, `${next}\n`);
    }
    removed.push(name);
  }

  return removed;
}

function hooksDirectory(root) {
  const hooksDir = execFileSync("git", ["rev-parse", "--git-path", "hooks"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  return isAbsolute(hooksDir) ? hooksDir : join(root, hooksDir);
}

function shellQuote(value) {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}
