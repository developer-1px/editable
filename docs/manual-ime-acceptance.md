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
7. Repeat with selection replacement, an empty block, Backspace, Enter, and
   Select All.

Record browser/OS versions, IME name, event order, final DOM text, JSON value,
selection, undo result, and whether the candidate window survived step 2.

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
