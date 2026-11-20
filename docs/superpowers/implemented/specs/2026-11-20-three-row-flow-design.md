# Three-row flow reading mode: design

Source brief: `I would like a second speed reading mode, where I can always see 3 rows of text and they "flow" along the crosshairs (in the center of the middle row)`.
Run: `2026-11-19-feat-three-row-flow`.

## Summary

Add an optional rolling, three-row display to the shared speed-reader core. In flow mode, text moves through a fixed focus point at the center of the middle row while the existing chunk-at-a-time mode remains available and the default. The preference is selected in Settings and saved independently by each host.

## Decisions from the question round

| # | Decision | Answer |
|---|----------|--------|
| D1 | Mode selection | Add a persistent Reading mode selector in Settings; keep the existing mode as the default. |
| D2 | Flow behavior | Use a rolling three-line window; text flows upward through a fixed center crosshair in the middle row, paced by configured WPM. Existing chapter, stop and exhibit behavior remains. |
| D3 | Verification | Use automated CI tests and a browser UI check before merge; no post-merge tester gate. The repo has no `.fr/candidate-install`, so candidate installation is unavailable. |
| D4 | Host scope | Make the mode available in Chrome, Firefox and VS Code through the shared core; each host persists its own preference. |

## Requirements

R1. The reader offers a second, rolling three-row flow mode in addition to the current chunk-at-a-time mode, available in Chrome, Firefox and VS Code.
R2. Flow mode keeps three text rows visible and moves text upward through a fixed crosshair at the center of the middle row, paced by the configured reading speed.
R3. A Reading mode setting selects between the existing mode and flow mode, persists per host, and defaults to the existing mode for current and new users.
R4. Flow mode uses the existing reader controls, reading position and structured-content behavior; chapter cards, stops and exhibits continue to behave as they do now.

## Design

### Mode and settings

Add a `readingMode` setting with `chunk` and `flow` values. Normalize unknown or missing values to `chunk`, preserving existing saved settings and the current experience. Add a Reading mode selector to the shared Settings panel. The setting is stored through the existing host-specific settings store, so browser extension storage and VS Code settings continue to be independent.

The mode affects presentation only: the existing timeline and player remain the source of truth for current position, section navigation, stop handling, pacing, pause/play, and playback completion. Existing keyboard and dial controls work in either mode. The normal chunk mode remains the default. In VS Code, contribute `speedRead.readingMode` in `packages/vscode-extension/package.json` with the `chunk`/`flow` enum and `chunk` default, and include it in the existing configuration flattening and normalization path.

### Three-row flow display

In flow mode, replace the single-chunk stage presentation with a three-row window of the reading text. The rows move upward as playback advances; new text enters at the bottom, and the active reading position passes through the fixed crosshair at the horizontal and vertical center of the middle row. The flow mode uses its own center marker at 50% of the stage width and the vertical midpoint of the middle row; it does not move with list depth. List indentation may affect the text layout, but never shifts the focus point. The current `.sr-axis` marker and its 45% position remain unchanged in chunk mode. Use the existing configured WPM and timeline pacing, including the existing speed ramp and pause behavior.

Render the window from the current timeline position and nearby text, including prose and list-item text. Preserve inline code/math token rendering. The window must remain three rows tall at available reader sizes; constrain overflowing row text without introducing extra visible rows. Update the window on playback steps, position jumps, sentence navigation and settings changes. When the current timeline step is a chapter, title, stop, dwell, whole-list or end card, keep the current card behavior rather than replacing it with flowing text.

Text-to-speech continues to own playback timing when enabled; the flow window follows the current speech position using the existing speech-boundary events. If speech has no word-boundary events, retain the existing whole-sentence fallback while keeping the three-row presentation.

## Verification

gate: developer

- reader-three-row-flow: none — unit tests verify normalization, mode-specific stage rendering, and per-host persistence; the Playwright browser scenario in `tests/e2e/core.spec.ts` verifies mode selection, persistence, the three visible rows, the fixed center focus point, forward progression, pause/resume, structured-content cards, and the unchanged chunk-mode default before merge. No post-merge action is needed. Candidate installation is unavailable because this repo has no `.fr/candidate-install`.

## Test Plan

No post-merge operator steps are required. The feature's user-visible behavior is covered before merge by the automated tests and browser scenario listed in `## Verification`.

## Out of scope

Changing chunk-mode behavior or its defaults; changing timeline pacing, reading controls, structured-content stops, host entry points, or the existing text-to-speech policy.

## Implementation Plans

| Plan | Repo | File | Depends on |
|------|------|------|------------|
| 2026-11-20-three-row-flow | `derio-net/speed-read-fr` | `2026-11-20-three-row-flow` | — |
