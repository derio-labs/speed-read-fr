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

`DEFAULT_SETTINGS.readingMode` becomes `'flow'` (`packages/core/src/settings.ts:42`); normalization
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

In the ribbon renderer (`packages/core/src/ui/stage.ts:228-246`, `placeRibbon`), the target's width no
longer comes from the current word's span: it is `min(row, focusChars × charWidth)` with `charWidth`
the measured width of a 10-character probe in the ribbon font / 10, measured in `measureRibbon` (once
per layout and again on resize). The target is centred on the row's centre
(`--sr-target-x = (row − width) / 2`), so it does not move or resize between words. The current word
still snaps its middle letter onto the centre (D2, unchanged geometry in `ribbon-geometry.ts`). The
pure width rule — `focusWidth({ focusChars, charWidth, row })` — lives in `ribbon-geometry.ts` so it is
unit-testable without layout.

Today a settings change only rerenders the status line (`stage.ts:532`); `relayoutRibbon`
(`stage.ts:276-281`) runs only from the ResizeObserver and drawer observer. The stage therefore adds a
`player.on('settings', …)` handler that, when `focusChars` changed since the last placement, recomputes
the target's width and offset (`--sr-target-w` / `--sr-target-x`) of the live ribbon, so R4's
"resizes at once" holds.

`lightMiddle`'s colouring and the `.sr-flow-mid` style (`stage.ts:207-222`, `styles.ts:209`) are
removed: no letter is wrapped or coloured. The current word instead carries an unstyled
`data-current` attribute on its `.sr-w` span, moved by the renderer on every placement (none while the
braces are hidden). Existing unit and e2e tests that find the current word through `.sr-flow-mid`
(`stage.test.ts`, `tts-panel.test.ts`, `tests/e2e/core.spec.ts`, `extension.spec.ts`,
`webview.spec.ts`) move onto `.sr-w[data-current]`; where a test needs the middle letter's position it
uses the geometry helper (`middleLetter`) instead of a DOM span. Chunk mode's ORP pivot (`.sr-pivot`)
is untouched.

### WPM stepper (R6)

The status line gets a stepper group, `span.sr-wpm`, built once when the stage is created: a
`button.sr-wpm-step` (−, `aria-label="Slower"`), the `.sr-status-wpm` text, a `button.sr-wpm-step`
(+, `aria-label="Faster"`). `renderStatus` (`stage.ts:487-506`) today rebuilds every child of `status`
with `replaceChildren` on any signature change, which would detach a focused button; it changes to
keep the group as the fixed first child of `status`, updating only the WPM text node, and to replace
only the spans after it (state, progress, notes).

Clicks call `player.speed(∓25)` — the same path the ↑ / ↓ keys use (`keys.ts:29-33`), which clamps
to 100–1000, emits `settings` and saves. Both listeners first check `ctx.accepts(event)`
(`context.ts:29-30`), as the dial, panel and keys do, so in the browser (`trustedEventsOnly`) page
scripts cannot change the speed.

Focus: the buttons are `tabindex="-1"` and a pointer click returns focus to the reader root, so Space
keeps toggling playback after a click; they stay reachable for assistive technology by their labels.
(The toolbar is outside `.sr-stage`, which is why keys pressed on a button today never reach the
shortcuts, `keys.ts:76-83` — `FORM_CONTROL` does not list buttons.)

Wheel: a `wheel` listener on the group (`passive: false`) normalizes with the dial's `wheelDelta`
(`dial-strip.ts:14-18`), ignores events whose vertical component is zero and leaves ctrl/meta wheel
(zoom) to the browser, as the dial does (`dial-strip.ts:61-66`). It accumulates the vertical delta
and steps 25 WPM per 100 px accumulated (wheel up faster, down slower), so a mouse notch is one step
and a trackpad flick a few, not hundreds; the remainder resets after 300 ms without wheel events. It
prevents the page from scrolling only when it handled the event. The toolbar sits outside
`.sr-stage`, so the ribbon's wheel scrub (`dial-strip.ts:93`) does not see these events.

### Display choice in VS Code (R7)

`display` becomes a host setting like `pageFade`: `HostSetting` widens to `'pageFade' | 'display'`
(`context.ts:46`); the Settings panel shows the Reader field only when `ctx.hostSettings` includes
`'display'` (`settings-panel.ts:86`), and both the populate line (`settings-panel.ts:122`) and
`read()` (`settings-panel.ts:198`) are guarded like `pageFade`'s, `read()` keeping `current.display`
when the field is absent. The browser reader passes `hostSettings: ['pageFade', 'display']`
(`reader-entry.ts:565`). The test harness (`packages/core/src/testing/reader.ts:91`) gains a
`display?: boolean` option, default true, declaring `'display'` (with `'pageFade'` when asked), so
existing panel tests keep the field and a test can mount without it; the demo (`tests/demo/demo.ts`)
declares `['display']`, standing in for the browser. The VS Code webview
(`vscode-extension/src/webview/main.ts:224`) passes none. `speedRead.display` is removed from
`packages/vscode-extension/package.json`; `config.ts` skips `display` when reading and writing (it
stays at its default inside the webview's `Settings`).

### Docs

`README.md` is updated with the behaviour: flow is the default and existing users are moved once
(replacing `README.md:76-77, 95-96`), the fixed focus-span bracket with no red letter (`:81-82`), the
− / + and wheel on the WPM readout (beside the wheel's dial use, `:147`), a Focus span row (6–40,
default 20) and Reading mode default "Three-row flow" in the Settings table (`:154+`), and that VS
Code has no Reader display choice.

### Acceptance matrix

Besides the four new rows, this feature rewords two merged rows by amendment: `reader-snake-flow`
(fixed-width bracket, no red letter) and `reader-three-row-flow`, whose current text says chunk stays
the default (R1 makes flow the default, chunk selectable and persisted).

### Test surface

Flipping the default moves every harness- and demo-based test that does not name a mode into flow
(`testing/reader.ts:84` mounts `{ ...DEFAULT_SETTINGS, ...opts.settings }`; `tests/demo/demo.ts:42`):
chunk-mode tests (`.sr-pivot`, `chunk-cap.test.ts`, chunk cases in `stage.test.ts`, chunk e2e
cases) pin `readingMode: 'chunk'` explicitly, and `storage.test.ts`'s "bogus or legacy stored reading
mode normalizes to chunk" assertion flips to flow.


Unit: `settings.test.ts` (flow default, `focusChars` clamp), `storage.test.ts` (migration once, retry
after a failed write, no stored settings), `config.test.ts` / `manifest.test.ts` (VS Code: no
`display` contribution, `focusChars` and `readingMode` defaults, migration of explicit `chunk`),
`ribbon-geometry.test.ts` (`focusWidth` rule and row clamp), `stage.test.ts` (target width constant
across steps; changing `focusChars` resizes the live bracket; no coloured letter, `data-current` on
the current word; stepper buttons and accumulated wheel change WPM by 25 and clamp; untrusted events
ignored with `trustedEventsOnly`; focus returns to the reader after a click and survives a status
rerender),
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
