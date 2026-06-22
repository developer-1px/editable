#!/usr/bin/env node

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

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

function checkPublicEditorFacade(root, sourceFiles, violations) {
  const forbiddenExports = [
    "createNoteDocument",
    "initialNoteDocument",
    "DispatchOptions",
    "FigureBlockInput",
    "exportInlineMarkdown",
    "exportMarkdown",
    "importMarkdown",
    "InlineNode",
    "MentionInlineInput",
    "NoteDocumentSchema",
    "NoteBlock",
    "SelectionSnap",
    "BlockEditor",
    "BlockEditorProps",
  ];
  const publicFiles = sourceFiles.filter((file) =>
    relative(root, file).split(sep).join("/").startsWith("src/editor/public/"),
  );

  for (const file of publicFiles) {
    const path = relative(root, file).split(sep).join("/");
    const source = readFileSync(file, "utf8");
    violations.push(...publicEditorFacadeViolations(path, source));
    for (const name of forbiddenExports) {
      if (publicFileExportsName(source, name)) {
        violations.push(`${path} exposes non-public editor helper: ${name}`);
      }
    }
  }
}

export function publicEditorFacadeViolations(path, source) {
  const violations = [];
  for (const exportSpecifier of exportSpecifiers(source)) {
    const specifier = exportSpecifier.specifier.replaceAll("\\", "/");
    if (
      exportSpecifier.kind === "star" &&
      isEditorImplementationImport(specifier)
    ) {
      violations.push(
        `${path} exposes internal editor implementation through public facade: ${exportSpecifier.specifier}`,
      );
      continue;
    }
    if (isEditorMarkdownAdapterImport(specifier)) {
      violations.push(
        `${path} exposes internal markdown adapter through public facade: ${exportSpecifier.specifier}`,
      );
    }
  }

  for (const exportBlock of exportFromBlocks(source)) {
    const specifier = exportBlock.specifier.replaceAll("\\", "/");
    if (isEditorMarkdownAdapterImport(specifier)) {
      continue;
    }
    for (const entry of exportBlock.entries) {
      if (isForbiddenPublicImport(specifier, entry.localName)) {
        violations.push(
          `${path} exposes non-public editor helper: ${entry.localName}`,
        );
        continue;
      }
      if (isPublicInternalExportAlias(specifier, entry)) {
        violations.push(
          `${path} exposes public editor helper under non-public name: ${entry.exportedName}`,
        );
      }
    }
  }

  const forbiddenImportedLocals = forbiddenImportedLocalBindings(source);
  const publicImportedLocalBindings = publicImportedLocalBindingNames(source);
  for (const exportEntry of exportEntries(source)) {
    if (forbiddenImportedLocals.has(exportEntry.localName)) {
      violations.push(
        `${path} exposes imported non-public editor helper: ${exportEntry.localName}`,
      );
      continue;
    }
    const publicName = publicImportedLocalBindings.get(exportEntry.localName);
    if (publicName !== undefined && exportEntry.exportedName !== publicName) {
      violations.push(
        `${path} exposes public editor helper under non-public name: ${exportEntry.exportedName}`,
      );
    }
  }
  return violations;
}

function checkReactEditorFacade(root, sourceFiles, violations) {
  const forbiddenExports = [
    "createEditor",
    "parseNoteDocument",
    "CreateEditorOptions",
    "Editor",
    "EditorCommand",
    "EditorResult",
    "EditorSnapshot",
    "NoteDocument",
    "RichSelection",
    "SelectionSnap",
  ];
  const reactFiles = sourceFiles.filter((file) =>
    relative(root, file).split(sep).join("/").startsWith("src/editor/react/"),
  );

  for (const file of reactFiles) {
    const path = relative(root, file).split(sep).join("/");
    const source = readFileSync(file, "utf8");
    violations.push(...reactEditorFacadeViolations(path, source));
    for (const name of forbiddenExports) {
      if (publicFileExportsName(source, name)) {
        violations.push(
          `${path} exposes headless editor API through react facade: ${name}`,
        );
      }
    }
  }
}

