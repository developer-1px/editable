import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DEFAULT_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");
const EDITABLE_ROOT = "packages/editable";
const PUBLIC_SEAM = `${EDITABLE_ROOT}/index.ts`;
const BROWSER_SEAM = `${EDITABLE_ROOT}/browser/index.ts`;
const CORE_SEAM = `${EDITABLE_ROOT}/core/index.ts`;
const SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
]);
const EXCLUDED_DIRECTORIES = new Set([
  ".git",
  ".cache",
  ".output",
  "archive",
  "coverage",
  "dist",
  "node_modules",
  "src/vendor",
]);

export function auditEditableLayers({ root = DEFAULT_ROOT } = {}) {
  const repoRoot = canonicalPath(path.resolve(root));
  const compilerOptions = readCompilerOptions(repoRoot);
  const { files, symlinks } = sourceFiles(repoRoot);
  const violations = symlinks.map((symlink) => ({
    code: "source-symlink",
    importer: symlink,
    target: symlink,
    line: 1,
    column: 1,
    message:
      "Source-tree symlinks are not allowed because their importer location cannot be validated reliably.",
  }));

  for (const file of files) {
    const importer = relativePath(repoRoot, file);
    const importerLayer = classifySource(importer);
    if (importerLayer === "unclassified") {
      violations.push({
        code: "unclassified-package-source",
        importer,
        line: 1,
        column: 1,
        target: importer,
        message:
          "Package source must belong to the public, browser, or core layer.",
      });
      continue;
    }

    const sourceText = fs.readFileSync(file, "utf8");
    const sourceFile = ts.createSourceFile(
      file,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
    );
    const references = collectModuleReferences(sourceFile);
    for (const reference of references) {
      const location = sourceFile.getLineAndCharacterOfPosition(reference.pos);
      if (reference.specifier === null) {
        const diagnostic = reference.diagnostic ?? {
          code: "nonliteral-dynamic-import",
          target: "<dynamic>",
          message:
            "A non-literal dynamic import or require target cannot be proven to respect editable layer boundaries.",
        };
        violations.push({
          code: diagnostic.code,
          importer,
          target: diagnostic.target,
          line: location.line + 1,
          column: location.character + 1,
          message: diagnostic.message,
        });
        continue;
      }
      const specifier = reference.specifier;
      const resolution = resolveImport(
        repoRoot,
        file,
        specifier,
        compilerOptions,
      );
      if (resolution.kind === "canonicalization-failed") {
        violations.push({
          code: "import-realpath-failed",
          importer,
          target: resolution.candidate,
          line: location.line + 1,
          column: location.character + 1,
          message: `A resolved import could not be canonicalized: ${resolution.reason}`,
        });
        continue;
      }
      if (resolution.kind === "unresolved") {
        const packageImportAlias = stripImportSuffix(specifier).startsWith("#");
        if (
          packageImportAlias ||
          mayReferenceEditable(repoRoot, file, specifier)
        ) {
          violations.push({
            code: packageImportAlias
              ? "unresolved-package-import"
              : "unresolved-editable-import",
            importer,
            target: specifier,
            line: location.line + 1,
            column: location.character + 1,
            message: packageImportAlias
              ? "A package-import alias could not be resolved, so its layer target cannot be validated."
              : "An editable package import could not be resolved for layer validation.",
          });
        }
        continue;
      }
      const logicalTarget = relativePath(repoRoot, resolution.logicalPath);
      const target = relativePath(repoRoot, resolution.path);
      if (isInsideEditable(logicalTarget) && !isInsideEditable(target)) {
        violations.push({
          code: "editable-symlink-escape",
          importer,
          target,
          line: location.line + 1,
          column: location.character + 1,
          message: `An import resolved through ${logicalTarget}, but that package path points outside packages/editable.`,
        });
        continue;
      }
      if (!isInsideEditable(target)) {
        continue;
      }
      const targetLayer = classifyTarget(target);
      const result = validateEditableLayerImport({
        importer,
        importerLayer,
        target,
        targetLayer,
      });
      if (result === null) {
        continue;
      }
      violations.push({
        ...result,
        importer,
        target,
        line: location.line + 1,
        column: location.character + 1,
      });
    }
  }

  return {
    violations: violations.sort(compareDiagnostics),
  };
}

