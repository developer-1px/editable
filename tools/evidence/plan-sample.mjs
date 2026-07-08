#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const defaultRepoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);

if (isCliEntrypoint()) {
  main();
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    process.exit(0);
  }

  try {
    const result = planSample(options);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}

export function createEvidenceContext(repoRoot = defaultRepoRoot) {
  return {
    repoRoot,
    clipboardRoot: join(repoRoot, "tests/fixtures/clipboard-html-corpus"),
    manualTraceRoot: join(repoRoot, "tests/fixtures/manual-editor-traces"),
  };
}

export function planSample(
  args,
  context = createEvidenceContext(args.repoRoot),
) {
  if (!args.file) {
    throw new Error("Missing --file <path>.");
  }
  const samplePath = resolve(args.file);
  if (!existsSync(samplePath)) {
    throw new Error(`Sample file does not exist: ${args.file}`);
  }
  const payload = readJson(samplePath);
  if (payload.schema === "interactive-os.clipboard-html-sample@1") {
    return planClipboardSample(args, payload, context);
  }
  if (payload.schema === "interactive-os.manual-editor-trace@1") {
    return planManualTraceSample(args, payload, context);
  }
  throw new Error(`Unknown sample schema: ${payload.schema ?? "(missing)"}`);
}

function planClipboardSample(args, payload, context) {
  const manifest = readJson(join(context.clipboardRoot, "manifest.json"));
  if (!args.source) {
    throw new Error("Clipboard samples require --source <id>.");
  }
  const shapes = splitList(args.shapes ?? args.shape);
  if (shapes.length === 0) {
    throw new Error(
      "Clipboard samples require --shape <id> or --shapes <a,b>.",
    );
  }
  const source = manifest.requiredSources.find(
    (entry) => entry.id === args.source,
  );
  if (!source) {
    throw new Error(`Unknown clipboard source: ${args.source}`);
  }
  const unexpected = shapes.filter(
    (shape) => !source.requiredShapes.includes(shape),
  );
  if (unexpected.length > 0) {
    throw new Error(
      `Unexpected shape for ${args.source}: ${unexpected.join(", ")}`,
    );
  }
  const missingMime = manifest.requiredMimeTypes.filter(
    (type) =>
      typeof payload.mime?.[type] !== "string" ||
      payload.mime[type].length === 0,
  );
  if (missingMime.length > 0) {
    throw new Error(
      `Missing required MIME payloads: ${missingMime.join(", ")}`,
    );
  }
  const destination =
    args.destination ??
    `${args.source}/${shapes.length === 1 ? shapes[0] : "sample"}.json`;
  return {
    kind: "clipboard",
    valid: true,
    destination,
    manifestEntry: {
      path: destination,
      source: args.source,
      ...(shapes.length === 1 ? { shape: shapes[0] } : { shapes }),
    },
    requiredMimeTypes: manifest.requiredMimeTypes,
    actualMimeTypes: Object.keys(payload.mime ?? {}).sort(),
  };
}

function planManualTraceSample(args, payload, context) {
  const manifest = readJson(join(context.manualTraceRoot, "manifest.json"));
  const issueNumber = Number(args.issue ?? payload.issue);
  const scenario = args.scenario ?? payload.scenario;
  if (!Number.isInteger(issueNumber)) {
    throw new Error("Manual trace samples require --issue <number>.");
  }
  if (typeof scenario !== "string" || scenario.length === 0) {
    throw new Error("Manual trace samples require --scenario <id>.");
  }
  const issue = manifest.issues.find((entry) => entry.issue === issueNumber);
  if (!issue) {
    throw new Error(`Unknown manual trace issue: ${issueNumber}`);
  }
  const scenarioIds = issue.requiredScenarios.map((entry) => entry.id);
  if (!scenarioIds.includes(scenario)) {
    throw new Error(`Unexpected scenario for #${issueNumber}: ${scenario}`);
  }
  const invalidFields = [];
  if (payload.issue !== issueNumber) invalidFields.push("issue");
  if (payload.scenario !== scenario) invalidFields.push("scenario");
  if (!Array.isArray(payload.events)) invalidFields.push("events");
  if (!isObject(payload.source)) invalidFields.push("source");
  if (!isObject(payload.assertions)) invalidFields.push("assertions");
  if (!Array.isArray(payload.notes)) invalidFields.push("notes");
  if (invalidFields.length > 0) {
    throw new Error(`Invalid manual trace fields: ${invalidFields.join(", ")}`);
  }
  const destination =
    args.destination ?? `issue-${issueNumber}/${scenario}.json`;
  return {
    kind: "manual-trace",
    valid: true,
    destination,
    manifestEntry: {
      path: destination,
      scenario,
    },
    issue: issueNumber,
  };
}

export function parseArgs(args) {
  const options = {};
  const booleanOptions = new Set(["dry-run", "force"]);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") {
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (!arg.startsWith("--")) {
      throw new Error(`Unexpected positional argument: ${arg}`);
    }
    const key = arg.slice(2);
    if (booleanOptions.has(key)) {
      options[toCamelCase(key)] = true;
      continue;
    }
    const value = args[index + 1];
    if (typeof value !== "string" || value.startsWith("--")) {
      throw new Error(`Missing value for ${arg}.`);
    }
    options[toCamelCase(key)] = value;
    index += 1;
  }
  return options;
}

function splitList(value) {
  if (typeof value !== "string" || value.length === 0) {
    return [];
  }
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function printHelp() {
  console.log(`Usage:
  node tools/evidence/plan-sample.mjs --file sample.json --source slack --shape message-mention-link-emoji
  node tools/evidence/plan-sample.mjs --file trace.json --issue 85 --scenario macos-text-replacement-acceptance

Options:
  --file <path>         Downloaded evidence JSON.
  --source <id>         Clipboard source id.
  --shape <id>          Clipboard shape id.
  --shapes <a,b>        Clipboard shape ids when one sample covers multiple shapes.
  --issue <number>      Manual trace issue number.
  --scenario <id>       Manual trace scenario id.
  --destination <path>  Override the planned fixture path.
  --repo-root <path>    Override the repository root.
  --help, -h            Show this help.
`);
}

function isCliEntrypoint() {
  return process.argv[1] === fileURLToPath(import.meta.url);
}
