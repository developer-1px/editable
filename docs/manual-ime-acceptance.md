# Manual IME Acceptance

Automation cannot create a trusted operating-system IME session. Use this
checklist before describing the editor as IME-verified.

## Desktop run

```bash
pnpm dev
```

Open `http://localhost:3000/`, focus the Korean or Japanese paragraph, and keep
the state panel visible.

For each tested browser and IME:

1. Start an uncommitted Korean syllable or Japanese conversion.
2. While the candidate/composition UI is still active, press “다른 블록
   업데이트”. The toolbar prevents pointer focus transfer.
3. Confirm the candidate UI remains active, the composing text does not jump,
   the other block has not changed yet, and `last fault` remains `null`.
4. While composing again, press “현재 조합과 충돌”. Confirm the command is not
   applied, composition remains active, and `last fault.code` is
   `composition_conflict`.
5. Complete conversion. Confirm the phase briefly becomes `settling`, then
   `idle`, the queued other-block update appears, and visible text equals
   `value.blocks[*].text`.
6. Undo once to revert the queued update, then undo once more. The entire
   uninterrupted composition turn must revert on that second step, with no
   intermediate preedit text left behind.
7. Repeat with selection replacement, an empty block, Backspace, and Select
   All.

Record browser/OS versions, IME name, event order, final DOM text, JSON value,
selection, undo result, and whether the candidate window survived step 2.

## Enter while composing

Run these separately from the general checklist. One physical Enter can mean
either “confirm this IME candidate” or “insert a paragraph”; a `keydown` alone
cannot distinguish them.

### Korean composition

1. Begin an uncommitted Korean syllable in the middle of a non-empty paragraph.
2. Press Enter once while the syllable is still under composition.
3. Confirm the completed syllable is preserved and exactly one new paragraph
   appears at the caret. Neither resulting paragraph may contain `\n` or `\r`.
4. Confirm the phase reaches `idle`, `last fault` is `null`, and the visible DOM
   text and block order equal `value.blocks`.
5. Undo once. The two paragraphs must join while the completed Korean text
   remains.
6. Undo once more. The entire uninterrupted composition turn must revert.

Repeat at the beginning and end of a paragraph and in an empty paragraph.
Also press Enter twice quickly during one composition: exactly two paragraph
boundaries must appear, and each Undo must remove one boundary.

### Japanese candidate confirmation

1. Start a Japanese conversion and open the candidate list.
2. Press Enter once to confirm the highlighted candidate.
3. Confirm the candidate is committed but no paragraph was inserted.
4. After the candidate UI closes, press Enter again.
5. Confirm exactly one paragraph is inserted and the confirmed text is
   preserved.

If the first Enter both confirms the candidate and inserts a paragraph, record
it as a failure. If the platform emits a semantic paragraph event for that
first Enter, preserve the complete event trace; this is evidence for a
platform-specific compatibility rule, not permission to infer intent from
`keydown` globally.

### Mobile keyboards

Repeat both applicable flows on Android Gboard and iOS. Also test the keyboard
Return key when the final composing update arrives as text ending in a newline.
The newline must become one paragraph split and must not remain in JSON text.

For every Enter run, record in order:

- `keydown`: `key`, `keyCode`, `isComposing`;
- `beforeinput` and `input`: `inputType`, `data`, `isComposing`, `cancelable`;
- `compositionend.data`;
- child-list and character-data mutations;
- final DOM, JSON, selection, phase, fault, and the result of two Undo actions.

## Required matrix

- macOS or Windows Korean 2-set in Chromium and a native-platform browser;
- desktop Japanese conversion with candidate selection;
- Android Chrome with Gboard Korean and Japanese;
- iOS Safari Korean and Japanese.

The repository's generic trace recorder can be served on desktop and LAN:

```bash
pnpm run evidence:serve
```

Those captured traces remain external evidence. Synthetic Playwright tests are
never a substitute for this matrix.
