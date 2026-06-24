import { exportNamesFromEntry } from "./verify-editor-boundary-scanner.mjs";

export function publicFileExportsName(source, name) {
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
