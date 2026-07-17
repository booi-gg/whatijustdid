#!/usr/bin/env node
import { CLI_NAME, TITLE_NAME } from "../src/brand.mjs";
import { loadConfig } from "../src/config.mjs";
import { generate, planGeneration } from "../src/generate.mjs";
import { build } from "../src/build.mjs";
import { installHooks, uninstallHooks } from "../src/hooks.mjs";
import { initializeProject } from "../src/init.mjs";
import { dirname } from "node:path";
import { execSync } from "node:child_process";
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
      let result;
      try {
        result = await recordCommittedChange(config, {}, {
          mergeOnly: rest.includes("--merge-only"),
        });
      } catch (error) {
        const total = build(config);
        throw new Error(`${error.message}; viewer now has ${formatEntries(total)}`, { cause: error });
      }
      const total = build(config);
      log(result.created
        ? `${CLI_NAME}: saved an AI summary for ${result.entry.commitSha.slice(0, 12)}; viewer now has ${formatEntries(total)}`
        : `${CLI_NAME}: ${recordSkipMessage(result.reason)}; viewer now has ${formatEntries(total)}`);
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
        log(`${CLI_NAME}: no AI calls made. ${formatPlan(preview)}`);
        log(`${CLI_NAME}: choose a scope: --limit ${config.generationLimit}, or --all --yes`);
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
      log(`${CLI_NAME}: ${formatPlan(plan)}`);
      if (all && !options.confirmAll) {
        throw new Error("No AI calls made. Re-run with --all --yes to approve full-history generation");
      }
      const result = await generate(config, { ...options, plan });
      const total = build(config);
      log(
        `${CLI_NAME}: generated ${result.generated}, skipped ${result.skipped}, ` +
        `viewer now has ${formatEntries(total)}`,
      );
      break;
    }
    case "build": {
      const config = loadConfig();
      const total = build(config);
      log(`${CLI_NAME}: built private viewer data (${formatEntries(total)})`);
      break;
    }
    case "preview": {
      const config = loadConfig();
      build(config);
      const { url } = await startPreview(config, {
        port: optionValue(rest, "--port") ?? process.env.CONDUCTOR_PORT,
        open: !rest.includes("--no-open"),
      });
      log(`${CLI_NAME}: previewing the bundled viewer at ${url}`);
      log(`${CLI_NAME}: watching for new commits (Ctrl+C to stop)`);
      break;
    }
    case "edit": {
      const config = loadConfig();
      const id = rest.find((value) => !value.startsWith("--"));
      const result = editEntry(config, id);
      if (result.changed) {
        build(config);
        log(`${CLI_NAME}: edited local summary for ${result.entry.commitSha.slice(0, 12)}`);
      } else {
        log(`${CLI_NAME}: no changes made`);
      }
      break;
    }
    case "sync":
      throw new Error("Cloud sync is not available yet; no local history was generated or uploaded");
    case "db": {
      const config = loadConfig();
      log(`${CLI_NAME}: ${config.dbFile}`);
      try { execSync(`open "${dirname(config.dbFile)}"`, { stdio: "ignore" }); } catch { /* no-op */ }
      break;
    }
    case "init":
    case "install": {
      const config = loadConfig();
      const initialized = initializeProject(config);
      const migration = importLegacyRows(config);
      const installed = installHooks(config.root);
      const total = build(config);
      const changed = [...initialized.created, ...initialized.updated];
      log(changed.length
        ? `${CLI_NAME}: initialized ${changed.join(", ")}`
        : `${CLI_NAME}: project files already initialized`);
      if (migration.scanned) {
        log(
          `${CLI_NAME}: imported ${migration.imported} legacy AI summaries; ` +
          `${migration.pending} commits still need generation`,
        );
      }
      log(`${CLI_NAME}: private database ${config.dbFile}`);
      log(installed.length
        ? `${CLI_NAME}: installed/updated hooks: ${installed.join(", ")}`
        : `${CLI_NAME}: hooks already current`);
      log(`${CLI_NAME}: built initial viewer data (${formatEntries(total)})`);
      if (!rest.includes("--no-preview")) {
        const { url } = await startPreview(config, {
          port: optionValue(rest, "--port") ?? process.env.CONDUCTOR_PORT,
          open: !rest.includes("--no-open"),
        });
        log(`${CLI_NAME}: previewing the bundled viewer at ${url}`);
      log(`${CLI_NAME}: watching for new commits (Ctrl+C to stop)`);
      }
      break;
    }
    case "hook": {
      const installed = installHooks(repoRoot());
      log(installed.length
        ? `${CLI_NAME}: installed/updated hooks: ${installed.join(", ")}`
        : `${CLI_NAME}: hooks already current`);
      break;
    }
    case "unhook": {
      const removed = uninstallHooks(repoRoot());
      log(removed.length
        ? `${CLI_NAME}: removed hooks: ${removed.join(", ")}`
        : `${CLI_NAME}: hooks already removed`);
      break;
    }
    default:
      console.log(`${CLI_NAME} \u2014 AI summaries for committed code

Usage:
  ${CLI_NAME} init                    Initialize, install hooks, and open the preview
  ${CLI_NAME} init --no-preview       Initialize without starting the preview
  ${CLI_NAME} install                 Alias for init
  ${CLI_NAME} hook                    Install or refresh local Git hooks
  ${CLI_NAME} unhook                  Remove ${TITLE_NAME} from local Git hooks
  ${CLI_NAME} record                  Summarize the current HEAD commit
  ${CLI_NAME} backfill                Preview the default bounded history scope
  ${CLI_NAME} backfill --limit N      Generate at most N recent commits
  ${CLI_NAME} backfill --all --yes    Generate every reachable commit
  ${CLI_NAME} refresh ...             Alias for backfill
  ${CLI_NAME} build                   Rebuild the private viewer cache
  ${CLI_NAME} preview                 Open the bundled viewer with live reload
  ${CLI_NAME} edit SHA                Edit a local summary
  ${CLI_NAME} db                      Show and open the SQLite database location
  ${CLI_NAME} sync                    Reserved for hosted multi-device sync

Config: whatijustdid.json
Agents: codex/openai (default) | claude | llama`);
      if (cmd && cmd !== "help") process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`${CLI_NAME}: ${error.message}`);
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

function formatEntries(total) {
  return `${total} ${total === 1 ? "entry" : "entries"}`;
}
