#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const DEFAULT_REPEAT = 3;
const ROUTE_TREE_PATH = join(process.cwd(), "src", "routeTree.gen.ts");
const SHUFFLE_SEED = "20260621";
const FORBIDDEN_TEST_MARKERS = new Set([
  "fails",
  "only",
  "runIf",
  "skip",
  "skipIf",
  "todo",
]);
const VITEST_TEST_FUNCTIONS = new Set(["describe", "suite", "it", "test"]);
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

export function verifyNoFocusedOrSkippedTests(root = process.cwd()) {
  const testFiles = findTestFiles(root);
  const violations = [];

  for (const file of testFiles) {
    const path = relative(root, file).split(sep).join("/");
    const source = readFileSync(file, "utf8");
    violations.push(...forbiddenTestMarkerViolations(path, source));
  }

  return { testFiles, violations };
}

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

export function forbiddenTestMarkerViolations(path, source) {
  const sourceFile = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKindForPath(path),
  );
  const parentMap = collectParentMap(sourceFile);
  const vitestBindings = { parentMap };
  const violations = [];
  const seen = new Set();

  function addViolation(node, chain, marker) {
    const position = sourceFile.getLineAndCharacterOfPosition(
      node.getStart(sourceFile),
    );
    const key = `${position.line}:${position.character}:${chain.join(".")}`;
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    violations.push(
      `${path}:${position.line + 1}:${position.character + 1} uses forbidden Vitest test marker: ${chain.join(".")} (${marker})`,
    );
  }

  function visit(node) {
    if (ts.isCallExpression(node)) {
      const chain = expressionChain(node.expression);
      const marker = forbiddenMarkerInChain(chain);
      if (
        marker !== undefined &&
        isVitestTestChain(chain, node.expression, vitestBindings)
      ) {
        addViolation(node.expression, chain, marker);
      }
    }

    if (ts.isVariableDeclaration(node) && node.initializer !== undefined) {
      const chain = expressionChain(node.initializer);
      const marker = forbiddenMarkerInChain(chain);
      if (
        marker !== undefined &&
        isVitestTestChain(chain, node.initializer, vitestBindings)
      ) {
        addViolation(node.initializer, chain, marker);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return violations;
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

      const suffix = signal === null ? `exit code ${code}` : `signal ${signal}`;
      reject(
        new Error(
          `[verify-internal] failed on iteration ${iteration}: ${label} (${suffix})`,
        ),
      );
    });
  });
}

export async function runBuildWithRouteTreeCheck(iteration, options = {}) {
  const routeTreePath = options.routeTreePath ?? ROUTE_TREE_PATH;
  const run = options.runCommand ?? runCommand;
  const before = readFileSync(routeTreePath, "utf8");

  await run("pnpm", ["build"], iteration);

  const after = readFileSync(routeTreePath, "utf8");
  if (after === before) {
    return;
  }

  writeFileSync(routeTreePath, before);
  throw new Error(
    "[verify-internal] pnpm build regenerated src/routeTree.gen.ts. Run `pnpm build` and commit the generated output.",
  );
}

