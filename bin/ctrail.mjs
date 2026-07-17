#!/usr/bin/env node
import { loadConfig } from "../src/config.mjs";
import { generate } from "../src/generate.mjs";
import { build } from "../src/build.mjs";
import { installHooks } from "../src/hooks.mjs";
import { initializeProject } from "../src/init.mjs";
import { recordStagedChange } from "../src/record.mjs";
import { editEntry } from "../src/edit.mjs";
import { verifyOwnershipRange } from "../src/ownership.mjs";

const [cmd, ...rest] = process.argv.slice(2);
const silent = rest.includes("--silent");
const log = (msg) => silent || console.log(msg);

async function main() {
  switch (cmd) {
    case "record": {
      const config = loadConfig();
      const { created } = await recordStagedChange(config);
      log(created ? `ctrail: staged one DB row (provider: ${config.provider})` : "ctrail: row already staged or no source changes");
      break;
    }
    case "generate":
    case "backfill": {
      const config = loadConfig();
      const n = await generate(config);
      log(`ctrail: generated ${n} new ${n === 1 ? "entry" : "entries"} (provider: ${config.provider})`);
      break;
    }
    case "build": {
      const config = loadConfig();
      const n = build(config);
      log(`ctrail: built ${config.dataFile} (${n} entries)`);
      break;
    }
    case "edit": {
      const config = loadConfig();
      const id = rest.find((value) => !value.startsWith("--"));
      const result = editEntry(config, id);
      if (result.changed) {
        build(config);
        log(`ctrail: edited + staged ${result.entry.id}`);
      } else {
        log("ctrail: no changes made");
      }
      break;
    }
    case "verify-ownership": {
      const config = loadConfig();
      const result = verifyOwnershipRange(config, {
        base: optionValue(rest, "--base"),
        head: optionValue(rest, "--head"),
      });
      log(`ctrail: ownership verified (${result.checked} existing rows checked)`);
      break;
    }
    case "sync": {
      // Manual history backfill + browser-cache rebuild.
      const config = loadConfig();
      const created = await generate(config);
      const total = build(config);
      log(`ctrail: +${created} new, ${total} total → ${config.dir}/changelog.data.js`);
      break;
    }
    case "init":
    case "install": {
      const config = loadConfig();
      const initialized = initializeProject(config, { force: rest.includes("--force") });
      const installed = installHooks(config.root);
      const total = build(config);
      const changed = [...initialized.created, ...initialized.updated];
      log(changed.length
        ? `ctrail: initialized ${changed.join(", ")}`
        : "ctrail: project files already initialized");
      log(installed.length ? `ctrail: installed/updated hooks: ${installed.join(", ")}` : "ctrail: hooks already current");
      log(`ctrail: built initial viewer data (${total} entries)`);
      break;
    }
    default:
      console.log(`ctrail — Change View and Logs

Usage:
  ctrail init       Create project files, install hooks, and build the viewer
  ctrail install    Refresh hooks and missing project files (alias: init)
  ctrail record     Create + stage a DB row for currently staged source changes
  ctrail backfill   Create DB rows for recent history (alias: generate)
  ctrail sync       Backfill history, then rebuild viewer data
  ctrail build      Compile recent db/**/*.json rows → changelog.data.js
  ctrail edit ID    Edit + stage an entry (creator/author/committer only)
  ctrail verify-ownership --base SHA --head SHA
                 Verify row ownership across a commit range

Config: ctrail/config.json
Providers: raw | claude | codex/openai | llama`);
      if (cmd && cmd !== "help") process.exit(1);
  }
}

main().catch((err) => {
  console.error(`ctrail: ${err.message}`);
  process.exit(1);
});

function optionValue(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}
