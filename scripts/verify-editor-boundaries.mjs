#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";
import {
  checkPublicEditorFacade,
  checkReactEditorFacade,
  publicEditorFacadeViolations,
} from "./verify-editor-boundary-facades.mjs";
import { checkImport } from "./verify-editor-boundary-imports.mjs";
import {
  findSourceFiles,
  importSpecifiers,
} from "./verify-editor-boundary-scanner.mjs";

export { publicEditorFacadeViolations };

export function verifyEditorBoundaries(root = process.cwd()) {
  const sourceRoot = join(root, "src");
  const sourceFiles = findSourceFiles(sourceRoot);
  const violations = [];

  checkPublicEditorFacade(root, sourceFiles, violations);
  checkReactEditorFacade(root, sourceFiles, violations);

  for (const file of sourceFiles) {
    const path = relative(root, file).split(sep).join("/");
    const imports = importSpecifiers(readFileSync(file, "utf8"));

    for (const specifier of imports) {
      checkImport(path, specifier, violations);
    }
  }

  return violations;
}

if (isMainModule()) {
  const violations = verifyEditorBoundaries();
  if (violations.length > 0) {
    console.error("Editor boundary violations:");
    for (const violation of violations) {
      console.error(`- ${violation}`);
    }
    process.exit(1);
  }
}

function isMainModule() {
  return (
    process.argv[1] !== undefined &&
    import.meta.url === pathToFileURL(process.argv[1]).href
  );
}
