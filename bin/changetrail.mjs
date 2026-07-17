#!/usr/bin/env node
import { loadConfig } from "../src/config.mjs";
import { generate } from "../src/generate.mjs";
import { build } from "../src/build.mjs";
import { installHooks, uninstallHooks } from "../src/hooks.mjs";
import { initializeProject } from "../src/init.mjs";
import { repoRoot } from "../src/git.mjs";
import { recordStagedChange } from "../src/record.mjs";
import { editEntry } from "../src/edit.mjs";
import { verifyOwnershipRange } from "../src/ownership.mjs";
import { startPreview } from "../src/preview.mjs";

const [cmd, ...rest] = process.argv.slice(2);
const silent = rest.includes("--silent");
const log = (msg) => silent || console.log(msg);

async function main() {
  switch (cmd) {
    case "record": {
      const config = loadConfig();
      const { created } = await recordStagedChange(config);
      log(created ? `changetrail: staged one DB row (provider: ${config.provider})` : "changetrail: row already staged or no source changes");
      break;
    }
    case "generate":
    case "backfill": {
      const config = loadConfig();
      const n = await generate(config);
      log(`changetrail: generated ${n} new ${n === 1 ? "entry" : "entries"} (provider: ${config.provider})`);
      break;
    }
    case "build": {
      const config = loadConfig();
      const n = build(config);
      log(`changetrail: built ${config.dataFile} (${n} entries)`);
      break;
    }
    case "preview": {
      const config = loadConfig();
      build(config);
      const { url } = await startPreview(config, {
        port: optionValue(rest, "--port") ?? process.env.CONDUCTOR_PORT,
        open: !rest.includes("--no-open"),
      });
      log(`changetrail: previewing the bundled viewer at ${url}`);
      log(`changetrail: watching ${config.dir}/data.js (Ctrl+C to stop)`);
      break;
    }
    case "edit": {
      const config = loadConfig();
      const id = rest.find((value) => !value.startsWith("--"));
      const result = editEntry(config, id);
      if (result.changed) {
        build(config);
        log(`changetrail: edited + staged ${result.entry.id}`);
      } else {
        log("changetrail: no changes made");
      }
      break;
    }
    case "verify-ownership": {
      const config = loadConfig();
      const result = verifyOwnershipRange(config, {
        base: optionValue(rest, "--base"),
        head: optionValue(rest, "--head"),
      });
      log(`changetrail: ownership verified (${result.checked} existing rows checked)`);
      break;
    }
    case "sync": {
      // Manual history backfill + browser-cache rebuild.
      const config = loadConfig();
      const created = await generate(config);
      const total = build(config);
      log(`changetrail: +${created} new, ${total} total → ${config.dir}/data.js`);
      break;
    }
    case "init":
    case "install": {
      const config = loadConfig();
      const initialized = initializeProject(config);
      const installed = installHooks(config.root);
      const total = build(config);
      const changed = [...initialized.created, ...initialized.updated];
      log(changed.length
        ? `changetrail: initialized ${changed.join(", ")}`
        : "changetrail: project files already initialized");
      log(installed.length ? `changetrail: installed/updated hooks: ${installed.join(", ")}` : "changetrail: hooks already current");
      log(`changetrail: built initial viewer data (${total} entries)`);
      break;
    }
    case "hook": {
      const installed = installHooks(repoRoot());
      log(installed.length
        ? `changetrail: installed/updated hooks: ${installed.join(", ")}`
        : "changetrail: hooks already current");
      break;
    }
    case "unhook": {
      const removed = uninstallHooks(repoRoot());
      log(removed.length
        ? `changetrail: removed hooks: ${removed.join(", ")}`
        : "changetrail: hooks already removed");
      break;
    }
    default:
      console.log(`changetrail — Change View and Logs

Usage:
  changetrail init       Create project files, install hooks, and build viewer data
  changetrail install    Refresh hooks and missing project files (alias: init)
  changetrail hook       Install or refresh Changetrail's local Git hooks
  changetrail unhook     Remove Changetrail from local Git hooks
  changetrail record     Create + stage a DB row for currently staged source changes
  changetrail backfill   Create DB rows for recent history (alias: generate)
  changetrail sync       Backfill history, then rebuild viewer data
  changetrail build      Compile recent db/**/*.json rows → data.js
  changetrail preview    Open the viewer with live reload
  changetrail edit ID    Edit + stage an entry (creator/author/committer only)
  changetrail verify-ownership --base SHA --head SHA
                 Verify row ownership across a commit range

Config: changetrail.json
Providers: raw | claude | codex/openai | llama`);
      if (cmd && cmd !== "help") process.exit(1);
  }
}

main().catch((err) => {
  console.error(`changetrail: ${err.message}`);
  process.exit(1);
});

function optionValue(args, name) {
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1];
  const inline = args.find((value) => value.startsWith(`${name}=`));
  return inline ? inline.slice(name.length + 1) : null;
}
