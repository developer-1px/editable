import ts from "typescript";

const FORBIDDEN_TEST_MARKERS = new Set([
  "fails",
  "only",
  "runIf",
  "skip",
  "skipIf",
  "todo",
]);
const VITEST_TEST_FUNCTIONS = new Set(["describe", "suite", "it", "test"]);

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
