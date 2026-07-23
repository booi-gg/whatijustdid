import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, watch } from "node:fs";
import { createServer } from "node:http";
import { basename, dirname } from "node:path";
import {
  CLI_NAME,
  VIEWER_FILENAME,
  VIEWER_CSS_FILENAME,
  VIEWER_JS_FILENAME,
  VIEWER_FILE_PATH,
  VIEWER_CSS_FILE_PATH,
  VIEWER_JS_FILE_PATH,
  SSE_PATH,
} from "./brand.mjs";
import { build, readViewerSnapshot } from "./build.mjs";
import { clearHistory } from "./clear.mjs";
import { createDraftProjector } from "./draft.mjs";
import { commitShas } from "./git.mjs";
import { generate, planGeneration } from "./generate.mjs";
import { recordCommittedChange } from "./record.mjs";

const DEFAULT_PORT = 9453;
const ACTION_TOKEN_PLACEHOLDER = "__WHATIJUSTDID_ACTION_TOKEN__";
const BACKFILL_PATH = "/api/actions/backfill";
const CLEAR_HISTORY_PATH = "/api/actions/clear-history";
const GENERATE_SUMMARY_PREFIX = "/api/actions/generate-summary/";
const VIEWER_MODEL_PATH = "/api/viewer-model";
const LIVE_RELOAD_CLIENT = `<script>
  (() => {
    const source = new EventSource("${SSE_PATH}");
    source.addEventListener("reload", () => window.location.reload());
    source.addEventListener("data", () =>
      window.dispatchEvent(new Event("whatijustdid:data-changed"))
    );
  })();
</script>`;

/** Serve the package-owned viewer and push live asset/data updates to browsers. */
export async function startPreview(config, options = {}, dependencies = {}) {
  const viewerFile = VIEWER_FILE_PATH;
  const dataFile = config.dataFile;
  if (!existsSync(viewerFile)) {
    throw new Error(
      `Bundled viewer not found at ${viewerFile}; reinstall ${CLI_NAME}`,
    );
  }
  if (!existsSync(VIEWER_JS_FILE_PATH)) {
    throw new Error(
      `Bundled viewer script not found at ${VIEWER_JS_FILE_PATH}; reinstall ${CLI_NAME}`,
    );
  }
  if (!dataFile) throw new Error("Private viewer data path is not configured");

  const host = options.host ?? "127.0.0.1";
  const explicitPort =
    options.port !== undefined && options.port !== null && options.port !== "";
  const port = previewPort(options.port);
  const clients = new Set();
  const actionToken = randomUUID();
  const runClearHistory = dependencies.clearHistory ?? clearHistory;
  const runGenerate = dependencies.generate ?? generate;
  const runPlanGeneration = dependencies.planGeneration ?? planGeneration;
  const runBuild = dependencies.build ?? build;
  const runReadViewerSnapshot =
    dependencies.readViewerSnapshot ?? readViewerSnapshot;
  const listCommitShas = dependencies.commitShas ?? commitShas;
  const runRecordCommittedChange =
    dependencies.recordCommittedChange ?? recordCommittedChange;
  const server = createServer((request, response) => {
    void serveRequest(
      request,
      response,
      {
        viewerFile,
        dataFile,
        clients,
        actionToken,
        config,
        runClearHistory,
        runGenerate,
        runPlanGeneration,
        runBuild,
        runReadViewerSnapshot,
        listCommitShas,
        runRecordCommittedChange,
      },
      url,
    ).catch((error) => {
      if (response.headersSent) {
        response.destroy();
        return;
      }
      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end(`${CLI_NAME} preview: ${error.message}\n`);
    });
  });

  try {
    await listen(server, port, host);
  } catch (error) {
    if (error?.code !== "EADDRINUSE") throw error;
    if (explicitPort) {
      throw new Error(
        `Port ${port} is already in use; pass a different --port or free it up`,
        { cause: error },
      );
    }
    /* Default port taken (usually another preview instance) — let the OS
       assign a free one; the printed URL reports the actual port. */
    await listen(server, 0, host);
  }
  const address = server.address();
  const url = `http://${host}:${address.port}`;
  let reloadTimer;
  const watchedFiles = [
    { event: "reload", file: viewerFile },
    { event: "reload", file: VIEWER_CSS_FILE_PATH },
    { event: "reload", file: VIEWER_JS_FILE_PATH },
    { event: "data", file: dataFile },
  ];
  const watchers = watchedFiles.map(({ event, file }) =>
    watch(dirname(file), (_watchEvent, filename) => {
      if (filename && String(filename) !== basename(file)) return;
      clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => notifyClients(clients, event), 50);
    }),
  );

  const close = async () => {
    clearTimeout(reloadTimer);
    for (const watcher of watchers) watcher.close();
    for (const client of clients) client.end();
    clients.clear();
    await closeServer(server);
  };

  if (options.open !== false) openBrowser(url);
  return { close, server, url };
}

