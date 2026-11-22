# Flow-by-default UX: design

Run: `2026-11-22-feat-three-row-default-ux`. Builds on `2026-11-20-snake-flow` (the ribbon) and
`2026-11-20-three-row-flow` (the `readingMode` setting).

## Summary

Three-row flow becomes the reading mode for everyone, existing users included (moved once). In flow
mode the red target becomes a fixed-width bracket, the span a reader takes in at one glance,
configurable in characters (default 20), and the current word's middle letter is no longer red. The
WPM readout in the status line gains − / + buttons and a mouse-wheel stepper that change the speed by
25 WPM while reading, in both modes. VS Code, where the reader is always a panel, no longer offers the
overlay/side-panel display choice.

## Decisions from the question round

| # | Decision | Answer |
|---|----------|--------|
| D1 | Bracket length | A fixed "focus span" in characters, default 20; the bracket's width is that many measured characters of the ribbon font. |
| D2 | Stepping | Unchanged: one word per step; the current word's middle letter stays on the target at the bracket's centre. |
| D3 | Existing users | Move everyone to flow once (a one-time migration), then respect their choice. |
| D4 | VS Code overlay | Hide the Reader display field in VS Code and remove the `speedRead.display` contribution; the browser is unchanged. |
| D5 | WPM controls | − / + buttons beside the WPM readout, plus the mouse wheel over the readout, each step 25 WPM. |
| D6 | Verification | Unit tests and Playwright before merge, screenshots on the PR; `developer` gate, nothing held after merge. |

## Requirements

R1. Flow is the default reading mode for new users in Chrome, Firefox and VS Code; chunk mode stays selectable in Settings and persists when chosen.
R2. A user whose stored reading mode is chunk from before this change is moved to flow exactly once, the first time the reader loads their settings after the update; a later choice of chunk is kept.
R3. In flow mode the target is a pair of red brackets (above and below the middle row) of one fixed width — the focus span, in characters of the ribbon font, measured — centred on the target, the same for every word and every step; it is never wider than the row.
R4. The focus span is a setting, "Focus span", in characters, from 6 to 40, default 20, saved per host like the other settings (a `speedRead.focusChars` setting in VS Code); changing it resizes the brackets at once.
R5. In flow mode no letter of the current word is coloured red; the words keep the ribbon's normal text colour and weight.
R6. In both reading modes the status line's WPM readout has a − button before it and a + button after it; each click changes the speed by 25 WPM, and the mouse wheel over the readout does the same (wheel up faster, wheel down slower); the speed stays within 100–1000, takes effect without stopping playback, and is saved like the ↑ / ↓ keys.
R7. In VS Code the Settings panel shows no Reader (overlay / side panel) field and the extension contributes no `speedRead.display` setting; the browser reader still shows the field.

## Design

### Default and one-time migration (R1, R2)

`DEFAULT_SETTINGS.readingMode` becomes `'flow'` (`packages/core/src/settings.ts:41`); normalization
falls back to `flow` for a missing or unknown value. The VS Code contribution of
`speedRead.readingMode` (`packages/vscode-extension/package.json`) defaults to `"flow"`.

Browser: `extensionStore` (`packages/browser-extension/src/storage.ts`) keeps a separate
`storage.local` key, `migrations`, a list of applied migration ids. On `load`, when stored settings
exist and `migrations` lacks `flow-default`, it returns them with `readingMode: 'flow'`, writes the
migrated settings back and adds `flow-default` to `migrations`; with no stored settings it only
records the id (the default is already flow). A failed write leaves the id unrecorded, so the next
load tries again. The marker lives outside `Settings`, so `normalizeSettings` (which drops unknown
keys) never sees it.

VS Code: on activation the extension checks `context.globalState` for `speedRead.migrated.flowDefault`;
when absent, for each scope where `config.inspect('readingMode')` holds an explicit `'chunk'` (global,
workspace), it updates that scope to `'flow'`, then sets the flag. Workspace-folder values are left
alone (rare, and not reachable from activation without an open folder list).

### Fixed-width focus bracket (R3, R4, R5)

New setting `focusChars: number` in `Settings`, default 20, clamped to [6, 40] in `normalizeSettings`;
contributed to VS Code as `speedRead.focusChars` (number, 6–40, default 20), and flowing through the
existing flatten / read / write path (`packages/vscode-extension/src/config.ts`). The Settings panel's
Display fieldset gains "Focus span" (characters, 6–40, step 1) beside Reading mode.

