import { type ClipboardFormat, EDITABLE_CLIPBOARD_MIME } from "./clipboard";

export type ClipboardTransfer = {
  getData(type: string): string;
};

export type ClipboardText = {
  text: string;
  format: ClipboardFormat;
};

export function readTextFromTransfer(
  transfer: ClipboardTransfer,
): string | null {
  return readClipboardTextFromTransfer(transfer)?.text ?? null;
}

export function readClipboardTextFromTransfer(
  transfer: ClipboardTransfer,
): ClipboardText | null {
  const structured = readStructuredClipboardData(
    transfer.getData(EDITABLE_CLIPBOARD_MIME),
  );
  if (structured !== null) {
    return structured;
  }

  const plainText = transfer.getData("text/plain");
  if (plainText.length > 0) {
    return { text: plainText, format: "plain" };
  }

  const markdown = transfer.getData("text/markdown");
  if (markdown.length > 0) {
    return { text: markdown, format: "markdown" };
  }

  const uriList = readUriListText(transfer.getData("text/uri-list"));
  return uriList === null ? null : { text: uriList, format: "plain" };
}

function readStructuredClipboardData(value: string): ClipboardText | null {
  if (value.length === 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "schema" in parsed &&
      "plainText" in parsed &&
      parsed.schema === "editable-clipboard@1" &&
      typeof parsed.plainText === "string"
    ) {
      if (
        "markdown" in parsed &&
        typeof parsed.markdown === "string" &&
        parsed.markdown.length > 0
      ) {
        return { text: parsed.markdown, format: "markdown" };
      }

      return parsed.plainText.length === 0
        ? null
        : { text: parsed.plainText, format: "plain" };
    }
  } catch {
    return null;
  }

  return null;
}

function readUriListText(value: string): string | null {
  const uris = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));

  return uris.length === 0 ? null : uris.join("\n");
}