async function serveRequest(request, response, files, url) {
  const method = request.method ?? "GET";
  const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
  if (pathname === BACKFILL_PATH) {
    await serveBackfill(request, response, files, method);
    return;
  }
  if (pathname === CLEAR_HISTORY_PATH) {
    serveClearHistory(request, response, files, method);
    return;
  }
  if (pathname.startsWith(GENERATE_SUMMARY_PREFIX)) {
    await serveGenerateSummary(request, response, files, method, pathname);
    return;
  }
  if (pathname === VIEWER_MODEL_PATH) {
    serveViewerModel(response, files, method);
    return;
  }
  if (method !== "GET" && method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end();
    return;
  }

  if (pathname === "/") {
    response.writeHead(302, { Location: `/${VIEWER_FILENAME}` });
    response.end();
    return;
  }
  if (pathname === SSE_PATH) {
    response.writeHead(200, {
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream",
    });
    response.write(": connected\n\n");
    files.clients.add(response);
    request.on("close", () => files.clients.delete(response));
    return;
  }
  if (
    pathname === `/${VIEWER_CSS_FILENAME}` &&
    existsSync(VIEWER_CSS_FILE_PATH)
  ) {
    send(
      response,
      method,
      200,
      "text/css; charset=utf-8",
      readFileSync(VIEWER_CSS_FILE_PATH),
    );
    return;
  }
  if (
    pathname === `/${VIEWER_JS_FILENAME}` &&
    existsSync(VIEWER_JS_FILE_PATH)
  ) {
    send(
      response,
      method,
      200,
      "text/javascript; charset=utf-8",
      readFileSync(VIEWER_JS_FILE_PATH),
    );
    return;
  }
  if (pathname === `/${VIEWER_FILENAME}`) {
    let html = readFileSync(files.viewerFile, "utf8");
    if (html.includes("</body>")) {
      html = html.replace("</body>", `${LIVE_RELOAD_CLIENT}\n</body>`);
    } else {
      html = `${html}\n${LIVE_RELOAD_CLIENT}\n`;
    }
    html = html.replaceAll("__PREVIEW_URL__", url);
    html = html.replaceAll(ACTION_TOKEN_PLACEHOLDER, files.actionToken);
    send(response, method, 200, "text/html; charset=utf-8", html);
    return;
  }
  if (pathname === "/data.js" && existsSync(files.dataFile)) {
    send(
      response,
      method,
      200,
      "text/javascript; charset=utf-8",
      readFileSync(files.dataFile),
    );
    return;
  }

  send(response, method, 404, "text/plain; charset=utf-8", "Not found\n");
}

