# Manual Editor Traces

This directory stores real browser and device traces for editor behavior that
cannot be completed from repository-only synthetic fixtures.

## Status

`manifest.json` is a collection contract, not completed evidence. The issues
listed here can only close when their required scenarios have raw trace samples
or an explicit device-access note explaining why a scenario could not be
captured.

## Sample File Convention

Each collected sample should be committed as:

```txt
tests/fixtures/manual-editor-traces/issue-<number>/<scenario>.json
```

Example:

```txt
tests/fixtures/manual-editor-traces/issue-85/macos-text-replacement-acceptance.json
```

Each sample JSON must include:

```json
{
  "schema": "interactive-os.manual-editor-trace@1",
  "issue": 85,
  "scenario": "macos-text-replacement-acceptance",
  "source": {
    "device": "MacBook Pro",
    "os": "macOS 15.x",
    "browser": "Safari",
    "keyboard": "System text replacement",
    "locale": "en-US"
  },
  "events": [
    {
      "type": "beforeinput",
      "inputType": "insertReplacementText",
      "data": "replacement",
      "isComposing": false,
      "targetRanges": []
    }
  ],
  "snapshots": {
    "selectionBeforeAfter": [],
    "domBeforeAfter": [],
    "modelBeforeAfter": []
  },
  "assertions": {
    "classification": "native text replacement",
    "nativeDomEffect": "accepted",
    "commandResult": "single model patch",
    "historyUnit": "single undo step",
    "undoResult": "restores original text and selection"
  },
  "notes": []
}
```

Keep event payloads raw. Derived interpretation belongs in `assertions`, not by
rewriting captured events.
