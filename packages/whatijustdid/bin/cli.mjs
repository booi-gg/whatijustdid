#!/usr/bin/env node
import { execSync } from "node:child_process";
import { dirname, relative } from "node:path";
import pc from "picocolors";
import { validateAgentConfig } from "../src/agents/index.mjs";
import { CLI_NAME, ENV_PREFIX, TITLE_NAME } from "../src/brand.mjs";
import { build } from "../src/build.mjs";
import { loadConfig } from "../src/config.mjs";
import { editEntry } from "../src/edit.mjs";
import { generate, planGeneration } from "../src/generate.mjs";
import { repoRoot } from "../src/git.mjs";
import { installHooks, uninstallHooks } from "../src/hooks.mjs";
import { initializeProject } from "../src/init.mjs";
import { importLegacyRows } from "../src/legacy.mjs";
import { startPreview } from "../src/preview.mjs";
import { recordCommittedChange } from "../src/record.mjs";

const P = pc.dim(`${CLI_NAME}:`);
const Perr = pc.red(`${CLI_NAME}:`);
const sha = (s) => pc.yellow(s.slice(0, 12));
const path = (s) => pc.cyan(s);
const url = (s) => pc.blue(pc.underline(s));
const bold = (s) => pc.bold(s);
const dim = (s) => pc.dim(s);
const green = (s) => pc.green(s);
const yellow = (s) => pc.yellow(s);

const [cmd, ...rest] = process.argv.slice(2);
const silent = rest.includes("--silent");
const log = (message) => silent || console.log(message);

