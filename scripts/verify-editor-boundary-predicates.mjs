import { dirname, join, normalize, sep } from "node:path";

export function isEditorInternalImport(specifier) {
  return /(^|\/)editor\/internal(\/|$)/.test(specifier);
}

export function isEditorImplementationImport(specifier) {
  return (
    isEditorInternalImport(specifier) || specifier.startsWith("../internal/")
  );
}

export function isEditorMarkdownAdapterImport(specifier) {
  return (
    specifier === "../internal/model/markdown" ||
    specifier.endsWith("/editor/internal/model/markdown")
  );
}

export function isEditorPublicImport(specifier) {
  return (
    specifier === "../public" ||
    specifier.startsWith("../public/") ||
    /(^|\/)editor\/public(\/|$)/.test(specifier)
  );
}

export function isEditorReactImport(specifier) {
  return (
    specifier === "../react" ||
    specifier.startsWith("../react/") ||
    /(^|\/)editor\/react(\/|$)/.test(specifier)
  );
}

export function isEditorReactImplementationImport(specifier) {
  return (
    specifier.startsWith("../internal/react/") ||
    /(^|\/)editor\/internal\/react(\/|$)/.test(specifier)
  );
}

export function isLegacyEditorImport(specifier) {
  return /(^|\/)editor\/(components|model|fixtures|testing)(\/|$)/.test(
    specifier,
  );
}

export function isTestFile(path) {
  return /\.(test|spec)\.(ts|tsx)$/.test(path);
}

export function internalSegmentFromPath(path) {
  const parts = path.split("/");
  return parts[0] === "src" && parts[1] === "editor" && parts[2] === "internal"
    ? parts[3]
    : undefined;
}

export function internalSegmentFromSpecifier(path, specifier) {
  if (specifier.startsWith(".")) {
    const resolved = normalize(join(dirname(path), specifier))
      .split(sep)
      .join("/");
    return internalSegmentFromPath(resolved);
  }

  const match = specifier.match(/(?:^|\/)editor\/internal\/([^/]+)/);
  return match?.[1];
}