In the ribbon renderer (`packages/core/src/ui/stage.ts:229-246`, `placeRibbon`), the target's width no
longer comes from the current word's span: it is `min(row, focusChars × charWidth)` with `charWidth`
the measured width of a 10-character probe in the ribbon font / 10, measured in `measureRibbon` (once
per layout, again on resize and settings change). The target is centred on the row's centre
(`--sr-target-x = (row − width) / 2`), so it does not move or resize between words. The current word
still snaps its middle letter onto the centre (D2, unchanged geometry in `ribbon-geometry.ts`).

`lightMiddle` and the `.sr-flow-mid` span (`stage.ts:207-221`, `styles.ts:209`) are removed: no
letter is wrapped or coloured. Chunk mode's ORP pivot (`.sr-pivot`) is untouched.

### WPM stepper (R6)

`renderStatus` (`stage.ts:487-506`) renders the readout as a group: a `button.sr-wpm-step` (−,
`aria-label="Slower"`), the `.sr-status-wpm` text, a `button.sr-wpm-step` (+, `aria-label="Faster"`).
Clicks call `player.speed(∓25)` — the same path the ↑ / ↓ keys use (`keys.ts:30-33`), which clamps
and saves. A `wheel` listener on the group (passive: false) calls `player.speed(+25)` on wheel up
(`deltaY < 0`) and `−25` on wheel down, one step per event, and prevents the page from scrolling. The
toolbar sits outside `.sr-stage`, so the ribbon's wheel scrub (`dial-strip.ts:93`) does not see these
events. The status signature already includes the WPM, so the readout rerenders on change; the
buttons are created once and kept across rerenders so focus and repeated clicks are not lost (the
group is built once and only the text node changes). The buttons keep keyboard focus out of the
shortcut path (they are form controls for `keys.ts`'s purposes: Space/Enter activate them, they do not
toggle playback).

### Display choice in VS Code (R7)

`display` becomes a host setting like `pageFade`: the Settings panel shows the Reader field only when
`ctx.hostSettings` includes `'display'` (`settings-panel.ts:86`), and `read()` keeps
`current.display` when the field is absent (`settings-panel.ts:198`). The browser reader passes
`hostSettings: ['pageFade', 'display']` (`reader-entry.ts:565`); the test helper
(`packages/core/src/testing/reader.ts:91`) and demo pass `'display'` where they did. The VS Code
webview (`vscode-extension/src/webview/main.ts:224`) passes none. `speedRead.display` is removed from
`packages/vscode-extension/package.json`; `config.ts` skips `display` when reading and writing (it
stays at its default inside the webview's `Settings`).

### Test surface

Unit: `settings.test.ts` (flow default, `focusChars` clamp), `storage.test.ts` (migration once, retry
after a failed write, no stored settings), `config.test.ts` / `manifest.test.ts` (VS Code: no
`display` contribution, `focusChars` and `readingMode` defaults, migration of explicit `chunk`),
`stage.test.ts` (target width equals `focusChars × charWidth`, constant across steps, clamped to the
row; no `.sr-flow-mid`; stepper buttons and wheel change WPM by 25 and clamp),
`settings-panel.test.ts` (Focus span field; Reader field only with `display` declared).
Playwright on the bottom-stage demo (`tests/e2e/core.spec.ts`): flow on first open, constant bracket
width across several steps, no red letter, − / + and wheel on the readout, screenshots.

## Verification

strategy: none
gate: developer

- reader-flow-default: none — unit tests on the default and both host migrations, and Playwright opening the demo in flow, verify it before merge.
- reader-focus-span: none — unit tests on the bracket width rule and Playwright measuring a constant bracket and no red letter on the bottom-stage demo, with PR screenshots, verify it before merge.
- reader-wpm-stepper: none — unit tests on the stepper and Playwright clicking and wheeling the readout in both modes verify it before merge.
- vscode-no-display-choice: none — manifest and settings-panel unit tests verify it before merge.

## Test Plan

No post-merge operator steps are required; every requirement is covered before merge by the tests
listed in `## Verification`.

## Out of scope

Ribbon geometry, glide and per-word stepping; chunk mode's look and its ORP pivot; the browser's
overlay and dock behaviour; new keyboard shortcuts.

## Implementation Plans

| Plan | Repo | File | Depends on |
|------|------|------|------------|
| 2026-11-22-flow-default-ux | `derio-labs/speed-read-fr` | `2026-11-22-flow-default-ux` | — |
