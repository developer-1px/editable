#!/usr/bin/env node
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const evidenceRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(evidenceRoot, "../..");
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

if (options.printIndex) {
  process.stdout.write(buildIndexHtml());
  process.exit(0);
}

const server = createServer((request, response) => {
  const requestUrl = new URL(
    request.url ?? "/",
    `http://${request.headers.host}`,
  );
  if (requestUrl.pathname === "/" || requestUrl.pathname === "/index.html") {
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end(buildIndexHtml());
    return;
  }

  const pathname = requestUrl.pathname;
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
    index: `http://${entry}:${port}/`,
    clipboard: `http://${entry}:${port}/clipboard-capture.html`,
    manualTrace: `http://${entry}:${port}/manual-trace-recorder.html`,
  }));
}

function buildIndexHtml() {
  const missing = collectMissingEvidence();
  const rows = missing
    .map(
      (item) => `<tr>
        <td>#${item.issue}</td>
        <td>${escapeHtml(item.target)}</td>
        <td><a href="${item.href}">${escapeHtml(item.tool)}</a></td>
        <td><code>${escapeHtml(item.importCommand)}</code></td>
      </tr>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Evidence Capture</title>
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: #f8f7f4;
        color: #1d1b18;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      main {
        width: min(100%, 1120px);
        margin: 0 auto;
        padding: 32px 18px;
      }
      h1 { margin: 0 0 18px; font-size: 1.45rem; line-height: 1.25; }
      .links { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 18px; }
      a {
        color: #1d1b18;
        text-decoration-thickness: 1px;
        text-underline-offset: 3px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        background: #fffdfa;
      }
      th, td {
        border-bottom: 1px solid #d8d4cc;
        padding: 9px 10px;
        text-align: left;
        vertical-align: top;
      }
      th {
        color: #6b6258;
        font-size: 0.78rem;
        letter-spacing: 0;
        text-transform: uppercase;
      }
      code {
        white-space: normal;
        word-break: break-word;
        font-family: "SFMono-Regular", Consolas, monospace;
        font-size: 0.78rem;
      }
      @media (max-width: 760px) {
        table, thead, tbody, tr, th, td { display: block; }
        thead { display: none; }
        tr { border-bottom: 1px solid #d8d4cc; }
        td { border-bottom: 0; padding: 6px 0; }
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Evidence Capture</h1>
      <div class="links">
        <a href="/clipboard-capture.html">Clipboard capture</a>
        <a href="/manual-trace-recorder.html">Manual trace recorder</a>
      </div>
      <table>
        <thead>
          <tr>
            <th>Issue</th>
            <th>Missing Target</th>
            <th>Tool</th>
            <th>Import Command</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </main>
  </body>
</html>
`;
}

function collectMissingEvidence() {
  return [
    ...collectMissingClipboardEvidence(),
    ...collectMissingManualTraces(),
  ];
}

function collectMissingClipboardEvidence() {
  const corpusRoot = join(repoRoot, "tests/fixtures/clipboard-html-corpus");
  const manifest = readJson(join(corpusRoot, "manifest.json"));
  const collected = new Map(
    manifest.requiredSources.map((source) => [source.id, new Set()]),
  );

  for (const sample of manifest.samples) {
    if (!existsSync(join(corpusRoot, sample.path))) {
      continue;
    }
    for (const shape of sample.shapes ?? [sample.shape]) {
      collected.get(sample.source)?.add(shape);
    }
  }

  return manifest.requiredSources.flatMap((source) =>
    source.requiredShapes
      .filter((shape) => !collected.get(source.id)?.has(shape))
      .map((shape) => ({
        issue: manifest.issue,
        target: `${source.id}/${shape}.json`,
        tool: "Clipboard capture",
        href: "/clipboard-capture.html",
        importCommand: `pnpm run evidence:import -- --file <downloaded-json> --source ${source.id} --shape ${shape}`,
      })),
  );
}

function collectMissingManualTraces() {
  const traceRoot = join(repoRoot, "tests/fixtures/manual-editor-traces");
  const manifest = readJson(join(traceRoot, "manifest.json"));

  return manifest.issues.flatMap((issue) => {
    const collected = new Set(
      issue.samples
        .filter((sample) => existsSync(join(traceRoot, sample.path)))
        .map((sample) => sample.scenario),
    );
    return issue.requiredScenarios
      .map((scenario) => scenario.id)
      .filter((scenario) => !collected.has(scenario))
      .map((scenario) => ({
        issue: issue.issue,
        target: `issue-${issue.issue}/${scenario}.json`,
        tool: "Manual trace recorder",
        href: "/manual-trace-recorder.html",
        importCommand: `pnpm run evidence:import -- --file <trace-json> --issue ${issue.issue} --scenario ${scenario}`,
      }));
  });
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
    if (arg === "--print-index") {
      parsed.printIndex = true;
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
    console.log(`Evidence index: ${entry.index}`);
    console.log(`Clipboard capture: ${entry.clipboard}`);
    console.log(`Manual trace recorder: ${entry.manualTrace}`);
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function printHelp() {
  console.log(`Usage:
  node tools/evidence/serve.mjs [--host 0.0.0.0] [--port 8787]

Options:
  --host <host>    Host to bind. Defaults to 0.0.0.0 for mobile device access.
  --port <port>    Port to bind. Defaults to 8787.
  --print-urls     Print capture URLs and exit without starting the server.
  --print-index    Print the evidence index HTML and exit.
  --help, -h       Show this help.
`);
}
