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
      log(created ? `ctrial: staged one DB row (provider: ${config.provider})` : "ctrial: row already staged or no source changes");
      break;
    }
    case "generate":
    case "backfill": {
      const config = loadConfig();
      const n = await generate(config);
      log(`ctrial: generated ${n} new ${n === 1 ? "entry" : "entries"} (provider: ${config.provider})`);
      break;
    }
    case "build": {
      const config = loadConfig();
      const n = build(config);
      log(`ctrial: built ${config.dataFile} (${n} entries)`);
      break;
    }
    case "edit": {
      const config = loadConfig();
      const id = rest.find((value) => !value.startsWith("--"));
      const result = editEntry(config, id);
      if (result.changed) {
        build(config);
        log(`ctrial: edited + staged ${result.entry.id}`);
      } else {
        log("ctrial: no changes made");
      }
      break;
    }
    case "verify-ownership": {
      const config = loadConfig();
      const result = verifyOwnershipRange(config, {
        base: optionValue(rest, "--base"),
        head: optionValue(rest, "--head"),
      });
      log(`ctrial: ownership verified (${result.checked} existing rows checked)`);
      break;
    }
    case "sync": {
      // Manual history backfill + browser-cache rebuild.
      const config = loadConfig();
      const created = await generate(config);
      const total = build(config);
      log(`ctrial: +${created} new, ${total} total → ${config.dir}/changelog.data.js`);
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
        ? `ctrial: initialized ${changed.join(", ")}`
        : "ctrial: project files already initialized");
      log(installed.length ? `ctrial: installed/updated hooks: ${installed.join(", ")}` : "ctrial: hooks already current");
      log(`ctrial: built initial viewer data (${total} entries)`);
      break;
    }
    default:
      console.log(`ctrial — Change View and Logs

Usage:
  ctrial init       Create project files, install hooks, and build the viewer
  ctrial install    Refresh hooks and missing project files (alias: init)
  ctrial record     Create + stage a DB row for currently staged source changes
  ctrial backfill   Create DB rows for recent history (alias: generate)
  ctrial sync       Backfill history, then rebuild viewer data
  ctrial build      Compile recent db/**/*.json rows → changelog.data.js
  ctrial edit ID    Edit + stage an entry (creator/author/committer only)
  ctrial verify-ownership --base SHA --head SHA
                 Verify row ownership across a commit range

Config: changelog/changelog.json
Providers: raw | claude | codex/openai | llama`);
      if (cmd && cmd !== "help") process.exit(1);
  }
}

main().catch((err) => {
  console.error(`ctrial: ${err.message}`);
  process.exit(1);
});

function optionValue(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}
