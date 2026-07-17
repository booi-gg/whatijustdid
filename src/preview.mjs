import { spawn } from "node:child_process";
import { existsSync, readFileSync, watch } from "node:fs";
import { createServer } from "node:http";
import { basename, dirname } from "node:path";
import { CLI_NAME, VIEWER_FILENAME, VIEWER_FILE_PATH, SSE_PATH } from "./brand.mjs";

const DEFAULT_PORT = 4173;
const LIVE_RELOAD_CLIENT = `<script>
  (() => {
    const source = new EventSource("${SSE_PATH}");
    source.addEventListener("reload", () => window.location.reload());
  })();
</script>`;

/** Serve the package-owned viewer and reload connected browsers when it changes. */
export async function startPreview(config, options = {}) {
  const viewerFile = VIEWER_FILE_PATH;
  const dataFile = config.dataFile;
  if (!existsSync(viewerFile)) {
    throw new Error(`Bundled viewer not found at ${viewerFile}; reinstall ${CLI_NAME}`);
  }
  if (!dataFile) throw new Error("Private viewer data path is not configured");

  const host = options.host ?? "127.0.0.1";
  const port = previewPort(options.port);
  const clients = new Set();
  const server = createServer((request, response) => {
    try {
      serveRequest(request, response, { viewerFile, dataFile, clients }, url);
    } catch (error) {
      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end(`${CLI_NAME} preview: ${error.message}\n`);
    }
  });

  await listen(server, port, host);
  const address = server.address();
  const url = `http://${host}:${address.port}`;
  let reloadTimer;
  const watchers = [viewerFile, dataFile].map((file) =>
    watch(dirname(file), (_event, filename) => {
      if (filename && String(filename) !== basename(file)) return;
      clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => notifyReload(clients), 50);
    }));

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

function serveRequest(request, response, files, url) {
  const method = request.method ?? "GET";
  if (method !== "GET" && method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end();
    return;
  }

  const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
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
  if (pathname === `/${VIEWER_FILENAME}`) {
    let html = readFileSync(files.viewerFile, "utf8");
    if (html.includes("</body>")) {
      html = html.replace("</body>", `${LIVE_RELOAD_CLIENT}\n</body>`);
    } else {
      html = `${html}\n${LIVE_RELOAD_CLIENT}\n`;
    }
    html = html.replaceAll("__PREVIEW_URL__", url);
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

function send(response, method, status, contentType, body) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": contentType,
  });
  response.end(method === "HEAD" ? undefined : body);
}

function notifyReload(clients) {
  const message = `event: reload\ndata: ${Date.now()}\n\n`;
  for (const client of clients) client.write(message);
}

function previewPort(value) {
  if (value === undefined || value === null || value === "") return DEFAULT_PORT;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error(`Preview port must be an integer from 0 to 65535: ${value}`);
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
    server.close((error) => error ? reject(error) : resolve());
  });
}

function openBrowser(url) {
  const command = process.platform === "darwin"
    ? ["open", [url]]
    : process.platform === "win32"
      ? ["cmd.exe", ["/c", "start", "", url]]
      : ["xdg-open", [url]];
  try {
    const child = spawn(command[0], command[1], { detached: true, stdio: "ignore" });
    child.on("error", () => {});
    child.unref();
  } catch {
    // The printed URL remains usable when no browser opener is available.
  }
}
