# Editor Manual Trace Collection

## Scope

This document tracks the manual evidence still required after the current
repository-only audits and fixtures. The trace corpus lives at:

```txt
tests/fixtures/manual-editor-traces/
```

`manifest.json` is intentionally test-covered. It keeps every real-device or
real-browser scenario visible in CI, and validates future samples once they are
added.

## Issue Order

The remaining evidence issues are handled in this order:

| Order | Issue | Evidence needed |
| --- | --- | --- |
| 1 | #74 | Clipboard HTML source corpus from Google Docs, Notion, Slack, GitHub rendered pages, and generic webpages. |
| 2 | #85 | OS autocorrect, system text replacement, and `insertReplacementText` history traces. |
| 3 | #70 | iOS Safari and Android Chrome touch selection traces. |
| 4 | #72 | iOS and Android Enter/Backspace behavior at block and atom boundaries. |
| 5 | #78 | Mobile virtual-keyboard viewport, scroll, and caret visibility traces. |
| 6 | #81 | iOS BIU/native formatting context-menu traces. |

#74 uses the dedicated clipboard corpus at:

```txt
tests/fixtures/clipboard-html-corpus/
```

#85, #70, #72, #78, and #81 use the manual trace corpus at:

```txt
tests/fixtures/manual-editor-traces/
```

## Collection Contract

Each issue declares:

- Required scenarios.
- Device, browser, and input-method matrix.
- Operations to perform.
- Trace fields that must be captured.
- Related policy documents that explain how the evidence will change editor
  behavior.

The issue is not complete just because the manifest row exists. A scenario is
complete only when a raw sample file is committed and listed under `samples`, or
when a sample records a concrete device-access reason that makes the capture
unavailable.

After capture, import the downloaded JSON instead of editing `samples` by hand:

```bash
pnpm run evidence:import -- --file <trace-json> --issue 85 --scenario macos-text-replacement-acceptance
```

`pnpm run evidence:status` prints the exact import command for each missing
issue/scenario.

## Minimum Trace Shape

Every manual trace sample must include:

- Device, OS, browser, keyboard/input method, and locale.
- Event order for relevant `keydown`, `beforeinput`, `input`,
  `composition*`, `selectionchange`, `paste`, or native menu events.
- Raw browser fields: `key`, `code`, `inputType`, `data`, `isComposing`,
  `dataTransfer.types`, and `getTargetRanges()` where available.
- DOM selection and mapped model selection before and after the operation.
- DOM text, model text, marks, atoms, and history/undo outcome.
- A clear assertion that separates native DOM effect from model command result.

## Completion Rule

Synthetic fixtures may reproduce parts of these issues after evidence is
collected, but they do not replace the required raw traces. These issues depend
on native OS/browser/app behavior and remain open until the real samples fill
the manifest.