export function validateEditableLayerImport({
  importerLayer,
  target,
  targetLayer,
}) {
  if (importerLayer === "outside" || importerLayer === "public-test") {
    return target === PUBLIC_SEAM
      ? null
      : violation(
          "outside-deep-import",
          "Code outside the package may import only packages/editable/index.ts.",
        );
  }

  if (importerLayer === "public") {
    if (targetLayer === "public") {
      return violation(
        "public-peer-import",
        "Public facade files must enter the child browser seam directly.",
      );
    }
    if (targetLayer === "browser") {
      return target === BROWSER_SEAM
        ? null
        : violation(
            "public-browser-bypass",
            "The public layer may enter browser only through browser/index.ts.",
          );
    }
    return violation(
      "public-grandchild-import",
      "The public layer cannot skip browser and import its core grandchild.",
    );
  }

  if (importerLayer === "browser") {
    if (targetLayer === "browser") {
      return null;
    }
    if (targetLayer === "core") {
      return target === CORE_SEAM
        ? null
        : violation(
            "browser-core-bypass",
            "Browser may enter core only through core/index.ts.",
          );
    }
    return violation(
      "browser-upward-import",
      "Browser cannot import its public parent layer.",
    );
  }

  if (importerLayer === "core") {
    return targetLayer === "core"
      ? null
      : violation(
          "core-upward-import",
          "Core cannot import browser or public parent layers.",
        );
  }

  return violation(
    "unclassified-package-source",
    "The importing file does not belong to a declared editable layer.",
  );
}

function classifySource(file) {
  if (!isInsideEditable(file)) {
    return "outside";
  }
  if (file.startsWith(`${EDITABLE_ROOT}/browser/`)) {
    return "browser";
  }
  if (file.startsWith(`${EDITABLE_ROOT}/core/`)) {
    return "core";
  }
  if (
    file === PUBLIC_SEAM ||
    file === `${EDITABLE_ROOT}/editor.ts` ||
    file === `${EDITABLE_ROOT}/model.ts`
  ) {
    return "public";
  }
  if (isPublicTest(file)) {
    return "public-test";
  }
  return "unclassified";
}

function classifyTarget(file) {
  if (file.startsWith(`${EDITABLE_ROOT}/browser/`)) {
    return "browser";
  }
  if (file.startsWith(`${EDITABLE_ROOT}/core/`)) {
    return "core";
  }
  return "public";
}

function isInsideEditable(file) {
  return file === EDITABLE_ROOT || file.startsWith(`${EDITABLE_ROOT}/`);
}

function isPublicTest(file) {
  const prefix = `${EDITABLE_ROOT}/`;
  if (!file.startsWith(prefix)) {
    return false;
  }
  const relative = file.slice(prefix.length);
  return /^(?:[^/]+\.(?:test|spec)\.[cm]?[jt]sx?|__tests__\/.*\.[cm]?[jt]sx?)$/u.test(
    relative,
  );
}

function collectModuleReferences(sourceFile) {
  const references = sourceFile.referencedFiles.map((reference) => ({
    specifier: reference.fileName,
    pos: reference.pos,
  }));

  const addLiteral = (node) => {
    if (
      ts.isStringLiteralLike(node) ||
      ts.isNoSubstitutionTemplateLiteral(node)
    ) {
      references.push({ specifier: node.text, pos: node.getStart(sourceFile) });
      return true;
    }
    return false;
  };

  const addUnverifiable = (node, diagnostic) => {
    references.push({
      specifier: null,
      pos: node.getStart(sourceFile),
      diagnostic,
    });
  };

  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier !== undefined
    ) {
      if (
        isNodeModuleLoaderSpecifier(node.moduleSpecifier) &&
        isRuntimeModuleDeclaration(node)
      ) {
        addUnverifiable(node.moduleSpecifier, nodeModuleLoaderDiagnostic());
        return;
      }
      addLiteral(node.moduleSpecifier);
      return;
    }
    if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression !== undefined
    ) {
      if (isNodeModuleLoaderSpecifier(node.moduleReference.expression)) {
        addUnverifiable(
          node.moduleReference.expression,
          nodeModuleLoaderDiagnostic(),
        );
        return;
      }
      addLiteral(node.moduleReference.expression);
      return;
    }
    if (ts.isImportTypeNode(node)) {
      if (
        ts.isLiteralTypeNode(node.argument) &&
        addLiteral(node.argument.literal)
      ) {
        return;
      }
      references.push({ specifier: null, pos: node.getStart(sourceFile) });
      return;
    }
    if (ts.isCallExpression(node)) {
      const isDynamicImport =
        node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = isRequireFunctionReference(node.expression);
      const importMetaGlob = importMetaGlobName(node.expression);
      if (importMetaGlob !== null) {
        addUnverifiable(node, importMetaGlobDiagnostic(importMetaGlob));
        return;
      }
      if (isDynamicImport || isRequire) {
        const argument = node.arguments[0];
        if (argument !== undefined && isNodeModuleLoaderSpecifier(argument)) {
          addUnverifiable(node, nodeModuleLoaderDiagnostic());
          return;
        }
        if (argument === undefined || !addLiteral(argument)) {
          references.push({ specifier: null, pos: node.getStart(sourceFile) });
        }
        return;
      }
    }
    const importMetaGlob = importMetaGlobName(node);
    if (importMetaGlob !== null) {
      addUnverifiable(node, importMetaGlobDiagnostic(importMetaGlob));
      return;
    }
    if (isRequireFunctionReference(node) && isRequireFunctionValueUse(node)) {
      addUnverifiable(node, {
        code: "require-function-alias",
        target: "<require function>",
        message:
          "require or module.require cannot be passed or aliased because its eventual module target cannot be validated.",
      });
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return references;
}

