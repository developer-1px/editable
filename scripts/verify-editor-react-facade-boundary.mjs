import { readFileSync } from "node:fs";
import { relative, sep } from "node:path";
import {
  isEditorImplementationImport,
  isEditorReactImplementationImport,
} from "./verify-editor-boundary-predicates.mjs";
import {
  exportEntries,
  exportFromBlocks,
  exportSpecifiers,
  importBlocks,
} from "./verify-editor-boundary-scanner.mjs";
import { publicFileExportsName } from "./verify-editor-facade-export-helpers.mjs";

export function checkReactEditorFacade(root, sourceFiles, violations) {
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
