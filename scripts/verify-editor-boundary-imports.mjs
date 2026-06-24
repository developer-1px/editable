import {
  internalSegmentFromPath,
  internalSegmentFromSpecifier,
  isEditorInternalImport,
  isEditorPublicImport,
  isEditorReactImport,
  isLegacyEditorImport,
  isTestFile,
} from "./verify-editor-boundary-predicates.mjs";

export function checkImport(path, specifier, violations) {
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
