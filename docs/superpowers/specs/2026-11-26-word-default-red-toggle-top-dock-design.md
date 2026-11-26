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

The dock reader (`bottomStage: true`), top to bottom. The reading box moves above the support,
and the exhibits inside the support switch to newest first (R4, R5):

```diff
  .sr-main          toolbar · overall progress
- .sr-stage-support title / stop / dwell card, then exhibits in document order
  .sr-stage         the reading box (chunk or three-row flow), fixed size
+ .sr-stage-support title / stop / dwell card, then exhibits newest first
  .sr-outline       floating only: the outline card, now below the support
```

What each file is responsible for, and the entries the change adds (`+`) or replaces (`-`):

```diff
  packages/core/src/settings.ts            # Settings, DEFAULT_SETTINGS, normalizeSettings
-   flowMotion: 'flowing'
+   flowMotion: 'word'
+   redLetters: true                       # R3, render-only
  packages/core/src/ui/settings-panel.ts   # the Settings form
+   field('Red letters', …)                # both reading modes
  packages/core/src/ui/mount.ts            # builds the reader DOM, applies settings, freeBand()
-   stage.before(support)                  # panel dock
+   stage.after(support)
+   reader.dataset.redLetters
-   freeBand(): page band ends at the cards' top
+   freeBand(): page band starts at the cards' bottom
+   onBandChange(fn)                       # R6, cards grew or shrank
  packages/core/src/ui/exhibits.ts         # createExhibits: the exhibit pane and its list
+   newestFirst: reverse-position insert   # R5
  packages/core/src/ui/styles.ts           # reader stylesheet, incl. the [data-bottom-stage] dock grid
-   .sr-ribbon-row[…] .sr-w-first, .sr-pivot { color: accent }
+   .sr-reader:not([data-red-letters="off"]) … { color: accent }
  packages/browser-extension/src/storage.ts       # storage.local store + one-time migrations
+   'word-motion-default' migration        # R2
  packages/browser-extension/src/reader-entry.ts  # Overlay: page fade, follow, scroll band
-   setBandBottom(fn)
+   setBandTop(fn)                         # R6, the follow aims below the cards
+   re-follow on onBandChange
  packages/vscode-extension/package.json   # speedRead.* configuration manifest
-   speedRead.flowMotion default "flowing"
+   speedRead.flowMotion default "word"
+   speedRead.redLetters
```

## Design

### Word-by-word default (R1, R2)

- `DEFAULT_SETTINGS.flowMotion = 'word'` in `settings.ts`. The VS Code manifest's
  `speedRead.flowMotion` `"default"` value becomes `"word"` (`package.json:65`).
- `storage.ts` gains a second migration id, `word-motion-default`, applied with the same
  read-record / write-once logic as `flow-default`: on load, if the id is absent and the stored
  settings have `flowMotion: 'flowing'`, they are rewritten with `'word'` and the id is recorded.
  `save` records every known id, so a user's later choice is never overwritten. The two
  migrations are generalised into a list of `{id, apply(stored)}` applied in order.

### Red letters (R3)

- `Settings.redLetters: boolean`, default `true`, normalised like `tts.enabled` (`settings.ts:91-97`).
- It is render-only, so it goes in the live set. `sameExceptLive` (`mount.ts:116-117`) neutralises
  `redLetters` beside `wpm` and `flowMotion`. In `applySettings`'s live branch (`mount.ts:240-250`),
  when `next.redLetters` differs, the branch assigns `settings = { ...settings, redLetters:
  next.redLetters }`, sets `reader.dataset.redLetters`, and calls `saveSettings(settings)` when `save`
  is true. The player's `settings` event (`mount.ts:229-232`) copies only wpm and flowMotion, so it
  cannot carry this value. `mount` also sets `reader.dataset.redLetters = 'on' | 'off'` at mount.
- `styles.ts` gates the accents themselves, so no override rule has to win on specificity. The
  flow rule (`styles.ts:212`) becomes `.sr-reader:not([data-red-letters="off"])
  .sr-ribbon-row[data-position="middle"] .sr-w[data-in] .sr-w-first`. The pivot (`styles.ts:241`)
  splits into `.sr-pivot { font-weight: 700 }` and `.sr-reader:not([data-red-letters="off"])
  .sr-pivot { color: var(--sr-accent) }`. The pivot keeps its weight, so the fixation point still
  reads.
- The settings panel has a "Red letters" checkbox in the Display fieldset, after Flow motion
  (`settings-panel.ts:86-89`). It shows in both modes.
- VS Code: `KEYS` comes from `DEFAULT_SETTINGS`, so the manifest needs a `speedRead.redLetters`
  boolean (the manifest test enforces it).

### Reading box on top (R4, R5, R6)

- `mount.ts`: in the panel dock the support goes after the stage (`stage.after(support)` replaces
  `stage.before(support)`, `mount.ts:173`), so `main` is toolbar, progress, stage, support. In the
  floating dock the layout order is `main`, then the support, then the outline
  (`mount.ts:170`).
