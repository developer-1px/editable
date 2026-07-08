#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createEvidenceContext,
  parseArgs,
  planSample,
  readJson,
} from "./plan-sample.mjs";

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
    const result = importSample(options);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}

export function importSample(
  args,
  context = createEvidenceContext(args.repoRoot),
) {
  const plan = planSample(args, context);
  const corpusRoot =
    plan.kind === "clipboard" ? context.clipboardRoot : context.manualTraceRoot;
  const manifestPath = join(corpusRoot, "manifest.json");
  const manifest = readJson(manifestPath);
  const destination = resolveDestination(corpusRoot, plan.destination);
  const sourcePath = resolve(args.file);

  if (existsSync(destination.absolutePath) && !args.force) {
    throw new Error(
      `Destination already exists: ${relativePath(context.repoRoot, destination.absolutePath)}. Use --force to overwrite.`,
    );
  }

  if (plan.kind === "clipboard") {
    upsertClipboardManifestEntry(manifest, plan.manifestEntry, args.force);
  } else {
    upsertManualTraceManifestEntry(
      manifest,
      plan.issue,
      plan.manifestEntry,
      args.force,
    );
  }

  const result = {
    ...plan,
    imported: !args.dryRun,
    dryRun: Boolean(args.dryRun),
    destination: destination.relativePath,
    destinationPath: relativePath(context.repoRoot, destination.absolutePath),
    manifestPath: relativePath(context.repoRoot, manifestPath),
  };

  if (!args.dryRun) {
    mkdirSync(dirname(destination.absolutePath), { recursive: true });
    copyFileSync(sourcePath, destination.absolutePath);
    writeJson(manifestPath, manifest);
  }

  return result;
}

function upsertClipboardManifestEntry(manifest, entry, force) {
  const entryShapes = sampleShapes(entry);
  const samples = manifest.samples ?? [];
  const conflicts = samples.filter(
    (sample) =>
      (sample.path === entry.path &&
        (sample.source !== entry.source ||
          !sameMembers(sampleShapes(sample), entryShapes))) ||
      (sample.path !== entry.path &&
        sample.source === entry.source &&
        intersects(sampleShapes(sample), entryShapes)),
  );

  if (conflicts.length > 0 && !force) {
    throw new Error(
      `Clipboard manifest already covers ${entry.source}/${entryShapes.join(", ")} in ${conflicts.map((sample) => sample.path).join(", ")}. Use --force to replace.`,
    );
  }

  manifest.samples = samples.filter(
    (sample) =>
      sample.path !== entry.path &&
      !(
        force &&
        sample.source === entry.source &&
        intersects(sampleShapes(sample), entryShapes)
      ),
  );
  manifest.samples.push(entry);
}

function upsertManualTraceManifestEntry(manifest, issueNumber, entry, force) {
  const issue = manifest.issues.find(
    (candidate) => candidate.issue === issueNumber,
  );
  if (!issue) {
    throw new Error(`Unknown manual trace issue: ${issueNumber}`);
  }

  const samples = issue.samples ?? [];
  const conflicts = samples.filter(
    (sample) =>
      (sample.path === entry.path && sample.scenario !== entry.scenario) ||
      (sample.path !== entry.path && sample.scenario === entry.scenario),
  );

  if (conflicts.length > 0 && !force) {
    throw new Error(
      `Manual trace manifest already covers #${issueNumber}/${entry.scenario} in ${conflicts.map((sample) => sample.path).join(", ")}. Use --force to replace.`,
    );
  }

  issue.samples = samples.filter(
    (sample) =>
      sample.path !== entry.path &&
      !(force && sample.scenario === entry.scenario),
  );
  issue.samples.push(entry);
}

function resolveDestination(root, destination) {
  if (isAbsolute(destination)) {
    throw new Error(`Destination must be relative: ${destination}`);
  }

  const absolutePath = resolve(root, destination);
  const relativeDestination = relative(root, absolutePath);
  if (relativeDestination.startsWith("..") || isAbsolute(relativeDestination)) {
    throw new Error(`Destination escapes the corpus root: ${destination}`);
  }
  if (!relativeDestination.endsWith(".json")) {
    throw new Error(`Destination must be a JSON file: ${destination}`);
  }

  return {
    absolutePath,
    relativePath: relativeDestination.split(sep).join("/"),
  };
}

function sampleShapes(sample) {
  return sample.shapes ?? [sample.shape];
}

function intersects(left, right) {
  return left.some((entry) => right.includes(entry));
}

function sameMembers(left, right) {
  return (
    left.length === right.length && left.every((entry) => right.includes(entry))
  );
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function relativePath(from, to) {
  return relative(from, to).split(sep).join("/");
}

function printHelp() {
  console.log(`Usage:
  node tools/evidence/import-sample.mjs --file sample.json --source slack --shape message-mention-link-emoji
  node tools/evidence/import-sample.mjs --file trace.json --issue 85 --scenario macos-text-replacement-acceptance

Options:
  --file <path>         Downloaded evidence JSON.
  --source <id>         Clipboard source id.
  --shape <id>          Clipboard shape id.
  --shapes <a,b>        Clipboard shape ids when one sample covers multiple shapes.
  --issue <number>      Manual trace issue number.
  --scenario <id>       Manual trace scenario id.
  --destination <path>  Override the planned fixture path.
  --repo-root <path>    Override the repository root.
  --dry-run             Validate and print paths without writing files.
  --force               Overwrite the destination and replace matching manifest entries.
  --help, -h            Show this help.
`);
}

function isCliEntrypoint() {
  return process.argv[1] === fileURLToPath(import.meta.url);
}
