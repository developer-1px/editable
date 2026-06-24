import { readFileSync } from "node:fs";
import { relative, sep } from "node:path";

export {
  compareTestFileSets,
  parseVitestListFiles,
  verifyVitestDiscoveryParity,
} from "./verify-internal-test-discovery.mjs";
export { forbiddenTestMarkerViolations } from "./verify-internal-test-marker-ast.mjs";

import { findTestFiles } from "./verify-internal-test-discovery.mjs";
import { forbiddenTestMarkerViolations } from "./verify-internal-test-marker-ast.mjs";

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
