#!/usr/bin/env node

import { spawn } from "node:child_process";

const DEFAULT_REPEAT = 3;
const SHUFFLE_SEED = "20260621";
const commands = [
  ["pnpm", ["exec", "tsc", "--noEmit"]],
  ["pnpm", ["test"]],
  [
    "pnpm",
    ["exec", "vitest", "run", "--sequence.shuffle", `--sequence.seed=${SHUFFLE_SEED}`],
  ],
  ["pnpm", ["check"]],
  ["pnpm", ["build"]],
  ["git", ["diff", "--check"]],
];

const repeat = parseRepeat(process.argv.slice(2));

for (let iteration = 1; iteration <= repeat; iteration += 1) {
  console.log(`\n[verify-internal] iteration ${iteration}/${repeat}`);

  for (const [command, args] of commands) {
    await runCommand(command, args, iteration);
  }
}

console.log(`\n[verify-internal] passed ${repeat}/${repeat} iterations`);

function parseRepeat(args) {
  const repeatArg = args.find((arg) => arg.startsWith("--repeat="));
  if (repeatArg === undefined) {
    return DEFAULT_REPEAT;
  }

  const value = Number.parseInt(repeatArg.slice("--repeat=".length), 10);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`Invalid --repeat value: ${repeatArg}`);
  }

  return value;
}

function runCommand(command, args, iteration) {
  const label = `${command} ${args.join(" ")}`;
  console.log(`[verify-internal] ${label}`);

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: process.env,
      stdio: "inherit",
    });

    child.on("error", (error) => {
      reject(error);
    });
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      const suffix =
        signal === null ? `exit code ${code}` : `signal ${signal}`;
      reject(
        new Error(
          `[verify-internal] failed on iteration ${iteration}: ${label} (${suffix})`,
        ),
      );
    });
  });
}
