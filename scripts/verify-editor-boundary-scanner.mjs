import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

export function exportNamesFromEntry(entry) {
  const normalized = entry.replace(/\btype\s+/g, "").trim();
  if (normalized.length === 0) {
    return [];
  }
  const [localName, exportedName] = normalized.split(/\s+as\s+/, 2);
  return [localName, exportedName].filter(
    (name) => name !== undefined && name.length > 0,
  );
}

export function exportEntries(source) {
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

export function exportFromBlocks(source) {
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

export function exportSpecifiers(source) {
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

export function importBlocks(source) {
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

export function importNamesFromBlock(block) {
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

export function importSpecifiers(source) {
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

export function collectFirstCallArgumentSpecifiers(callExpression, specifiers) {
  const firstArgument = callExpression.arguments[0];
  if (firstArgument !== undefined) {
    collectSpecifierArgument(firstArgument, specifiers);
  }
}

export function collectSpecifierArgument(node, specifiers) {
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

export function collectTypeImportArgument(node, specifiers) {
  if (ts.isLiteralTypeNode(node)) {
    collectSpecifierArgument(node.literal, specifiers);
  }
}

export function isImportMetaGlobExpression(expression) {
  return (
    ts.isPropertyAccessExpression(expression) &&
    expression.name.text === "glob" &&
    ts.isMetaProperty(expression.expression) &&
    expression.expression.keywordToken === ts.SyntaxKind.ImportKeyword &&
    expression.expression.name.text === "meta"
  );
}

export function findSourceFiles(directory) {
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
