import type { EditorClipboardData } from "../model/clipboard";

export function writeClipboardData(
  clipboardData: DataTransfer,
  data: EditorClipboardData,
) {
  for (const [type, value] of Object.entries(data)) {
    clipboardData.setData(type, value);
  }
}
