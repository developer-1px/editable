#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import { runCommand } from "./verify-internal-command-runner.mjs";
import { runBuildWithRouteTreeCheck } from "./verify-internal-route-tree.mjs";
import {
  verifyNoFocusedOrSkippedTests,
  verifyVitestDiscoveryParity,
} from "./verify-internal-test-markers.mjs";

export { runBuildWithRouteTreeCheck } from "./verify-internal-route-tree.mjs";
export {
  compareTestFileSets,
  forbiddenTestMarkerViolations,
  parseVitestListFiles,
  verifyNoFocusedOrSkippedTests,
  verifyVitestDiscoveryParity,
} from "./verify-internal-test-markers.mjs";

const DEFAULT_REPEAT = 3;
const SHUFFLE_SEED = "20260621";
const commands = [
  ["pnpm", ["run", "verify:docs"]],
  ["pnpm", ["run", "verify:boundaries"]],
  ["pnpm", ["exec", "tsc", "--noEmit"]],
  ["pnpm", ["test"]],
  [
    "pnpm",
    [
      "exec",
      "vitest",
      "run",
      "--sequence.shuffle",
      `--sequence.seed=${SHUFFLE_SEED}`,
    ],
  ],
  ["pnpm", ["check"]],
  ["pnpm", ["build"]],
  ["git", ["diff", "--check"]],
];

if (isMainModule()) {
  await main();
}

async function main(args = process.argv.slice(2)) {
  const repeat = parseRepeat(args);

  for (let iteration = 1; iteration <= repeat; iteration += 1) {
    console.log(`\n[verify-internal] iteration ${iteration}/${repeat}`);

    await runTestMarkerCheck(iteration);

    for (const [command, commandArgs] of commands) {
      if (
        command === "pnpm" &&
        commandArgs.length === 1 &&
        commandArgs[0] === "build"
      ) {
        await runBuildWithRouteTreeCheck(iteration);
        continue;
      }

      await runCommand(command, commandArgs, iteration);
    }
  }

  console.log(`\n[verify-internal] passed ${repeat}/${repeat} iterations`);
}

function isMainModule() {
  return (
    process.argv[1] !== undefined &&
    import.meta.url === pathToFileURL(process.argv[1]).href
  );
}

export function parseRepeat(args) {
  const repeatArg = args.find((arg) => arg.startsWith("--repeat="));
  if (repeatArg === undefined) {
    return DEFAULT_REPEAT;
  }

  const rawValue = repeatArg.slice("--repeat=".length);
  if (!/^[1-9]\d*$/.test(rawValue)) {
    throw new Error(`Invalid --repeat value: ${repeatArg}`);
  }

  const value = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`Invalid --repeat value: ${repeatArg}`);
  }

  return value;
}

async function runTestMarkerCheck(iteration) {
  console.log("[verify-internal] focused/skipped/todo test marker scan");
  const result = verifyNoFocusedOrSkippedTests();
  if (result.violations.length === 0) {
    console.log(
      `[verify-internal] test marker scan passed (${result.testFiles.length} test files)`,
    );
    const discovery = verifyVitestDiscoveryParity(result.testFiles);
    console.log(
      `[verify-internal] Vitest discovery parity passed (${discovery.vitestFiles.length} test files)`,
    );
    return;
  }

  console.error("Forbidden focused/skipped/todo test markers:");
  for (const violation of result.violations) {
    console.error(`- ${violation}`);
  }
  throw new Error(
    `[verify-internal] failed on iteration ${iteration}: focused/skipped/todo test marker scan`,
  );
}
