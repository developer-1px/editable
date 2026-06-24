import type { JSONDocument, Pointer } from "@interactive-os/json-document";

export function readString<T>(
  document: JSONDocument<T>,
  path: Pointer,
):
  | { ok: true; value: string }
  | { ok: false; code: "not_string"; reason: string } {
  const result = document.at(path);
  if (!result.ok) {
    return {
      ok: false,
      code: "not_string",
      reason: result.reason ?? result.code,
    };
  }
  if (typeof result.value !== "string") {
    return {
      ok: false,
      code: "not_string",
      reason: `${path} does not point to a string.`,
    };
  }
  return { ok: true, value: result.value };
}
