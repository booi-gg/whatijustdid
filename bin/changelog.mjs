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
      log(created ? `changelog: staged one DB row (provider: ${config.provider})` : "changelog: row already staged or no source changes");
      break;
    }
    case "generate":
    case "backfill": {
      const config = loadConfig();
      const n = await generate(config);
      log(`changelog: generated ${n} new ${n === 1 ? "entry" : "entries"} (provider: ${config.provider})`);
      break;
    }
    case "build": {
      const config = loadConfig();
      const n = build(config);
      log(`changelog: built ${config.dataFile} (${n} entries)`);
      break;
    }
    case "edit": {
      const config = loadConfig();
      const id = rest.find((value) => !value.startsWith("--"));
      const result = editEntry(config, id);
      if (result.changed) {
        build(config);
        log(`changelog: edited + staged ${result.entry.id}`);
      } else {
        log("changelog: no changes made");
      }
      break;
    }
    case "verify-ownership": {
      const config = loadConfig();
      const result = verifyOwnershipRange(config, {
        base: optionValue(rest, "--base"),
        head: optionValue(rest, "--head"),
      });
      log(`changelog: ownership verified (${result.checked} existing rows checked)`);
      break;
    }
    case "sync": {
      // Manual history backfill + browser-cache rebuild.
      const config = loadConfig();
      const created = await generate(config);
      const total = build(config);
      log(`changelog: +${created} new, ${total} total → ${config.dir}/changelog.data.js`);
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
        ? `changelog: initialized ${changed.join(", ")}`
        : "changelog: project files already initialized");
      log(installed.length ? `changelog: installed/updated hooks: ${installed.join(", ")}` : "changelog: hooks already current");
      log(`changelog: built initial viewer data (${total} entries)`);
      break;
    }
    default:
      console.log(`changelog — git-derived change-log tracker

Usage:
  changelog init       Create project files, install hooks, and build the viewer
  changelog install    Refresh hooks and missing project files (alias: init)
  changelog record     Create + stage a DB row for currently staged source changes
  changelog backfill   Create DB rows for recent history (alias: generate)
  changelog sync       Backfill history, then rebuild viewer data
  changelog build      Compile db/*.json → changelog.data.js
  changelog edit ID    Edit + stage an entry (creator/author/committer only)
  changelog verify-ownership --base SHA --head SHA
                       Verify row ownership across a commit range

Config: changelog/changelog.config.json
Providers: raw | claude | codex/openai | llama`);
      if (cmd && cmd !== "help") process.exit(1);
  }
}

main().catch((err) => {
  console.error(`changelog: ${err.message}`);
  process.exit(1);
});

function optionValue(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}