async function serveBackfill(request, response, files, method) {
  if (method !== "POST") {
    response.writeHead(405, { Allow: "POST" });
    response.end();
    return;
  }
  if (request.headers["x-whatijustdid-action-token"] !== files.actionToken) {
    sendJson(response, 403, {
      error: "This action is not authorized by the active preview session",
    });
    return;
  }
  if (request.headers["x-whatijustdid-confirm"] !== "backfill") {
    sendJson(response, 400, {
      error: "Backfilling summaries requires explicit confirmation",
    });
    return;
  }

  let body;
  try {
    body = await readJsonBody(request);
  } catch (error) {
    sendJson(
      response,
      error?.code === "WHATIJUSTDID_BODY_TOO_LARGE" ? 413 : 400,
      {
        error: error?.message ?? "Backfill settings must be valid JSON",
      },
    );
    return;
  }

  const limit = body?.limit;
  const maximum =
    Number.isSafeInteger(files.config.viewerLimit) &&
    files.config.viewerLimit > 0
      ? files.config.viewerLimit
      : 200;
  if (!Number.isSafeInteger(limit) || limit <= 0 || limit > maximum) {
    sendJson(response, 400, {
      error: `Choose a backfill limit from 1 to ${maximum}`,
    });
    return;
  }

  try {
    const plan = files.runPlanGeneration(files.config, { limit });
    const result = await files.runGenerate(files.config, {
      limit,
      plan,
      continueOnError: true,
    });
    const viewerEntries = files.runBuild(files.config);
    sendJson(response, 200, {
      selectedCommits: plan.selectedCommits,
      generated: result.generated,
      skipped: result.skipped,
      failed: result.failures.length,
      viewerEntries,
    });
  } catch (error) {
    try {
      files.runBuild(files.config);
    } catch {
      // The backfill error is more useful than a secondary cache failure.
    }
    sendJson(response, 500, {
      error: error?.message ?? "Unable to backfill summaries",
    });
  }
}

function serveViewerModel(response, files, method) {
  if (method !== "GET" && method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end();
    return;
  }
  try {
    const snapshot = files.runReadViewerSnapshot(files.config);
    sendJson(response, 200, snapshot, method);
  } catch (error) {
    sendJson(
      response,
      500,
      {
        error: error?.message ?? "Unable to read viewer data",
      },
      method,
    );
  }
}

async function serveGenerateSummary(
  request,
  response,
  files,
  method,
  pathname,
) {
  if (method !== "POST") {
    response.writeHead(405, { Allow: "POST" });
    response.end();
    return;
  }
  if (request.headers["x-whatijustdid-action-token"] !== files.actionToken) {
    sendJson(response, 403, {
      error: "This action is not authorized by the active preview session",
    });
    return;
  }

  const sha = pathname.slice(GENERATE_SUMMARY_PREFIX.length).toLowerCase();
  if (!/^[0-9a-f]{40}$/u.test(sha)) {
    sendJson(response, 400, { error: "Choose a valid commit to generate" });
    return;
  }

  const visibleShas = files.listCommitShas(
    files.config.viewerLimit,
    files.config.root,
  );
  if (!visibleShas.includes(sha)) {
    sendJson(response, 404, {
      error: "This commit is no longer in the current viewer history",
    });
    return;
  }

  startGenerationStream(response);
  writeGenerationEvent(response, { type: "started", sha });
  const projectDraft = createDraftProjector((changes) => {
    writeGenerationEvent(response, { type: "draft", sha, changes });
  });

  let result;
  try {
    result = await files.runRecordCommittedChange(
      files.config,
      {},
      { sha, onOutputTextDelta: projectDraft },
    );
  } catch (error) {
    const group = rebuildAndReadGroup(files, sha);
    writeGenerationEvent(response, {
      type: "failed",
      sha,
      error: error?.message ?? "Unable to generate this summary",
      ...(group ? { group } : {}),
    });
    endGenerationStream(response);
    return;
  }

  if (result.reason === "no-code-changes") {
    writeGenerationEvent(response, {
      type: "failed",
      sha,
      error: "This commit has no code diff to summarize",
    });
    endGenerationStream(response);
    return;
  }

  let viewerEntries = null;
  let snapshotWarning = null;
  try {
    viewerEntries = files.runBuild(files.config);
  } catch (error) {
    snapshotWarning =
      error?.message ??
      "The summary was saved but the static viewer cache could not refresh";
  }

  try {
    const group = readGroup(files, sha);
    if (!group)
      throw new Error("Generated commit is no longer in viewer history");
    writeGenerationEvent(response, {
      type: "complete",
      sha,
      created: result.created,
      reason: result.reason,
      viewerEntries,
      group,
      ...(snapshotWarning ? { warning: snapshotWarning } : {}),
    });
  } catch (error) {
    writeGenerationEvent(response, {
      type: "failed",
      sha,
      error:
        error?.message ??
        "The summary was saved but the viewer could not update",
    });
  }
  endGenerationStream(response);
}