function reactEditorFacadeViolations(path, source) {
  const violations = [];
  for (const exportSpecifier of exportSpecifiers(source)) {
    const specifier = exportSpecifier.specifier.replaceAll("\\", "/");
    if (
      exportSpecifier.kind === "star" &&
      isEditorReactImplementationImport(specifier)
    ) {
      violations.push(
        `${path} exposes internal React implementation through react facade: ${exportSpecifier.specifier}`,
      );
    }
  }

  for (const exportBlock of exportFromBlocks(source)) {
    const specifier = exportBlock.specifier.replaceAll("\\", "/");
    for (const entry of exportBlock.entries) {
      if (isForbiddenReactImport(specifier, entry.localName)) {
        violations.push(
          `${path} exposes non-public React helper through react facade: ${entry.localName}`,
        );
        continue;
      }
      if (isReactInternalExportAlias(specifier, entry)) {
        violations.push(
          `${path} exposes React helper under non-public name: ${entry.exportedName}`,
        );
      }
    }
  }

  const forbiddenImportedLocals = forbiddenReactImportedLocalBindings(source);
  const reactImportedLocalBindings = reactImportedLocalBindingNames(source);
  for (const exportEntry of exportEntries(source)) {
    if (forbiddenImportedLocals.has(exportEntry.localName)) {
      violations.push(
        `${path} exposes imported non-public React helper: ${exportEntry.localName}`,
      );
      continue;
    }
    const publicName = reactImportedLocalBindings.get(exportEntry.localName);
    if (publicName !== undefined && exportEntry.exportedName !== publicName) {
      violations.push(
        `${path} exposes React helper under non-public name: ${exportEntry.exportedName}`,
      );
    }
  }
  return violations;
}

function checkImport(path, specifier, violations) {
  const normalized = specifier.replaceAll("\\", "/");

  if (!path.startsWith("src/editor/")) {
    if (
      isEditorInternalImport(normalized) ||
      isLegacyEditorImport(normalized)
    ) {
      violations.push(
        `${path} imports hidden editor implementation: ${specifier}`,
      );
    }
    return;
  }

  if (path.startsWith("src/editor/public/")) {
    if (isEditorReactImport(normalized)) {
      violations.push(
        `${path} mixes React facade into headless public facade: ${specifier}`,
      );
    }
    if (
      normalized.includes("../internal/react") ||
      normalized.includes("../internal/view") ||
      normalized.includes("../internal/debug")
    ) {
      violations.push(
        `${path} leaks non-model internals through public: ${specifier}`,
      );
    }
    return;
  }

  if (path.startsWith("src/editor/react/")) {
    if (isEditorPublicImport(normalized)) {
      violations.push(
        `${path} mixes headless public facade into react facade: ${specifier}`,
      );
    }
    if (
      normalized.startsWith("../internal/") &&
      !normalized.startsWith("../internal/react/")
    ) {
      violations.push(
        `${path} leaks non-react internals through react facade: ${specifier}`,
      );
    }
    return;
  }

  if (path.startsWith("src/editor/internal/")) {
    checkInternalImport(path, normalized, specifier, violations);
  }
}

function checkInternalImport(path, normalized, specifier, violations) {
  const importerSegment = internalSegmentFromPath(path);
  const targetSegment = internalSegmentFromSpecifier(path, normalized);

  if (
    importerSegment === undefined ||
    targetSegment === undefined ||
    importerSegment === targetSegment
  ) {
    return;
  }

  if (targetSegment === "testing" || targetSegment === "fixtures") {
    if (!isTestFile(path) && importerSegment !== "fixtures") {
      violations.push(
        `${path} imports test-only editor ${targetSegment}: ${specifier}`,
      );
    }
    return;
  }

  if (importerSegment === "model") {
    violations.push(
      `${path} imports non-model editor internal segment: ${specifier}`,
    );
    return;
  }

  if (importerSegment === "view" && targetSegment !== "model") {
    violations.push(
      `${path} imports non-model editor internal segment from view: ${specifier}`,
    );
    return;
  }

  if (importerSegment === "debug" && targetSegment !== "model") {
    violations.push(
      `${path} imports non-model editor internal segment from debug: ${specifier}`,
    );
    return;
  }

  if (importerSegment === "testing") {
    violations.push(
      `${path} imports editor implementation from test helper: ${specifier}`,
    );
    return;
  }

  if (importerSegment === "fixtures" && targetSegment !== "testing") {
    violations.push(
      `${path} imports non-testing editor internal segment from fixture: ${specifier}`,
    );
  }
}

