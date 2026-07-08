#!/usr/bin/env node
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const evidenceRoot = dirname(fileURLToPath(import.meta.url));
const options = parseCliArgs(process.argv.slice(2));

if (options.help) {
  printHelp();
  process.exit(0);
}

const host = options.host ?? "0.0.0.0";
const port = Number(options.port ?? 8787);

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  process.stderr.write(`Invalid --port: ${options.port}\n`);
  process.exit(1);
}

const urls = buildUrls(host, port);

if (options.printUrls) {
  printUrls(urls);
  process.exit(0);
}

const server = createServer((request, response) => {
  const requestUrl = new URL(
    request.url ?? "/",
    `http://${request.headers.host}`,
  );
  const pathname =
    requestUrl.pathname === "/"
      ? "/clipboard-capture.html"
      : requestUrl.pathname;
  const filePath = resolveSafePath(evidenceRoot, pathname);

  if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found\n");
    return;
  }

  response.writeHead(200, {
    "content-type": contentType(filePath),
    "cache-control": "no-store",
  });
  createReadStream(filePath).pipe(response);
});

server.on("error", (error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});

server.listen(port, host, () => {
  console.log(`Serving evidence tools from ${evidenceRoot}`);
  printUrls(urls);
  console.log("");
  console.log("Press Ctrl+C to stop.");
});

function buildUrls(host, port) {
  const hosts = host === "0.0.0.0" ? ["127.0.0.1", ...lanAddresses()] : [host];
  return hosts.map((entry) => ({
    host: entry,
    clipboard: `http://${entry}:${port}/clipboard-capture.html`,
    manualTrace: `http://${entry}:${port}/manual-trace-recorder.html`,
  }));
}

function lanAddresses() {
  const addresses = [];
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) {
        addresses.push(entry.address);
      }
    }
  }
  return addresses;
}

function resolveSafePath(root, pathname) {
  const decoded = decodeURIComponent(pathname);
  const absolutePath = resolve(root, `.${decoded}`);
  const relativePath = relative(root, absolutePath);
  if (relativePath.startsWith("..") || relativePath.split(sep).includes("..")) {
    return null;
  }
  return absolutePath;
}

function contentType(path) {
  switch (extname(path)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") {
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }
    if (arg === "--print-urls") {
      parsed.printUrls = true;
      continue;
    }
    if (arg !== "--host" && arg !== "--port") {
      throw new Error(`Unexpected argument: ${arg}`);
    }
    const value = args[index + 1];
    if (typeof value !== "string" || value.startsWith("--")) {
      throw new Error(`Missing value for ${arg}.`);
    }
    parsed[arg.slice(2)] = value;
    index += 1;
  }
  return parsed;
}

function parseCliArgs(args) {
  try {
    return parseArgs(args);
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exit(1);
  }
}

function printUrls(urls) {
  for (const entry of urls) {
    console.log(`Clipboard capture: ${entry.clipboard}`);
    console.log(`Manual trace recorder: ${entry.manualTrace}`);
  }
}

function printHelp() {
  console.log(`Usage:
  node tools/evidence/serve.mjs [--host 0.0.0.0] [--port 8787]

Options:
  --host <host>    Host to bind. Defaults to 0.0.0.0 for mobile device access.
  --port <port>    Port to bind. Defaults to 8787.
  --print-urls     Print capture URLs and exit without starting the server.
  --help, -h       Show this help.
`);
}