async function main() {
  switch (cmd) {
    case "record": {
      if (process.env[`${ENV_PREFIX}_SKIP`]) {
        log(`${P} ${dim(`skipped summary generation (${ENV_PREFIX}_SKIP is set)`)}`);
        break;
      }
      if (commitMessageContainsSkip()) {
        log(`${P} ${dim("skipped summary generation ([skip wijd] in commit message)")}`);
        break;
      }
      const config = loadConfig();
      let result;
      try {
        result = await recordCommittedChange(
          config,
          {},
          {
            mergeOnly: rest.includes("--merge-only"),
          },
        );
      } catch (error) {
        const total = build(config);
        throw new Error(
          `${error.message}; viewer now has ${formatEntries(total)}`,
          { cause: error },
        );
      }
      const total = build(config);
      log(
        result.created
          ? `${P} saved an AI summary for ${sha(result.entry.commitSha)}; viewer now has ${bold(formatEntries(total))}`
          : `${P} ${dim(recordSkipMessage(result.reason))}; viewer now has ${bold(formatEntries(total))}`,
      );
      break;
    }
    case "generate":
    case "backfill":
    case "refresh": {
      const config = loadConfig();
      const all = rest.includes("--all");
      const limitRequested = rest.some(
        (value) => value === "--limit" || value.startsWith("--limit="),
      );
      const limitValue = optionValue(rest, "--limit");
      if (limitRequested && !limitValue)
        throw new Error("--limit requires a positive integer");
      const limit =
        limitValue === null ? null : positiveInteger(limitValue, "--limit");
      const force = rest.includes("--force");

      if (!all && limit === null) {
        const preview = planGeneration(config, {
          limit: config.generationLimit,
          force,
        });
        log(`${P} no AI calls made. ${formatPlan(preview)}`);
        log(
          `${P} choose a scope: --limit ${bold(config.generationLimit)}, or --all --yes`,
        );
        break;
      }
      if (all && limit !== null)
        throw new Error("Choose either --limit N or --all, not both");

      const options = {
        all,
        limit: all ? undefined : limit,
        confirmAll: rest.includes("--yes"),
        force,
      };
      const plan = planGeneration(config, options);
      log(`${P} ${formatPlan(plan)}`);
      if (all && !options.confirmAll) {
        throw new Error(
          "No AI calls made. Re-run with --all --yes to approve full-history generation",
        );
      }
      const result = await generate(config, { ...options, plan });
      const total = build(config);
      log(
        `${P} generated ${green(result.generated)}, skipped ${yellow(result.skipped)}, ` +
          `viewer now has ${bold(formatEntries(total))}`,
      );
      break;
    }
    case "build": {
      const config = loadConfig();
      const total = build(config);
      log(`${P} built private viewer data (${bold(formatEntries(total))})`);
      break;
    }
    case "preview": {
      const config = loadConfig();
      build(config);
      const { url: previewUrl } = await startPreview(config, {
        port: optionValue(rest, "--port") ?? process.env.CONDUCTOR_PORT,
        open: !rest.includes("--no-open"),
      });
      log(`${P} previewing the bundled viewer at ${url(previewUrl)}`);
      log(`${P} watching for new commits (Ctrl+C to stop)`);
      break;
    }
    case "edit": {
      const config = loadConfig();
      const id = rest.find((value) => !value.startsWith("--"));
      const result = editEntry(config, id);
      if (result.changed) {
        build(config);
        log(`${P} edited local summary for ${sha(result.entry.commitSha)}`);
      } else {
        log(`${P} ${dim("no changes made")}`);
      }
      break;
    }
    case "sync":
      throw new Error(
        "Cloud sync is not available yet; no local history was generated or uploaded",
      );
    case "db": {
      const config = loadConfig();
      log(`${P} ${path(config.dbFile)}`);
      try {
        execSync(`open "${dirname(config.dbFile)}"`, { stdio: "ignore" });
      } catch {
        /* no-op */
      }
      break;
    }
    case "init":
    case "install": {
      const config = loadConfig();
      const initialized = initializeProject(config);
      const changed = [...initialized.created, ...initialized.updated];
      log(
        changed.length
          ? `${P} initialized ${green(changed.join(", "))}`
          : `${P} ${dim("project files already initialized")}`,
      );
      const validation = validateAgentConfig(config.agent);
      if (!validation.valid) {
        console.error(agentConfigHelp(config, validation));
        process.exitCode = 1;
        break;
      }
      const migration = importLegacyRows(config);
      const installed = installHooks(config.root);
      const total = build(config);
      if (migration.scanned) {
        log(
          `${P} imported ${bold(migration.imported)} legacy AI summaries; ` +
            `${bold(migration.pending)} commits still need generation`,
        );
      }
      log(`${P} private database ${path(config.dbFile)}`);
      log(
        installed.length
          ? `${P} installed/updated hooks: ${green(installed.join(", "))}`
          : `${P} ${dim("hooks already current")}`,
      );
      log(`${P} built initial viewer data (${bold(formatEntries(total))})`);
      if (!rest.includes("--no-preview")) {
        const { url: previewUrl } = await startPreview(config, {
          port: optionValue(rest, "--port") ?? process.env.CONDUCTOR_PORT,
          open: !rest.includes("--no-open"),
        });
        log(`${P} previewing the bundled viewer at ${url(previewUrl)}`);
        log(`${P} watching for new commits (Ctrl+C to stop)`);
      }
      break;
    }
    case "hook": {
      const installed = installHooks(repoRoot());
      log(
        installed.length
          ? `${P} installed/updated hooks: ${green(installed.join(", "))}`
          : `${P} ${dim("hooks already current")}`,
      );
      break;
    }
    case "unhook": {
      const removed = uninstallHooks(repoRoot());
      log(
        removed.length
          ? `${P} removed hooks: ${yellow(removed.join(", "))}`
          : `${P} ${dim("hooks already removed")}`,
      );
      break;
    }
    default:
      console.log(`${pc.bold(CLI_NAME)} ${pc.dim("\u2014")} ${pc.dim("AI summaries for committed code")}

${pc.bold("Usage:")}
  ${CLI_NAME} ${pc.green("init")}                    Initialize, install hooks, and open the preview
  ${CLI_NAME} ${pc.green("init")} --no-preview       Initialize without starting the preview
  ${CLI_NAME} ${pc.green("install")}                 Alias for init
  ${CLI_NAME} ${pc.green("hook")}                    Install or refresh local Git hooks
  ${CLI_NAME} ${pc.green("unhook")}                  Remove ${TITLE_NAME} from local Git hooks
  ${CLI_NAME} ${pc.green("record")}                  Summarize the current HEAD commit
  ${CLI_NAME} ${pc.green("backfill")}                Preview the default bounded history scope
  ${CLI_NAME} ${pc.green("backfill")} --limit N      Generate at most N recent commits
  ${CLI_NAME} ${pc.green("backfill")} --all --yes    Generate every reachable commit
  ${CLI_NAME} ${pc.green("refresh")} ...             Alias for backfill
  ${CLI_NAME} ${pc.green("build")}                   Rebuild the private viewer cache
  ${CLI_NAME} ${pc.green("preview")}                 Open the bundled viewer with live reload
  ${CLI_NAME} ${pc.green("edit")} SHA                Edit a local summary
  ${CLI_NAME} ${pc.green("db")}                      Show and open the SQLite database location
  ${CLI_NAME} ${pc.green("sync")}                    Reserved for hosted multi-device sync

${pc.dim("Config:")} whatijustdid.json
${pc.dim("Agents:")} codex/openai (default) | claude | llama`);
      if (cmd && cmd !== "help") process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`${Perr} ${error.message}`);
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
  if (!Number.isInteger(number) || number <= 0)
    throw new Error(`${name} must be a positive integer`);
  return number;
}

