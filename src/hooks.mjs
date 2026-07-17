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
  "post-commit": ["record", "build"],
  "post-merge": ["record --merge-only", "build"],
  "post-checkout": ["build"],
  "post-rewrite": ["build"],
};
const MANAGED_HOOKS = ["pre-commit", ...Object.keys(HOOKS)];
const MARKER = "# >>> changetrail >>>";
const END_MARKER = "# <<< changetrail <<<";
const BLOCK = /# >>> (?:@bm\/changelog|cvl|ctrial|ctrail|changetrail) >>>[\s\S]*?# <<< (?:@bm\/changelog|cvl|ctrial|ctrail|changetrail) <<<(?:\r?\n|$)/g;

/** Install post-commit generation while preserving all user-owned hook logic. */
export function installHooks(root) {
  const absHooksDir = hooksDirectory(root);
  mkdirSync(absHooksDir, { recursive: true });

  const runner = join(packageDir, "bin", "changetrail.mjs").replace(/\\/g, "/");
  // Upgrades must actively remove the old token-spending pre-commit hook.
  stripManagedBlock(join(absHooksDir, "pre-commit"));

  const installed = [];
  for (const [name, commands] of Object.entries(HOOKS)) {
    const path = join(absHooksDir, name);
    let content = existsSync(path) ? readFileSync(path, "utf8") : "#!/bin/sh\n";
    if (!content.startsWith("#!")) content = "#!/bin/sh\n" + content;
    const commandLines = commands
      .map((command) => `node --no-warnings ${shellQuote(runner)} ${command} --silent || true`)
      .join("\n");
    const block = `${MARKER}\n${commandLines}\n${END_MARKER}\n`;
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

  for (const name of MANAGED_HOOKS) {
    const path = join(absHooksDir, name);
    if (stripManagedBlock(path)) removed.push(name);
  }

  return removed;
}

function stripManagedBlock(path) {
  if (!existsSync(path)) return false;
  const content = readFileSync(path, "utf8");
  const withoutBlock = content.replace(BLOCK, "");
  if (withoutBlock === content) return false;
  const next = withoutBlock.trimEnd();
  if (!next || next === "#!/bin/sh") rmSync(path);
  else writeFileSync(path, `${next}\n`);
  return true;
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