function rebuildAndReadGroup(files, sha) {
  try {
    files.runBuild(files.config);
  } catch {
    // Preserve the primary generation error when cache rebuilding also fails.
  }
  try {
    return readGroup(files, sha);
  } catch {
    return null;
  }
}

function readGroup(files, sha) {
  const snapshot = files.runReadViewerSnapshot(files.config);
  return snapshot.groups.find((group) => group.sha === sha) ?? null;
}

function serveClearHistory(request, response, files, method) {
  if (method !== "POST") {
    response.writeHead(405, { Allow: "POST" });
    response.end();
    return;
  }
  if (request.headers["x-whatijustdid-action-token"] !== files.actionToken) {
    sendJson(response, 403, {
      error: "This action is not authorized by the active preview session",
    });
    return;
  }
  if (request.headers["x-whatijustdid-confirm"] !== "clear-history") {
    sendJson(response, 400, {
      error: "Clearing history requires explicit confirmation",
    });
    return;
  }

  try {
    const result = files.runClearHistory(files.config, { confirm: true });
    sendJson(response, 200, result);
  } catch (error) {
    const status = error?.code === "WHATIJUSTDID_ACTIVE_GENERATION" ? 409 : 500;
    sendJson(response, status, {
      error: error?.message ?? "Unable to clear local history",
    });
  }
}

function startGenerationStream(response) {
  response.writeHead(200, {
    "Cache-Control": "no-store",
    Connection: "keep-alive",
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
  response.flushHeaders();
}

function writeGenerationEvent(response, event) {
  if (response.destroyed || response.writableEnded) return false;
  return response.write(`${JSON.stringify(event)}\n`);
}

function endGenerationStream(response) {
  if (!response.destroyed && !response.writableEnded) response.end();
}

function sendJson(response, status, body, method = "GET") {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(method === "HEAD" ? undefined : `${JSON.stringify(body)}\n`);
}

async function readJsonBody(request) {
  const maximumBytes = 4_096;
  const contentLength = Number(request.headers["content-length"] ?? 0);
  if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
    const error = new Error("Backfill settings are too large");
    error.code = "WHATIJUSTDID_BODY_TOO_LARGE";
    throw error;
  }

  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > maximumBytes) {
      const error = new Error("Backfill settings are too large");
      error.code = "WHATIJUSTDID_BODY_TOO_LARGE";
      throw error;
    }
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new Error("Backfill settings must be valid JSON");
  }
}

function send(response, method, status, contentType, body) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": contentType,
  });
  response.end(method === "HEAD" ? undefined : body);
}

function notifyClients(clients, event) {
  const message = `event: ${event}\ndata: ${Date.now()}\n\n`;
  for (const client of clients) client.write(message);
}

function previewPort(value) {
  if (value === undefined || value === null || value === "")
    return DEFAULT_PORT;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error(
      `Preview port must be an integer from 0 to 65535: ${value}`,
    );
  }
  return port;
}

function listen(server, port, host) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function openBrowser(url) {
  const command =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["cmd.exe", ["/c", "start", "", url]]
        : ["xdg-open", [url]];
  try {
    const child = spawn(command[0], command[1], {
      detached: true,
      stdio: "ignore",
    });
    child.on("error", () => {});
    child.unref();
  } catch {
    // The printed URL remains usable when no browser opener is available.
  }
}
