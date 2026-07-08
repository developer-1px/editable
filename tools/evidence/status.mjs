#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const clipboardRoot = join(repoRoot, "tests/fixtures/clipboard-html-corpus");
const manualTraceRoot = join(repoRoot, "tests/fixtures/manual-editor-traces");
const args = new Set(process.argv.slice(2));

if (args.has("--help") || args.has("-h")) {
  printHelp();
  process.exit(0);
}

const report = buildReport();

if (args.has("--json")) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  printReport(report);
}

if (report.problems.length > 0) {
  process.exitCode = 1;
} else if (args.has("--require-complete") && !report.complete) {
  process.exitCode = 1;
}

function buildReport() {
  const clipboard = buildClipboardReport();
  const manualTraces = buildManualTraceReport();
  const problems = [...clipboard.problems, ...manualTraces.problems];
  return {
    complete: clipboard.complete && manualTraces.complete && problems.length === 0,
    clipboard,
    manualTraces,
    problems,
  };
}

function buildClipboardReport() {
  const manifest = readJson(join(clipboardRoot, "manifest.json"));
  const collectedBySource = new Map();
  const samples = [];
  const problems = [];

  for (const source of manifest.requiredSources) {
    collectedBySource.set(source.id, new Set());
  }

  for (const sample of manifest.samples) {
    const sampleShapes = sample.shapes ?? [sample.shape];
    const samplePath = join(clipboardRoot, sample.path);
    const sourceShapes = collectedBySource.get(sample.source);
    const sampleReport = {
      path: sample.path,
      source: sample.source,
      shapes: sampleShapes.filter(isString),
      exists: existsSync(samplePath),
      valid: false,
    };

    if (!sourceShapes) {
      problems.push(`Unknown clipboard source '${sample.source}' in ${sample.path}`);
    }

    for (const shape of sampleShapes) {
      if (!isString(shape)) {
        problems.push(`Clipboard sample ${sample.path} has a non-string shape`);
        continue;
      }
      if (!sourceShapes) {
        continue;
      }
      const source = manifest.requiredSources.find((entry) => entry.id === sample.source);
      if (!source.requiredShapes.includes(shape)) {
        problems.push(
          `Clipboard sample ${sample.path} declares unexpected shape '${shape}'`,
        );
        continue;
      }
      sourceShapes.add(shape);
    }

    if (!sampleReport.exists) {
      problems.push(`Clipboard sample file is missing: ${sample.path}`);
      samples.push(sampleReport);
      continue;
    }

    const payload = readJson(samplePath);
    const missingMime = manifest.requiredMimeTypes.filter(
      (type) => typeof payload.mime?.[type] !== "string" || payload.mime[type].length === 0,
    );
    if (payload.schema !== "interactive-os.clipboard-html-sample@1") {
      problems.push(`Clipboard sample ${sample.path} has an invalid schema`);
    }
    if (missingMime.length > 0) {
      problems.push(
        `Clipboard sample ${sample.path} is missing MIME: ${missingMime.join(", ")}`,
      );
    }
    sampleReport.valid =
      payload.schema === "interactive-os.clipboard-html-sample@1" &&
      missingMime.length === 0;
    samples.push(sampleReport);
  }

  const sources = manifest.requiredSources.map((source) => {
    const collected = [...(collectedBySource.get(source.id) ?? new Set())];
    const missing = source.requiredShapes.filter((shape) => !collected.includes(shape));
    return {
      id: source.id,
      name: source.name,
      required: source.requiredShapes,
      collected,
      missing,
      complete: missing.length === 0,
    };
  });

  return {
    issue: manifest.issue,
    status: manifest.status,
    complete: sources.every((source) => source.complete) && problems.length === 0,
    sources,
    samples,
    problems,
  };
}

function buildManualTraceReport() {
  const manifest = readJson(join(manualTraceRoot, "manifest.json"));
  const problems = [];
  const issues = manifest.issues.map((issue) => {
    const requiredScenarios = issue.requiredScenarios.map((scenario) => scenario.id);
    const collected = [];
    const samples = [];

    for (const sample of issue.samples) {
      const samplePath = join(manualTraceRoot, sample.path);
      const sampleReport = {
        path: sample.path,
        scenario: sample.scenario,
        exists: existsSync(samplePath),
        valid: false,
      };

      if (!requiredScenarios.includes(sample.scenario)) {
        problems.push(
          `Manual trace issue #${issue.issue} sample ${sample.path} declares unexpected scenario '${sample.scenario}'`,
        );
      }
      if (!sampleReport.exists) {
        problems.push(`Manual trace sample file is missing: ${sample.path}`);
        samples.push(sampleReport);
        continue;
      }

      const payload = readJson(samplePath);
      const valid =
        payload.schema === "interactive-os.manual-editor-trace@1" &&
        payload.issue === issue.issue &&
        payload.scenario === sample.scenario &&
        Array.isArray(payload.events) &&
        typeof payload.source === "object" &&
        payload.source !== null &&
        typeof payload.assertions === "object" &&
        payload.assertions !== null &&
        Array.isArray(payload.notes);

      if (!valid) {
        problems.push(`Manual trace sample ${sample.path} has an invalid payload`);
      } else {
        collected.push(sample.scenario);
      }
      sampleReport.valid = valid;
      samples.push(sampleReport);
    }

    const missing = requiredScenarios.filter((scenario) => !collected.includes(scenario));
    return {
      issue: issue.issue,
      title: issue.title,
      required: requiredScenarios,
      collected,
      missing,
      complete: missing.length === 0,
      samples,
    };
  });

  return {
    status: manifest.status,
    complete: issues.every((issue) => issue.complete) && problems.length === 0,
    issues,
    problems,
  };
}

function printReport(report) {
  console.log("Evidence status");
  console.log(`complete: ${report.complete ? "yes" : "no"}`);
  console.log("");
  console.log(`Clipboard corpus (#${report.clipboard.issue})`);
  for (const source of report.clipboard.sources) {
    console.log(
      `- ${source.id}: ${source.collected.length}/${source.required.length} collected` +
        (source.missing.length > 0 ? `; missing ${source.missing.join(", ")}` : ""),
    );
  }
  console.log("");
  console.log("Manual traces");
  for (const issue of report.manualTraces.issues) {
    console.log(
      `- #${issue.issue}: ${issue.collected.length}/${issue.required.length} collected` +
        (issue.missing.length > 0 ? `; missing ${issue.missing.join(", ")}` : ""),
    );
  }
  if (report.problems.length > 0) {
    console.log("");
    console.log("Problems");
    for (const problem of report.problems) {
      console.log(`- ${problem}`);
    }
  }
}

function printHelp() {
  console.log(`Usage: node tools/evidence/status.mjs [--json] [--require-complete]

Reports clipboard and manual trace evidence coverage.

Options:
  --json              Print machine-readable JSON.
  --require-complete  Exit 1 when required evidence is still missing.
  --help, -h          Show this help.
`);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function isString(value) {
  return typeof value === "string";
}
