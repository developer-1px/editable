import type { EditorTraceReplay } from "../../testing/editorTraceReplay";

const firstTextPath = "/root/children/0/children/0/text";

export const koreanHangulCompositionHistoryTrace = {
  contractIds: ["HIST-02"],
  name: "korean-hangul-composition-history",
  schema: "editable-trace-replay@1",
  steps: [
    { kind: "selection", path: firstTextPath, offset: 0 },
    { kind: "event", event: { type: "compositionstart" } },
    {
      kind: "event",
      event: { type: "beforeinput", inputType: "historyUndo" },
      expect: {
        after: {
          pathText: {
            [firstTextPath]: "Plain ",
          },
        },
      },
    },
  ],
} satisfies EditorTraceReplay;