function isRequireFunctionReference(node) {
  return (
    (ts.isIdentifier(node) && node.text === "require") ||
    (isStaticMemberAccess(node, "require") &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "module")
  );
}

function isRequireFunctionValueUse(node) {
  const parent = node.parent;
  if (parent === undefined || ts.isTypeOfExpression(parent)) {
    return false;
  }
  if (ts.isIdentifier(node)) {
    if (ts.isDeclarationName(node)) {
      return false;
    }
    if (
      (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
      (ts.isPropertyAssignment(parent) && parent.name === node) ||
      (ts.isBindingElement(parent) && parent.propertyName === node)
    ) {
      return false;
    }
  }
  return true;
}

function importMetaGlobName(node) {
  if (!isStaticMemberAccess(node, "glob", "globEager")) {
    return null;
  }
  return ts.isMetaProperty(node.expression) &&
    node.expression.keywordToken === ts.SyntaxKind.ImportKeyword &&
    node.expression.name.text === "meta"
    ? staticMemberName(node)
    : null;
}

function importMetaGlobDiagnostic(name) {
  return {
    code: "import-meta-glob",
    target: `<import.meta.${name}>`,
    message:
      "import.meta.glob and import.meta.globEager are not allowed because their expanded module targets cannot be proven to respect editable layer boundaries.",
  };
}

function isNodeModuleLoaderSpecifier(node) {
  return (
    ts.isStringLiteralLike(node) &&
    (node.text === "node:module" || node.text === "module")
  );
}

function isRuntimeModuleDeclaration(node) {
  if (ts.isImportDeclaration(node)) {
    const clause = node.importClause;
    if (clause === undefined) {
      return true;
    }
    if (clause.isTypeOnly) {
      return false;
    }
    const bindings = clause.namedBindings;
    return (
      clause.name !== undefined ||
      bindings === undefined ||
      ts.isNamespaceImport(bindings) ||
      bindings.elements.some((element) => !element.isTypeOnly)
    );
  }
  if (node.isTypeOnly) {
    return false;
  }
  const clause = node.exportClause;
  return (
    clause === undefined ||
    ts.isNamespaceExport(clause) ||
    clause.elements.some((element) => !element.isTypeOnly)
  );
}

function nodeModuleLoaderDiagnostic() {
  return {
    code: "node-module-loader",
    target: "<node:module>",
    message:
      "Runtime node:module imports are not allowed because createRequire can create an untraceable module loader.",
  };
}

function isStaticMemberAccess(node, ...names) {
  const name = staticMemberName(node);
  return name !== null && names.includes(name);
}

function staticMemberName(node) {
  if (ts.isPropertyAccessExpression(node)) {
    return node.name.text;
  }
  if (
    ts.isElementAccessExpression(node) &&
    node.argumentExpression !== undefined &&
    ts.isStringLiteralLike(node.argumentExpression)
  ) {
    return node.argumentExpression.text;
  }
  return null;
}

function resolveImport(repoRoot, importer, specifier, compilerOptions) {
  const resolvedSpecifier = stripImportSuffix(specifier);
  let candidate;
  if (resolvedSpecifier.startsWith("/packages/")) {
    candidate = resolveCandidate(
      path.join(repoRoot, resolvedSpecifier.slice(1)),
    );
  } else {
    candidate =
      ts.resolveModuleName(resolvedSpecifier, importer, compilerOptions, ts.sys)
        .resolvedModule?.resolvedFileName ?? null;
  }
  if (candidate === null) {
    return { kind: "unresolved" };
  }
  const absoluteCandidate = path.resolve(candidate);
  try {
    return {
      kind: "resolved",
      logicalPath: absoluteCandidate,
      path: canonicalPath(absoluteCandidate),
    };
  } catch (error) {
    return {
      kind: "canonicalization-failed",
      candidate: absoluteCandidate,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

function stripImportSuffix(specifier) {
  const query = specifier.indexOf("?");
  const fragment = specifier.indexOf("#", specifier.startsWith("#") ? 1 : 0);
  const suffixes = [query, fragment].filter((index) => index >= 0);
  return suffixes.length === 0
    ? specifier
    : specifier.slice(0, Math.min(...suffixes));
}

function mayReferenceEditable(repoRoot, importer, specifier) {
  const resolvedSpecifier = stripImportSuffix(specifier);
  if (resolvedSpecifier.startsWith("/packages/editable")) {
    return true;
  }
  if (resolvedSpecifier.includes("packages/editable")) {
    return true;
  }
  if (!resolvedSpecifier.startsWith(".")) {
    return false;
  }
  const lexicalTarget = relativePath(
    repoRoot,
    path.resolve(path.dirname(importer), resolvedSpecifier),
  );
  return isInsideEditable(lexicalTarget);
}

function resolveCandidate(candidate) {
  const extension = path.extname(candidate);
  const sourceCandidates = [candidate];
  if ([".js", ".jsx", ".mjs", ".cjs"].includes(extension)) {
    const stem = candidate.slice(0, -extension.length);
    sourceCandidates.push(
      `${stem}.ts`,
      `${stem}.tsx`,
      `${stem}.mts`,
      `${stem}.cts`,
    );
  }
  for (const pathCandidate of [
    ...sourceCandidates,
    `${candidate}.ts`,
    `${candidate}.tsx`,
    path.join(candidate, "index.ts"),
    path.join(candidate, "index.tsx"),
  ]) {
    if (fs.existsSync(pathCandidate) && fs.statSync(pathCandidate).isFile()) {
      return path.resolve(pathCandidate);
    }
  }
  return null;
}

function canonicalPath(file) {
  return fs.realpathSync.native(file);
}

function readCompilerOptions(repoRoot) {
  const configPath = path.join(repoRoot, "tsconfig.json");
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error !== undefined) {
    throw new Error(
      ts.flattenDiagnosticMessageText(config.error.messageText, "\n"),
    );
  }
  return ts.parseJsonConfigFileContent(config.config, ts.sys, repoRoot).options;
}

function sourceFiles(repoRoot) {
  const files = [];
  const symlinks = [];
  const visit = (directory, relativeDirectory = "") => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const relative =
        relativeDirectory === ""
          ? entry.name
          : `${relativeDirectory}/${entry.name}`;
      if (entry.isSymbolicLink()) {
        if (!isExcluded(relative, entry.name)) {
          symlinks.push(relative);
        }
        continue;
      }
      if (entry.isDirectory()) {
        if (!isExcluded(relative, entry.name)) {
          visit(path.join(directory, entry.name), relative);
        }
        continue;
      }
      if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
        files.push(path.join(directory, entry.name));
      }
    }
  };
  visit(repoRoot);
  return { files: files.sort(), symlinks: symlinks.sort() };
}

