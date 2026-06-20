# Lexical donor snapshot

Source: https://github.com/facebook/lexical
Version inspected: 0.45.0
License: MIT, preserved in `LICENSE`.

This directory is a donor snapshot for the `json-document` editor rewrite. The
runtime currently imports the published Lexical packages through
`src/editor/donor/lexicalRuntime.ts`. The copied files mark the first source
areas to replace once the baseline editor behavior is stable:

- `sources/lexical-plain-text-index.ts`: plain text command registration.
- `sources/LexicalContentEditableElement.tsx`: root contenteditable binding.
- `sources/LexicalEvents.ts`: DOM/input/selection event pipeline.

Replacement rule: keep Lexical as the behavior donor, but move canonical
document state, history, and selection ownership to `json-document` through the
adapter boundary under `src/editor/donor`.
