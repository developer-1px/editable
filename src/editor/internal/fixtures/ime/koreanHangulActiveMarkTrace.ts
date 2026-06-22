import type { EditorTraceReplay } from "../../testing/editorTraceReplay";

const firstTextPath = "/root/children/0/children/0/text";

export const koreanHangulActiveMarkTrace = {
  contractIds: ["IME-04"],
  name: "korean-hangul-active-mark",
  schema: "editable-trace-replay@1",
  steps: [
    { kind: "selection", path: firstTextPath, offset: 5 },
    {
      kind: "event",
      event: { type: "keydown", key: "b", metaKey: true },
    },
    { kind: "event", event: { type: "compositionstart" } },
    { kind: "event", event: { type: "compositionupdate", data: "안" } },
    {
      kind: "event",
      event: {
        type: "beforeinput",
        inputType: "insertCompositionText",
        data: "안",
        isComposing: true,
      },
    },
    { kind: "text", path: firstTextPath, text: "Plain안 ", offset: 7 },
    {
      kind: "event",
      event: {
        type: "input",
        inputType: "insertCompositionText",
        data: "안",
        isComposing: true,
      },
    },
    { kind: "event", event: { type: "compositionend", data: "안" } },
    {
      kind: "event",
      event: {
        type: "beforeinput",
        inputType: "insertText",
        data: "안",
      },
    },
    { kind: "timers" },
  ],
} satisfies EditorTraceReplay;