function publicFileExportsName(source, name) {
  const exportBlocks = source.matchAll(
    /export\s+(?:type\s+)?\{([\s\S]*?)\}(?:\s+from\s+["'][^"']+["'])?/g,
  );
  for (const match of exportBlocks) {
    const block = match[1] ?? "";
    const names = block
      .split(",")
      .flatMap((entry) => exportNamesFromEntry(entry))
      .filter(Boolean);
    if (names.includes(name)) {
      return true;
    }
  }

  return new RegExp(
    `\\bexport\\s+(?:declare\\s+)?(?:const|let|var|function|class|type|interface|enum)\\s+${name}\\b`,
  ).test(source);
}

function forbiddenImportedLocalBindings(source) {
  const bindings = new Set();
  for (const importBlock of importBlocks(source)) {
    for (const entry of importBlock.namedImports) {
      if (isForbiddenPublicImport(importBlock.specifier, entry.importedName)) {
        bindings.add(entry.localName);
      }
    }
    if (
      importBlock.namespaceImport !== undefined &&
      isForbiddenNamespaceImport(importBlock.specifier)
    ) {
      bindings.add(importBlock.namespaceImport);
    }
  }
  return bindings;
}

function publicImportedLocalBindingNames(source) {
  const bindings = new Map();
  for (const importBlock of importBlocks(source)) {
    for (const entry of importBlock.namedImports) {
      if (
        isEditorImplementationImport(importBlock.specifier) &&
        !isForbiddenPublicImport(importBlock.specifier, entry.importedName)
      ) {
        bindings.set(entry.localName, entry.importedName);
      }
    }
  }
  return bindings;
}

function forbiddenReactImportedLocalBindings(source) {
  const bindings = new Set();
  for (const importBlock of importBlocks(source)) {
    for (const entry of importBlock.namedImports) {
      if (isForbiddenReactImport(importBlock.specifier, entry.importedName)) {
        bindings.add(entry.localName);
      }
    }
    if (
      importBlock.namespaceImport !== undefined &&
      isEditorImplementationImport(importBlock.specifier)
    ) {
      bindings.add(importBlock.namespaceImport);
    }
  }
  return bindings;
}

function reactImportedLocalBindingNames(source) {
  const bindings = new Map();
  for (const importBlock of importBlocks(source)) {
    for (const entry of importBlock.namedImports) {
      if (
        isEditorReactImplementationImport(importBlock.specifier) &&
        !isForbiddenReactImport(importBlock.specifier, entry.importedName)
      ) {
        bindings.set(entry.localName, entry.importedName);
      }
    }
  }
  return bindings;
}

function isForbiddenPublicImport(specifier, importedName) {
  const normalized = specifier.replaceAll("\\", "/");
  if (isEditorMarkdownAdapterImport(normalized)) {
    return true;
  }

  return (
    isEditorImplementationImport(normalized) &&
    !isAllowedPublicInternalImport(normalized, importedName)
  );
}

function isAllowedPublicInternalImport(specifier, importedName) {
  if (specifier.endsWith("/internal/model/editorCore")) {
    return [
      "CreateEditorOptions",
      "createEditor",
      "Editor",
      "EditorCapability",
      "EditorCommand",
      "EditorDeleteUnit",
      "EditorListener",
      "EditorMoveDirection",
      "EditorMoveUnit",
      "EditorQuery",
      "EditorQueryResult",
      "EditorResult",
      "EditorSnapshot",
      "EditorViewAdapter",
      "InsertableEditorNode",
      "ToggleMarkCommandType",
    ].includes(importedName);
  }

  if (specifier.endsWith("/internal/model/noteDocument")) {
    return ["Mark", "NoteDocument"].includes(importedName);
  }

  if (specifier.endsWith("/internal/model/richSelection")) {
    return importedName === "RichSelection";
  }

  return false;
}