- `styles.ts`, floating dock (`styles.ts:540-564`):
  - The grid template changes from `minmax(0,1fr) auto auto` to `auto auto minmax(0,1fr)`. Row 1 is
    `.sr-main` (`align-self: start`), row 2 is the support (its `max-height` rule at `:549` stays),
    and row 3 is the outline card (left, `align-self: start`, `margin-top: 8px` in place of
    `align-self: end; margin-bottom: 8px`).
  - The support's `margin-bottom` (`:551`) becomes `margin-top`.
  - The narrow open-drawer rule (`:562-563`) moves to `grid-area: 2 / 1 / 4`, anchored from the top
    of row 2 (`inset: 8px auto auto 8px`), so the open outline never covers the reading box.
  - Panel dock: the stage is the fixed top row, and the support takes `flex: 1` below it (`:539`).
- `exhibits.ts`: `createExhibits` takes `newestFirst` (true in a dock). Under it, `add` mirrors
  today's sorted insert (`exhibits.ts:93-95`) in reverse: it inserts before the first shown item that
  comes *earlier* in the document. "Newest" therefore means latest by position, whatever order
  `sync` adds them in, including after a section change, a jump or a rebuild. Without the option the
  order stays document order. `reveal` keeps the active item in view as before.
- Overlay band (`mount.ts:350-356`, `reader-entry.ts`):
  - The dock's `freeBand()` returns `{ top, bottom, below }`:
    - `top` is the bottom of the support when it shows anything, else the bottom of `.sr-main`;
    - `bottom` is the reader's bottom;
    - `below` is the same as `bottom` (no reader card sits below the band in the dock).
    The doc comments on `FreeBand` (`layout.ts:66-71`) and `ReaderHandle.freeBand` (`mount.ts:56-58`)
    now say "the unobstructed band below the reader's cards" for the dock.
  - `setBandBottom` becomes `setBandTop(fn)`. `reader-entry.ts:572-575` passes `band.bottom >
    band.top ? band.top : 0`, so a degenerate band (zero rects in jsdom) falls back to the viewport
    top.
  - `place` clips the outline's top to `max(bandTop, port.top)`.
  - `tick` aims the block's top at `max(bandTop + BAND_GAP_PX, (port?.top ?? -BAND_GAP_PX) +
    BAND_GAP_PX, innerHeight × FOLLOW_AT)`, raised to `chromeFloor` as today. `FOLLOW_AT` stays as
    the floor that applies when the band is degenerate. The scrollport term is kept for nested
    scrollers.
  - Cards growing over the block: the overlay keeps the last band top. A `ResizeObserver` on the
    reader's support (exposed as `handle.onBandChange(fn)`, fired from the observer on `.sr-main`
    and the support) calls `place()`, and when the band top moved by more than 1 px it restarts the
    follow for the current block (`following = true; last = null`). That way a new stop card or
    exhibit pushes the page down with the cards.

### Test surface

New or changed tests:

- `settings.test.ts`: the `word` default and `redLetters` normalisation. The existing assertions at
  `:21-29` that hard-code `'flowing'` are updated.
- `storage.test.ts`:
  - the migration moves flowing to word once and keeps a later Flowing choice;
  - stored settings are kept as they are when the migrations record cannot be read;
  - one load with stored `chunk` + `flowing` applies both migrations (flow + word) and records both
    ids.
  The existing expectations that the record equals `['flow-default']` (`:50, :59, :66, :76, :84`)
  are updated to the two-id list.
- `settings-panel.test.ts`: the Red letters checkbox reads and writes `redLetters`.
- `mount.test.ts`: changing `redLetters` updates `data-red-letters` and saves without rebuilding the
  timeline. `stage.test.ts` is unchanged.
- `exhibits.test.ts`: dock order is newest first by position, including after `sync` re-adds
  earlier exhibits. The default order stays document order.
- `vscode-extension/src/manifest.test.ts`: manifest defaults match `DEFAULT_SETTINGS`, and the
  hard-coded `'flowing'` at `:80` becomes `'word'`.
- `reader-entry.test.ts:501-520`: the follow target becomes the band top plus the gap, with the 10 %
  floor when the band is degenerate. A new case covers a band-top change re-following the same
  block.

Rewritten e2e (`tests/e2e/extension.spec.ts`), because they encode the old geometry:

- `:582-621`: the stage now sits at the top and stays fixed, and the cards are below it, newest first.
- `:707-726`: the followed block sits below the cards.
- `:624-641`: fixed-header positions are measured below the cards.
- The "wheel over the faded page" tests (`:715, :739, :745, :764, :808`) move the mouse to a point
  inside the free band instead of `(640, 40)`.

`tests/e2e/core.spec.ts`: with Red letters off, neither the first letter nor the pivot shows the
accent colour, next to `expectRedFirstLetters` (`:389`).

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
