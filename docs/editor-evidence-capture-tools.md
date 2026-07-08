# Editor Evidence Capture Tools

## Purpose

The remaining open evidence issues depend on authenticated apps, real OS input,
or mobile browser/device behavior. Repository-only synthetic tests cannot close
those issues.

The standalone capture tools live at:

```txt
tools/evidence/
```

They are intentionally outside `src/` and `packages/editable/` so the sample app
and package public surface stay focused on the editor protocol.

## Tools

| Tool | Issues | Output schema |
| --- | --- | --- |
| `clipboard-capture.html` | #74 | `interactive-os.clipboard-html-sample@1` |
| `manual-trace-recorder.html` | #85, #70, #72, #78, #81 | `interactive-os.manual-editor-trace@1` |

## Local Serving

Serve the tools from localhost:

```bash
cd tools/evidence
python3 -m http.server 8787
```

Clipboard APIs require a secure context. Browsers generally treat localhost as a
secure context, while direct `file://` access may not be enough.

## Issue #74 Slack Path

Slack remains the only missing source in the clipboard corpus. Capture two
Slack selections:

| Shape | Fixture path |
| --- | --- |
| `message-mention-link-emoji` | `tests/fixtures/clipboard-html-corpus/slack/message-mention-link-emoji.json` |
| `inline-code-code-block` | `tests/fixtures/clipboard-html-corpus/slack/inline-code-code-block.json` |

After each capture, add the sample to:

```txt
tests/fixtures/clipboard-html-corpus/manifest.json
```

## Manual Trace Path

For #85, #70, #72, #78, and #81, select the scenario in the recorder and commit
the downloaded JSON under:

```txt
tests/fixtures/manual-editor-traces/issue-<number>/<scenario>.json
```

Then list it under that issue's `samples` array in:

```txt
tests/fixtures/manual-editor-traces/manifest.json
```

`packages/editable/manualTraceCorpus.test.ts` verifies the issue/scenario
connection and basic payload shape.

## Coverage Status

Print current coverage:

```bash
pnpm run evidence:status
```

The status output lists the target fixture path for every missing sample.

Use the completion gate when auditing whether these issues can close:

```bash
pnpm run evidence:check
```

The check exits non-zero until Slack clipboard samples and all manual trace
scenarios are present.

## Completion Boundary

These tools do not replace the real evidence. They reduce collection friction
and keep incoming traces in the same schema CI already understands.