function findTestFiles(root) {
  if (!existsSync(root)) {
    return [];
  }
  return findTestFilesInDirectory(root, root).sort();
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

function scriptKindForPath(path) {
  if (path.endsWith(".tsx")) {
    return ts.ScriptKind.TSX;
  }
  if (path.endsWith(".jsx") || path.endsWith(".js") || path.endsWith(".mjs")) {
    return ts.ScriptKind.JS;
  }
  return ts.ScriptKind.TS;
}

function expressionChain(expression) {
  if (ts.isIdentifier(expression)) {
    return [expression.text];
  }
  if (ts.isPropertyAccessExpression(expression)) {
    return [...expressionChain(expression.expression), expression.name.text];
  }
  if (
    ts.isElementAccessExpression(expression) &&
    ts.isStringLiteralLike(expression.argumentExpression)
  ) {
    return [
      ...expressionChain(expression.expression),
      expression.argumentExpression.text,
    ];
  }
  if (ts.isCallExpression(expression)) {
    return expressionChain(expression.expression);
  }
  return [];
}

function collectParentMap(sourceFile) {
  const parentMap = new WeakMap();

  function visit(node) {
    ts.forEachChild(node, (child) => {
      parentMap.set(child, node);
      visit(child);
    });
  }

  visit(sourceFile);
  return parentMap;
}

function isVitestTestChain(chain, node, bindings) {
  if (forbiddenMarkerInChain(chain) === undefined) {
    return false;
  }

  return isVitestTestReferenceChain(chain, node, bindings);
}

function isVitestTestReferenceChain(chain, node, bindings, seen = new Set()) {
  if (chain.length === 0) {
    return false;
  }

  const resolved = resolveVitestIdentifier(chain[0], node, bindings, seen);
  if (resolved === "direct") {
    return true;
  }

  return (
    chain.length >= 2 &&
    resolved === "namespace" &&
    VITEST_TEST_FUNCTIONS.has(chain[1])
  );
}

function resolveVitestIdentifier(name, node, bindings, seen) {
  const binding = nearestLexicalBinding(name, node, bindings.parentMap);
  if (binding === undefined) {
    return VITEST_TEST_FUNCTIONS.has(name) ? "direct" : "none";
  }

  if (binding.kind === "namedImport") {
    return "direct";
  }

  if (binding.kind === "namespaceImport") {
    return "namespace";
  }

  if (
    binding.kind === "variable" &&
    binding.initializer !== undefined &&
    binding.isInitializedBeforeUse
  ) {
    if (seen.has(binding.node)) {
      return "none";
    }
    seen.add(binding.node);

    const chain = expressionChain(binding.initializer);
    if (
      forbiddenMarkerInChain(chain) === undefined &&
      isVitestTestReferenceChain(chain, binding.initializer, bindings, seen)
    ) {
      return "direct";
    }
  }

  return "none";
}

function nearestLexicalBinding(name, node, parentMap) {
  let current = node;
  while (current !== undefined) {
    const binding = bindingInScope(name, current, node);
    if (binding !== undefined) {
      return binding;
    }
    current = parentMap.get(current);
  }
  return undefined;
}

function bindingInScope(name, scope, useNode) {
  if (ts.isSourceFile(scope) || ts.isBlock(scope) || ts.isModuleBlock(scope)) {
    for (const statement of scope.statements) {
      const binding = bindingInStatement(name, statement, useNode);
      if (binding !== undefined) {
        return binding;
      }
    }
    return undefined;
  }

  if (ts.isFunctionLike(scope)) {
    for (const parameter of scope.parameters) {
      if (bindingNames(parameter.name).includes(name)) {
        return { kind: "local", node: parameter };
      }
    }
    return undefined;
  }

  if (ts.isCatchClause(scope) && scope.variableDeclaration !== undefined) {
    if (bindingNames(scope.variableDeclaration.name).includes(name)) {
      return { kind: "local", node: scope.variableDeclaration };
    }
  }

  if (
    (ts.isForStatement(scope) ||
      ts.isForInStatement(scope) ||
      ts.isForOfStatement(scope)) &&
    scope.initializer !== undefined &&
    ts.isVariableDeclarationList(scope.initializer)
  ) {
    return bindingInVariableDeclarationList(name, scope.initializer, useNode);
  }

  return undefined;
}

function bindingInStatement(name, statement, useNode) {
  if (ts.isImportDeclaration(statement)) {
    return bindingInImportDeclaration(name, statement);
  }

  if (ts.isVariableStatement(statement)) {
    return bindingInVariableDeclarationList(
      name,
      statement.declarationList,
      useNode,
    );
  }

  if (
    (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) &&
    statement.name?.text === name
  ) {
    return { kind: "local", node: statement };
  }

  return undefined;
}

function bindingInImportDeclaration(name, statement) {
  if (
    !ts.isStringLiteralLike(statement.moduleSpecifier) ||
    statement.moduleSpecifier.text !== "vitest" ||
    statement.importClause === undefined ||
    statement.importClause.isTypeOnly
  ) {
    return undefined;
  }

  const bindings = statement.importClause.namedBindings;
  if (bindings === undefined) {
    return undefined;
  }

  if (ts.isNamespaceImport(bindings)) {
    return bindings.name.text === name
      ? { kind: "namespaceImport", node: bindings }
      : undefined;
  }

  for (const element of bindings.elements) {
    if (element.isTypeOnly || element.name.text !== name) {
      continue;
    }
    const importedName = element.propertyName?.text ?? element.name.text;
    if (VITEST_TEST_FUNCTIONS.has(importedName)) {
      return { kind: "namedImport", node: element };
    }
  }

  return undefined;
}

function bindingInVariableDeclarationList(name, declarationList, useNode) {
  for (const declaration of declarationList.declarations) {
    if (bindingNames(declaration.name).includes(name)) {
      return {
        kind: "variable",
        node: declaration,
        initializer: declaration.initializer,
        isInitializedBeforeUse: isDeclaredBeforeUse(declaration, useNode),
      };
    }
  }
  return undefined;
}

function isDeclaredBeforeUse(declaration, useNode) {
  return declaration.pos <= useNode.pos;
}

function forbiddenMarkerInChain(chain) {
  return chain.find((entry) => FORBIDDEN_TEST_MARKERS.has(entry));
}

function bindingNames(name) {
  if (ts.isIdentifier(name)) {
    return [name.text];
  }

  if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
    return name.elements.flatMap((element) => {
      if (ts.isOmittedExpression(element)) {
        return [];
      }
      return bindingNames(element.name);
    });
  }

  return [];
}
