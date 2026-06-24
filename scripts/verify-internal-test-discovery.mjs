import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const TEST_SCAN_EXCLUDED_DIRECTORIES = new Set([
  ".cache",
  ".git",
  ".nitro",
  ".output",
  ".tanstack",
  ".vinxi",
  ".wrangler",
  "coverage",
  "dist",
  "node_modules",
]);
const TEST_SCAN_EXCLUDED_RELATIVE_DIRECTORIES = new Set(["tests/browser"]);

export function verifyVitestDiscoveryParity(scanFiles, options = {}) {
  const vitestFiles =
    options.vitestFiles ?? collectVitestTestFiles(options.spawnSync);
  const result = compareTestFileSets(vitestFiles, scanFiles);
  if (result.missingFromScan.length === 0 && result.extraInScan.length === 0) {
    return result;
  }

  console.error("Vitest discovery and test marker scan file sets differ:");
  printFileSetDifference("Missing from marker scan", result.missingFromScan);
  printFileSetDifference("Extra in marker scan", result.extraInScan);
  throw new Error(
    "[verify-internal] Vitest discovery differs from focused/skipped/todo test marker scan. Update test discovery policy or scanner coverage.",
  );
}

export function parseVitestListFiles(stdout) {
  const entries = JSON.parse(stdout);
  if (!Array.isArray(entries)) {
    throw new Error("Vitest list JSON output is not an array.");
  }
  return entries.map((entry) => {
    if (
      entry === null ||
      typeof entry !== "object" ||
      typeof entry.file !== "string"
    ) {
      throw new Error(
        "Vitest list JSON output contains an invalid file entry.",
      );
    }
    return entry.file;
  });
}

export function compareTestFileSets(vitestFiles, scanFiles) {
  const sortedVitestFiles = [...vitestFiles].sort();
  const sortedScanFiles = [...scanFiles].sort();
  const scanFileSet = new Set(sortedScanFiles);
  const vitestFileSet = new Set(sortedVitestFiles);
  return {
    vitestFiles: sortedVitestFiles,
    scanFiles: sortedScanFiles,
    missingFromScan: sortedVitestFiles.filter((file) => !scanFileSet.has(file)),
    extraInScan: sortedScanFiles.filter((file) => !vitestFileSet.has(file)),
  };
}

export function findTestFiles(root) {
  if (!existsSync(root)) {
    return [];
  }
  return findTestFilesInDirectory(root, root).sort();
}

function collectVitestTestFiles(run = spawnSync) {
  const result = run(
    "pnpm",
    ["exec", "vitest", "list", "--filesOnly", "--json"],
    {
      encoding: "utf8",
    },
  );
  if (result.status !== 0) {
    const output = [result.stderr, result.stdout].filter(Boolean).join("\n");
    throw new Error(
      `[verify-internal] failed to list Vitest test files.${output === "" ? "" : `\n${output}`}`,
    );
  }
  return parseVitestListFiles(result.stdout);
}

function printFileSetDifference(label, files) {
  if (files.length === 0) {
    return;
  }
  console.error(`${label}:`);
  for (const file of files) {
    console.error(`- ${file}`);
  }
}

function findTestFilesInDirectory(root, directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    if (TEST_SCAN_EXCLUDED_DIRECTORIES.has(entry)) {
      continue;
    }
    const path = join(directory, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      const relativePath = relative(root, path).split(sep).join("/");
      if (TEST_SCAN_EXCLUDED_RELATIVE_DIRECTORIES.has(relativePath)) {
        continue;
      }
      files.push(...findTestFilesInDirectory(root, path));
      continue;
    }
    if (stats.isFile() && isTestFile(path)) {
      files.push(path);
    }
  }
  return files;
}

function isTestFile(path) {
  return /\.(test|spec)\.(cjs|cts|js|jsx|mjs|mts|ts|tsx)$/.test(path);
}
