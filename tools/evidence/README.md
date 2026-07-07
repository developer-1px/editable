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
5. Commit it under:

```txt
tests/fixtures/clipboard-html-corpus/<source>/<shape>.json
```

Then add the file to `tests/fixtures/clipboard-html-corpus/manifest.json`.

## Manual Trace Recorder

Use `manual-trace-recorder.html` for issues #85, #70, #72, #78, and #81.

1. Open the recorder on the real browser/device being tested.
2. Select the issue and scenario.
3. Perform the required operation on the editable surface.
4. Add manual snapshots when useful.
5. Download the trace JSON.
6. Commit it under:

```txt
tests/fixtures/manual-editor-traces/issue-<number>/<scenario>.json
```

Then add the file to `tests/fixtures/manual-editor-traces/manifest.json`.

The pages only collect evidence. The issue still needs a policy/test follow-up
when the captured behavior changes editor decisions.