function isPublicInternalExportAlias(specifier, entry) {
  const normalized = specifier.replaceAll("\\", "/");
  return (
    isEditorImplementationImport(normalized) &&
    !isForbiddenPublicImport(normalized, entry.localName) &&
    entry.exportedName !== entry.localName
  );
}

function isForbiddenReactImport(specifier, importedName) {
  const normalized = specifier.replaceAll("\\", "/");
  if (isEditorReactImplementationImport(normalized)) {
    return !isAllowedReactInternalImport(normalized, importedName);
  }
  return false;
}

function isAllowedReactInternalImport(specifier, importedName) {
  return (
    specifier.endsWith("/internal/react/BlockEditor") &&
    ["BlockEditor", "BlockEditorProps"].includes(importedName)
  );
}

function isReactInternalExportAlias(specifier, entry) {
  const normalized = specifier.replaceAll("\\", "/");
  return (
    isEditorReactImplementationImport(normalized) &&
    !isForbiddenReactImport(normalized, entry.localName) &&
    entry.exportedName !== entry.localName
  );
}

function isForbiddenNamespaceImport(specifier) {
  return (
    isEditorMarkdownAdapterImport(specifier) ||
    isEditorImplementationImport(specifier)
  );
}

function exportNamesFromEntry(entry) {
  const normalized = entry.replace(/\btype\s+/g, "").trim();
  if (normalized.length === 0) {
    return [];
  }
  const [localName, exportedName] = normalized.split(/\s+as\s+/, 2);
  return [localName, exportedName].filter(
    (name) => name !== undefined && name.length > 0,
  );
}

function exportEntries(source) {
  const entries = [];
  const exportBlocks = source.matchAll(
    /export\s+(?:type\s+)?\{([\s\S]*?)\}(?:\s+from\s+["'][^"']+["'])?/g,
  );
  for (const match of exportBlocks) {
    for (const entry of (match[1] ?? "").split(",")) {
      const [localName, exportedName] = exportNamesFromEntry(entry);
      if (localName !== undefined) {
        entries.push({
          exportedName: exportedName ?? localName,
          localName,
        });
      }
    }
  }
  return entries;
}

function exportFromBlocks(source) {
  const blocks = [];
  const exportBlocks = source.matchAll(
    /export\s+(?:type\s+)?\{([\s\S]*?)\}\s+from\s+["']([^"']+)["']/g,
  );
  for (const match of exportBlocks) {
    blocks.push({
      entries: (match[1] ?? "")
        .split(",")
        .map((entry) => {
          const [localName, exportedName] = exportNamesFromEntry(entry);
          if (localName === undefined) {
            return undefined;
          }
          return {
            exportedName: exportedName ?? localName,
            localName,
          };
        })
        .filter((entry) => entry !== undefined),
      specifier: match[2] ?? "",
    });
  }
  return blocks;
}

function exportSpecifiers(source) {
  const specifiers = [];
  const pattern =
    /\bexport\s+(?:type\s+)?(\*(?:\s+as\s+[A-Za-z_$][\w$]*)?|\{[\s\S]*?\})\s+from\s+["']([^"']+)["']/g;
  let match = pattern.exec(source);
  while (match !== null) {
    specifiers.push({
      kind: match[1]?.startsWith("*") ? "star" : "named",
      specifier: match[2] ?? "",
    });
    match = pattern.exec(source);
  }
  return specifiers;
}

function importBlocks(source) {
  const blocks = [];
  const namedPattern =
    /\bimport\s+(?:type\s+)?\{([\s\S]*?)\}\s+from\s+["']([^"']+)["']/g;
  let namedMatch = namedPattern.exec(source);
  while (namedMatch !== null) {
    blocks.push({
      namedImports: importNamesFromBlock(namedMatch[1] ?? ""),
      namespaceImport: undefined,
      specifier: namedMatch[2]?.replaceAll("\\", "/") ?? "",
    });
    namedMatch = namedPattern.exec(source);
  }

  const namespacePattern =
    /\bimport\s+(?:type\s+)?\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s+["']([^"']+)["']/g;
  let namespaceMatch = namespacePattern.exec(source);
  while (namespaceMatch !== null) {
    blocks.push({
      namedImports: [],
      namespaceImport: namespaceMatch[1],
      specifier: namespaceMatch[2]?.replaceAll("\\", "/") ?? "",
    });
    namespaceMatch = namespacePattern.exec(source);
  }

  return blocks;
}

