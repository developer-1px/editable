# Evidence Capture Tools

These standalone pages help collect the remaining issue evidence without adding
debug UI to the sample app or public package surface.

Serve this directory from localhost:

```bash
cd tools/evidence
python3 -m http.server 8787
```

Open:

```txt
http://127.0.0.1:8787/clipboard-capture.html
http://127.0.0.1:8787/manual-trace-recorder.html
```

## Clipboard Capture

Use `clipboard-capture.html` for issue #74.

1. Copy the target content from Slack, Google Docs, Notion, GitHub, or a
   webpage.
2. Open the capture page in the same browser context.
3. Choose the source and shape.
4. Read and download the JSON.
5. Import it:

```bash
pnpm run evidence:import -- --file ~/Downloads/slack-message.json --source slack --shape message-mention-link-emoji
```

The import command copies the file under
`tests/fixtures/clipboard-html-corpus/` and updates
`tests/fixtures/clipboard-html-corpus/manifest.json`.

## Manual Trace Recorder

Use `manual-trace-recorder.html` for issues #85, #70, #72, #78, and #81.

1. Open the recorder on the real browser/device being tested.
2. Select the issue and scenario.
3. Perform the required operation on the editable surface.
4. Add manual snapshots when useful.
5. Download the trace JSON.
6. Import it:

```bash
pnpm run evidence:import -- --file ~/Downloads/ios-trace.json --issue 70 --scenario ios-touch-selection
```

The import command copies the file under
`tests/fixtures/manual-editor-traces/` and updates
`tests/fixtures/manual-editor-traces/manifest.json`.

The pages only collect evidence. The issue still needs a policy/test follow-up
when the captured behavior changes editor decisions.

## Status CLI

Print current corpus coverage:

```bash
pnpm run evidence:status
```

The report includes target fixture paths for each missing sample.

Fail unless every required evidence item has a valid sample:

```bash
pnpm run evidence:check
```

`evidence:check` is expected to fail while Slack and real-device traces are
missing.

## Sample Plan CLI

Validate a downloaded evidence JSON and print the fixture destination plus
manifest entry:

```bash
pnpm run evidence:plan -- --file ~/Downloads/slack-message.json --source slack --shape message-mention-link-emoji
pnpm run evidence:plan -- --file ~/Downloads/ios-trace.json --issue 70 --scenario ios-touch-selection
```

## Sample Import CLI

Validate a downloaded evidence JSON, copy it to the planned fixture path, and
update the matching manifest:

```bash
pnpm run evidence:import -- --file ~/Downloads/slack-message.json --source slack --shape message-mention-link-emoji
pnpm run evidence:import -- --file ~/Downloads/ios-trace.json --issue 70 --scenario ios-touch-selection
```

Use `--dry-run` to check the destination without writing files. Use `--force`
only when replacing an existing fixture for the same target.
