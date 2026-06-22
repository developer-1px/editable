#!/usr/bin/env node

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export function verifyDocsInventory(root = process.cwd()) {
  const docsRoot = join(root, "docs");
  const readmePath = join(root, "README.md");
  const docsFiles = readdirSync(docsRoot)
    .filter((entry) => entry.endsWith(".md"))
    .filter((entry) => statSync(join(docsRoot, entry)).isFile())
    .map((entry) => `docs/${entry}`)
    .sort();
  const editorDocs = docsFiles.filter((path) =>
    /^docs\/editor-.*\.md$/.test(path),
  );
  const editorDocsMissingEvidence = editorDocs.filter(
    (path) => !hasEvidenceStrengthSection(join(root, path)),
  );

  const readme = readFileSync(readmePath, "utf8");
  const docsSection = extractDocsSection(readme);
  if (docsSection === null) {
    return {
      docsFiles,
      editorDocs,
      readmeDocs: [],
      missingFromReadme: [],
      staleReadmeLinks: [],
      duplicateReadmeLinks: [],
      editorDocsMissingEvidence,
      violations: [
        "README.md is missing a ## Docs section.",
        ...editorDocsMissingEvidence.map(
          (path) => `Missing editor evidence section: ${path}`,
        ),
      ],
    };
  }

  const readmeDocs = extractReadmeDocs(docsSection);
  const readmeDocsSet = new Set(readmeDocs);
  const docsFilesSet = new Set(docsFiles);
  const missingFromReadme = docsFiles.filter(
    (path) => !readmeDocsSet.has(path),
  );
  const staleReadmeLinks = readmeDocs.filter((path) => !docsFilesSet.has(path));
  const duplicateReadmeLinks = readmeDocs.filter(
    (path, index) => readmeDocs.indexOf(path) !== index,
  );

  return {
    docsFiles,
    editorDocs,
    readmeDocs,
    missingFromReadme,
    staleReadmeLinks,
    duplicateReadmeLinks,
    editorDocsMissingEvidence,
    violations: [
      ...missingFromReadme.map((path) => `Missing from README Docs: ${path}`),
      ...staleReadmeLinks.map(
        (path) => `README Docs link without file: ${path}`,
      ),
      ...duplicateReadmeLinks.map(
        (path) => `Duplicate README Docs link: ${path}`,
      ),
      ...editorDocsMissingEvidence.map(
        (path) => `Missing editor evidence section: ${path}`,
      ),
    ],
  };
}

if (isMainModule()) {
  const result = verifyDocsInventory();
  if (result.violations.length > 0) {
    if (result.violations.includes("README.md is missing a ## Docs section.")) {
      console.error("README.md is missing a ## Docs section.");
    } else {
      console.error("README Docs inventory is stale.");
      printList("Missing from README Docs", result.missingFromReadme);
      printList("README Docs links without files", result.staleReadmeLinks);
      printList("Duplicate README Docs links", result.duplicateReadmeLinks);
    }
    printList(
      "Editor docs missing evidence sections",
      result.editorDocsMissingEvidence,
    );
    process.exit(1);
  }

  console.log(
    `[verify-docs-inventory] README Docs covers ${result.docsFiles.length} docs files; evidence strength covers ${result.editorDocs.length} editor docs`,
  );
}

function isMainModule() {
  return (
    process.argv[1] !== undefined &&
    import.meta.url === pathToFileURL(process.argv[1]).href
  );
}

function extractDocsSection(source) {
  const lines = source.split("\n");
  const headingIndex = lines.findIndex((line) => line.trim() === "## Docs");
  if (headingIndex === -1) {
    return null;
  }
  const nextHeadingIndex = lines.findIndex(
    (line, index) => index > headingIndex && /^##\s+/.test(line),
  );
  const endIndex = nextHeadingIndex === -1 ? lines.length : nextHeadingIndex;
  return lines.slice(headingIndex + 1, endIndex).join("\n");
}

function extractReadmeDocs(section) {
  const paths = [];
  const pattern = /`(docs\/[^`]+\.md)`|\]\((docs\/[^)]+\.md)\)/g;
  for (const line of section.split("\n")) {
    if (!line.trimStart().startsWith("- ")) {
      continue;
    }
    let match = pattern.exec(line);
    while (match !== null) {
      paths.push(match[1] ?? match[2]);
      match = pattern.exec(line);
    }
  }
  return paths.sort();
}

function hasEvidenceStrengthSection(path) {
  return /^## 증거 강도$/m.test(readFileSync(path, "utf8"));
}

function printList(label, paths) {
  if (paths.length === 0) {
    return;
  }
  console.error(`${label}:`);
  for (const path of paths) {
    console.error(`- ${path}`);
  }
}
