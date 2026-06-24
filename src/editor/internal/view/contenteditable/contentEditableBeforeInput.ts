import type { ClipboardFormat } from "../../model/clipboard";
import { readClipboardTextFromTransfer } from "../../model/clipboardTransfer";

export type ContentEditableBeforeInput = {
  inputType: string;
  data?: string | null;
  format?: ClipboardFormat;
  isComposing?: boolean;
};

export function contentEditableBeforeInputFromEvent(
  event: InputEvent,
): ContentEditableBeforeInput {
  const transferText = contentEditableTransferText(event);

  return {
    inputType: event.inputType,
    data: transferText?.text ?? event.data,
    format: transferText?.format,
    isComposing: event.isComposing,
  };
}

function contentEditableTransferText(
  event: InputEvent,
): { text: string; format: ClipboardFormat } | null {
  if (
    event.inputType !== "insertFromPaste" &&
    event.inputType !== "insertFromDrop"
  ) {
    return null;
  }

  const transfer = event.dataTransfer;
  return transfer === null || transfer === undefined
    ? null
    : readClipboardTextFromTransfer(transfer);
}
