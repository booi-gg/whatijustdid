#!/usr/bin/env node
import { loadConfig } from "../src/config.mjs";
import { generate, planGeneration } from "../src/generate.mjs";
import { build } from "../src/build.mjs";
import { installHooks, uninstallHooks } from "../src/hooks.mjs";
import { initializeProject } from "../src/init.mjs";
import { repoRoot } from "../src/git.mjs";
import { recordCommittedChange } from "../src/record.mjs";
import { editEntry } from "../src/edit.mjs";
import { importLegacyRows } from "../src/legacy.mjs";
import { startPreview } from "../src/preview.mjs";

const [cmd, ...rest] = process.argv.slice(2);
const silent = rest.includes("--silent");
const log = (message) => silent || console.log(message);

async function main() {
  switch (cmd) {
    case "record": {
      const config = loadConfig();
      const result = await recordCommittedChange(config, {}, {
        mergeOnly: rest.includes("--merge-only"),
      });
      log(result.created
        ? `changetrail: saved an AI summary for ${result.entry.commitSha.slice(0, 12)} in private SQLite`
        : `changetrail: ${recordSkipMessage(result.reason)}`);
      break;
    }
    case "generate":
    case "backfill":
    case "refresh": {
      const config = loadConfig();
      const all = rest.includes("--all");
      const limitRequested = rest.some((value) => value === "--limit" || value.startsWith("--limit="));
      const limitValue = optionValue(rest, "--limit");
      if (limitRequested && !limitValue) throw new Error("--limit requires a positive integer");
      const limit = limitValue === null ? null : positiveInteger(limitValue, "--limit");
      const force = rest.includes("--force");

      if (!all && limit === null) {
        const preview = planGeneration(config, { limit: config.generationLimit, force });
        log(`changetrail: no AI calls made. ${formatPlan(preview)}`);
        log(`changetrail: choose a scope: --limit ${config.generationLimit}, or --all --yes`);
        break;
      }
      if (all && limit !== null) throw new Error("Choose either --limit N or --all, not both");

      const options = {
        all,
        limit: all ? undefined : limit,
        confirmAll: rest.includes("--yes"),
        force,
      };
      const plan = planGeneration(config, options);
      log(`changetrail: ${formatPlan(plan)}`);
      if (all && !options.confirmAll) {
        throw new Error("No AI calls made. Re-run with --all --yes to approve full-history generation");
      }
      const result = await generate(config, { ...options, plan });
      const total = build(config);
      log(
        `changetrail: generated ${result.generated}, skipped ${result.skipped}, ` +
        `viewer now has ${total} ${total === 1 ? "summary" : "summaries"}`,
      );
      break;
    }
    case "build": {
      const config = loadConfig();
      const total = build(config);
      log(`changetrail: built ${config.dataFile} (${total} summaries)`);
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
        log(`changetrail: edited local summary for ${result.entry.commitSha.slice(0, 12)}`);
      } else {
        log("changetrail: no changes made");
      }
      break;
    }
    case "sync":
      throw new Error("Cloud sync is not available yet; no local history was generated or uploaded");
    case "init":
    case "install": {
      const config = loadConfig();
      const initialized = initializeProject(config);
      const migration = importLegacyRows(config);
      const installed = installHooks(config.root);
      const total = build(config);
      const changed = [...initialized.created, ...initialized.updated];
      log(changed.length
        ? `changetrail: initialized ${changed.join(", ")}`
        : "changetrail: project files already initialized");
      if (migration.scanned) {
        log(
          `changetrail: imported ${migration.imported} legacy AI summaries; ` +
          `${migration.pending} commits still need generation`,
        );
      }
      log(`changetrail: private database ${config.dbFile}`);
      log(installed.length
        ? `changetrail: installed/updated hooks: ${installed.join(", ")}`
        : "changetrail: hooks already current");
      log(`changetrail: built initial viewer data (${total} summaries)`);
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
      console.log(`changetrail — AI summaries for committed code

Usage:
  changetrail init                    Initialize private SQLite and install hooks
  changetrail install                 Refresh hooks and project files (alias: init)
  changetrail hook                    Install or refresh local Git hooks
  changetrail unhook                  Remove Changetrail from local Git hooks
  changetrail record                  Summarize the current HEAD commit
  changetrail backfill                Preview the default bounded history scope
  changetrail backfill --limit N      Generate at most N recent commits
  changetrail backfill --all --yes    Generate every reachable commit
  changetrail refresh ...             Alias for backfill
  changetrail build                   Rebuild the ignored viewer cache
  changetrail preview                 Open the bundled viewer with live reload
  changetrail edit SHA                Edit a local summary
  changetrail sync                    Reserved for hosted multi-device sync

Config: changetrail.json
Agents: codex/openai (default) | claude | llama`);
      if (cmd && cmd !== "help") process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`changetrail: ${error.message}`);
  process.exitCode = 1;
});

function optionValue(args, name) {
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1] ?? null;
  const inline = args.find((value) => value.startsWith(`${name}=`));
  return inline ? inline.slice(name.length + 1) : null;
}

function positiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new Error(`${name} must be a positive integer`);
  return number;
}

function formatPlan(plan) {
  return `${plan.commitsToGenerate} of ${plan.selectedCommits} selected commits need summaries; ` +
    `worst-case input ≈ ${formatNumber(plan.estimatedInputTokens)} tokens ` +
    `(${formatBytes(plan.worstCaseInputBytes)})`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatBytes(value) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / 1024 ** 2).toFixed(1)} MiB`;
}

function recordSkipMessage(reason) {
  if (reason === "no-commit") return "repository has no commits yet";
  if (reason === "no-code-changes") return "current commit has no code diff to summarize";
  if (reason === "not-a-merge") return "fast-forward merge needs no automatic history generation";
  return "summary already exists or another process is generating it";
}