function formatPlan(plan) {
  return (
    `${bold(plan.commitsToGenerate)} of ${bold(plan.selectedCommits)} selected commits need summaries; ` +
    `worst-case input \u2248 ${bold(formatNumber(plan.estimatedInputTokens))} tokens ` +
    `(${formatBytes(plan.worstCaseInputBytes)})`
  );
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
  if (reason === "no-code-changes")
    return "current commit has no code diff to summarize";
  if (reason === "not-a-merge")
    return "fast-forward merge needs no automatic history generation";
  return "summary already exists or another process is generating it";
}

function formatEntries(total) {
  return `${total} ${total === 1 ? "entry" : "entries"}`;
}

function agentConfigHelp(config, validation) {
  const configName = repoConfigName(config);
  const fixAgentHint = [
    `  Using a different AI provider? Update ${bold('"agent"')} and ${bold('"model"')} in ${path(configName)}`,
    `  ${dim(`(currently agent: ${bold(JSON.stringify(config.agent))}, model: ${bold(JSON.stringify(config.model))})`)}, then run ${green(`${CLI_NAME} init`)} again.`,
  ];
  if (!validation.key) {
    return [
      "",
      `${Perr} ${pc.red(bold(validation.error))}`,
      "",
      ...fixAgentHint,
      "",
    ].join("\n");
  }
  const anyAgentKey = `${ENV_PREFIX}_AGENT_API_KEY`;
  const assignment = (key) =>
    `${key}=<your-api-key>`.padEnd(`${anyAgentKey}=<your-api-key>`.length + 3);
  return [
    "",
    `${Perr} ${pc.red(bold(`${validation.key} environment variable is not set`))} ${dim(`(required by the "${validation.agent}" agent)`)}`,
    "",
    `  Add an API key to a ${path(".env")} file in your repo root:`,
    "",
    `    ${yellow(assignment(anyAgentKey))}${dim("works for any agent")}`,
    `    ${yellow(assignment(validation.key))}${dim(`for the "${validation.agent}" agent only`)}`,
    "",
    `  or export one of them in your shell.`,
    "",
    ...fixAgentHint,
    "",
  ].join("\n");
}

function repoConfigName(config) {
  return config.isDefaultConfig
    ? "whatijustdid.json"
    : relative(config.root, config.configPath) || "whatijustdid.json";
}

function commitMessageContainsSkip() {
  try {
    const message = execSync("git log -1 --pretty=%B", { encoding: "utf8" });
    return message.includes("[skip wijd]");
  } catch {
    return false;
  }
}
