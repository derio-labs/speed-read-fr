# Word-by-word default, Red letters toggle, reading box on top: design

Run: `2026-11-26-feat-word-default-red-toggle-top-dock`. Builds on
`2026-11-22-flow-first-letter-and-flowing` (Flow motion, the red first letter) and the
`stable-reader-dock` fix (the `bottomStage` dock that pins the reading box below chapters and
exhibits).

## Summary

Three changes. First, Flowing motion looks choppy on a 30 Hz display, so **Word by word** becomes
the default Flow motion. Saved browser settings move to it once. Second, a new **Red letters**
setting, on by default, turns off the red accent on reading letters in both modes: flow's first
letter and chunk's ORP pivot. Third, in the dock hosts (browser Overlay, browser Side panel, VS
Code panel) the reading box moves to the **top**. Title, stop and dwell cards and exhibits appear
underneath it, newest first, so each new one pushes the earlier ones down.

## Decisions from the question round

| # | Decision | Answer |
|---|----------|--------|
| D1 | Migration | Move everyone once. Stored browser settings with `flowMotion: 'flowing'` become `'word'` on the first load after the update, through the existing one-time migrations record (`storage.ts`). In VS Code the manifest default changes. A `speedRead.flowMotion` the user set explicitly is their choice and stays. |
| D2 | Toggle scope | Both modes. One setting, `redLetters`, default on. When it is off, flow's first letter and chunk's pivot use the normal text colour. The bracket, guides, eyebrows and list bullets stay red. |
| D3 | Hosts | All dock hosts: everything mounted with `bottomStage: true`. The browser Overlay's faded page follows the current block into the free band below the reader's cards. |
| D4 | Verification | Unit tests (Vitest) and Playwright in CI before merge. The VS Code row stays `walk-owed`. |
| D5 | Order (author's call) | Under the reading box: the current title, stop or dwell card first, then the exhibit list with the most recently revealed exhibit first. Non-dock layouts keep their document-order exhibit list. |

## Requirements

R1. The default Flow motion is Word by word, for new users and for settings with no stored motion. The VS Code manifest's `speedRead.flowMotion` default is `word`.
R2. In the browser, stored settings move once from Flowing to Word by word on the first load after the update. A choice made after that (Flowing picked again) persists and is never migrated again.
R3. A "Red letters" setting (on by default, saved per host, `speedRead.redLetters` in VS Code) controls whether reading letters are red. When it is on, flow's in-bracket first letters and chunk's ORP pivot are red as they are today. When it is off, they use the normal text colour, and the brackets, guides and other accents stay red. Changing it takes effect at once, without rebuilding the timeline or moving the reading position.
R4. In the dock hosts (browser Overlay, browser Side panel, VS Code panel), the reading box (toolbar, progress, stage) sits at the top of the reader. The title, stop and dwell card and the exhibits appear below it. The reading box keeps its fixed size and position through prose, chapters and exhibits.
R5. Below the reading box, newer content is on top: the current card first, then exhibits with the most recently revealed first, each new one pushing the earlier ones down.
R6. In the browser Overlay, the faded page scrolls the current block into the visible area below the reader's cards, and the full-strength outline is clipped to that area.

## Design shape

```
packages/core/src/
  settings.ts            ~ flowMotion default 'word'; + redLetters: boolean (default true)
  ui/settings-panel.ts   + "Red letters" checkbox (both reading modes)
  ui/mount.ts            ~ reader[data-red-letters] kept in sync; dock: support moves AFTER the stage
  ui/exhibits.ts         + newest-first insertion when the reader is a dock (bottomStage)
  ui/styles.ts           ~ [data-red-letters="off"] clears .sr-w-first / .sr-pivot colour
                         ~ dock grid: stage row 1, support row 2, outline below (floating)
packages/browser-extension/src/
  storage.ts             + migration 'word-motion-default' (flowing → word, once)
  reader-entry.ts        ~ overlay band: setBandBottom → setBandTop (follow aims below the cards)
packages/vscode-extension/package.json
                         ~ speedRead.flowMotion default "word"; + speedRead.redLetters
```

## Design

### Word-by-word default (R1, R2)

- `DEFAULT_SETTINGS.flowMotion = 'word'` in `settings.ts`. The VS Code manifest default becomes
  `"word"`, and its description no longer calls Flowing the default.
- `storage.ts` gains a second migration id, `word-motion-default`, applied with the same
  read-record / write-once logic as `flow-default`: on load, if the id is absent and the stored
  settings have `flowMotion: 'flowing'`, they are rewritten with `'word'` and the id is recorded.
  `save` records every known id, so a user's later choice is never overwritten. The two
  migrations are generalised into a list of `{id, apply(stored)}` applied in order.

### Red letters (R3)

- `Settings.redLetters: boolean`, default `true`, normalised like `tts.enabled`. It is render-only,
  so `mount.ts`'s settings update does not rebuild the timeline for it.
- `mount.ts` sets `reader.dataset.redLetters = 'on' | 'off'` at mount and on every settings change.
- `styles.ts`: `.sr-reader[data-red-letters="off"] :is(.sr-w-first, .sr-pivot) { color: inherit; }`.
  The pivot keeps its weight, so the fixation point still reads.
- The settings panel has a "Red letters" checkbox in the reading section, shown in both modes.
- VS Code: `KEYS` comes from `DEFAULT_SETTINGS`, so the manifest needs a `speedRead.redLetters`
  boolean (the manifest test enforces it).

### Reading box on top (R4, R5, R6)

- `mount.ts`: in the panel dock the support goes after the stage (`stage.after(support)`), so `main` is
  toolbar, progress, stage, support. In the floating dock the layout order is `main`, then support,
  then outline.
- `styles.ts`, floating dock grid: row 1 is the stage (`align-self: start`), row 2 is the support,
  and row 3 is the outline card (left, `align-self: start`, taking the remaining height). The
  support's `max-height` rule stays. Panel dock: the stage is the fixed top row and the support
  takes `flex: 1` below it. The `margin-bottom` on the support becomes `margin-top`.
- `exhibits.ts`: `createExhibits` takes `newestFirst` (true in a dock). When it is set, `add`
  prepends the item, so the latest-revealed exhibit is at the top. `reveal` keeps the active one in
  view as before.
- Overlay follow (`reader-entry.ts`): `setBandBottom` becomes `setBandTop(fn)`. The band top is the
  bottom of the lowest visible reader card (support, or the stage when the support is empty), from
  `handle.freeBand()`. `freeBand()` for a dock returns `{ top: <bottom of stage+support>, bottom:
  viewport bottom }`. `place` clips the outline's top to the band top, and `tick` aims the block's
  top at `max(bandTop + BAND_GAP_PX, chromeFloor)` instead of `FOLLOW_AT × innerHeight`.

### Test surface

- `settings.test.ts`: the `word` default, `redLetters` normalisation.
- `storage.test.ts`: the migration moves flowing to word once, keeps a later Flowing choice, and
  leaves a missing record alone.
- `settings-panel.test.ts`: the Red letters checkbox reads and writes `redLetters`.
- `mount.test.ts` / `stage.test.ts`: `data-red-letters` follows the setting without a timeline rebuild.
- `exhibits.test.ts`: dock order is newest first, and the default stays document order.
- `vscode-extension/src/manifest.test.ts`: manifest defaults match `DEFAULT_SETTINGS`.
- `tests/e2e/extension.spec.ts`: in Overlay and Side panel, the stage top is at the reader top
  and stays fixed, cards and exhibits are below it with the newest first, and the Overlay follow
  puts the current block below the cards. `tests/e2e/core.spec.ts`: red-letters off shows no
  accent colour on the first letter or the pivot.

## Verification

strategy: none
gate: developer

- reader-word-motion-default: none — unit tests on the default and the browser migration, run in CI, verify it before merge.
- reader-red-letters-toggle: none — unit tests on the setting and panel, plus Playwright checking the letter colour with the toggle on and off, run in CI.
- browser-dock-stage-top: none — Playwright on the Overlay and Side panel fixture checks stage position, card order and the page follow, run in CI.

## Test Plan

1. Walk the VS Code panel in the Extension Host: reading box at the top, cards and exhibits below, newest first (row `vscode-fixed-chunk-box`, `walk-owed`).

## Out of scope

Fixing Flowing's smoothness at 30 Hz; the non-dock layouts (core demo panel/floating without
`bottomStage`); other accent colours; new keyboard shortcuts.