function importNamesFromBlock(block) {
  return block
    .split(",")
    .map((entry) => {
      const [importedName, localName] = exportNamesFromEntry(entry);
      if (importedName === undefined) {
        return undefined;
      }
      return {
        importedName,
        localName: localName ?? importedName,
      };
    })
    .filter((entry) => entry !== undefined);
}

function isEditorInternalImport(specifier) {
  return /(^|\/)editor\/internal(\/|$)/.test(specifier);
}

function isEditorImplementationImport(specifier) {
  return (
    isEditorInternalImport(specifier) || specifier.startsWith("../internal/")
  );
}

function isEditorMarkdownAdapterImport(specifier) {
  return (
    specifier === "../internal/model/markdown" ||
    specifier.endsWith("/editor/internal/model/markdown")
  );
}

function isEditorPublicImport(specifier) {
  return (
    specifier === "../public" ||
    specifier.startsWith("../public/") ||
    /(^|\/)editor\/public(\/|$)/.test(specifier)
  );
}

function isEditorReactImport(specifier) {
  return (
    specifier === "../react" ||
    specifier.startsWith("../react/") ||
    /(^|\/)editor\/react(\/|$)/.test(specifier)
  );
}

function isEditorReactImplementationImport(specifier) {
  return (
    specifier.startsWith("../internal/react/") ||
    /(^|\/)editor\/internal\/react(\/|$)/.test(specifier)
  );
}

function isLegacyEditorImport(specifier) {
  return /(^|\/)editor\/(components|model|fixtures|testing)(\/|$)/.test(
    specifier,
  );
}

function isTestFile(path) {
  return /\.(test|spec)\.(ts|tsx)$/.test(path);
}

function internalSegmentFromPath(path) {
  const parts = path.split("/");
  return parts[0] === "src" && parts[1] === "editor" && parts[2] === "internal"
    ? parts[3]
    : undefined;
}

function internalSegmentFromSpecifier(path, specifier) {
  if (specifier.startsWith(".")) {
    const resolved = normalize(join(dirname(path), specifier))
      .split(sep)
      .join("/");
    return internalSegmentFromPath(resolved);
  }

  const match = specifier.match(/(?:^|\/)editor\/internal\/([^/]+)/);
  return match?.[1];
}

function importSpecifiers(source) {
  const specifiers = [];
  const sourceFile = ts.createSourceFile(
    "source.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier !== undefined
    ) {
      collectSpecifierArgument(node.moduleSpecifier, specifiers);
    }

    if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      collectSpecifierArgument(node.moduleReference.expression, specifiers);
    }

    if (ts.isImportTypeNode(node)) {
      collectTypeImportArgument(node.argument, specifiers);
    }

    if (ts.isCallExpression(node)) {
      if (
        node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === "require") ||
        isImportMetaGlobExpression(node.expression)
      ) {
        collectFirstCallArgumentSpecifiers(node, specifiers);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return specifiers;
}

function collectFirstCallArgumentSpecifiers(callExpression, specifiers) {
  const firstArgument = callExpression.arguments[0];
  if (firstArgument !== undefined) {
    collectSpecifierArgument(firstArgument, specifiers);
  }
}

function collectSpecifierArgument(node, specifiers) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    specifiers.push(node.text);
    return;
  }

  if (ts.isArrayLiteralExpression(node)) {
    for (const element of node.elements) {
      collectSpecifierArgument(element, specifiers);
    }
  }
}

function collectTypeImportArgument(node, specifiers) {
  if (ts.isLiteralTypeNode(node)) {
    collectSpecifierArgument(node.literal, specifiers);
  }
}

function isImportMetaGlobExpression(expression) {
  return (
    ts.isPropertyAccessExpression(expression) &&
    expression.name.text === "glob" &&
    ts.isMetaProperty(expression.expression) &&
    expression.expression.keywordToken === ts.SyntaxKind.ImportKeyword &&
    expression.expression.name.text === "meta"
  );
}

function findSourceFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...findSourceFiles(path));
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry)) {
      files.push(path);
    }
  }
  return files;
}
