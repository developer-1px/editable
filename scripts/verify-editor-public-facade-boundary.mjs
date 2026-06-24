import { readFileSync } from "node:fs";
import { relative, sep } from "node:path";
import {
  isEditorImplementationImport,
  isEditorMarkdownAdapterImport,
} from "./verify-editor-boundary-predicates.mjs";
import {
  exportEntries,
  exportFromBlocks,
  exportSpecifiers,
  importBlocks,
} from "./verify-editor-boundary-scanner.mjs";
import { publicFileExportsName } from "./verify-editor-facade-export-helpers.mjs";

export function checkPublicEditorFacade(root, sourceFiles, violations) {
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

function isForbiddenNamespaceImport(specifier) {
  return (
    isEditorMarkdownAdapterImport(specifier) ||
    isEditorImplementationImport(specifier)
  );
}