function isExcluded(relative, name) {
  return EXCLUDED_DIRECTORIES.has(name) || EXCLUDED_DIRECTORIES.has(relative);
}

function relativePath(root, file) {
  return path.relative(root, file).split(path.sep).join("/");
}

function violation(code, message) {
  return { code, message };
}

function compareDiagnostics(left, right) {
  return `${left.importer}\0${String(left.line).padStart(8, "0")}\0${String(left.column).padStart(8, "0")}\0${left.code}`.localeCompare(
    `${right.importer}\0${String(right.line).padStart(8, "0")}\0${String(right.column).padStart(8, "0")}\0${right.code}`,
  );
}

function printAudit(audit) {
  if (audit.violations.length === 0) {
    process.stdout.write(
      "Editable layer check passed.\nallowed seams: public -> browser/index.ts; browser -> core/index.ts\nnon-seam crossings: 0\n",
    );
    return;
  }
  for (const item of audit.violations) {
    process.stderr.write(
      `${item.importer}:${item.line}:${item.column} [${item.code}]\n  ${item.message}\n  target: ${item.target}\n`,
    );
  }
  process.stderr.write(
    `Editable layer check failed with ${audit.violations.length} violation(s).\n`,
  );
  process.exitCode = 1;
}

if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === SCRIPT_PATH
) {
  printAudit(auditEditableLayers());
}
