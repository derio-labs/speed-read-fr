# Snake flow reading mode: design

Run: `2026-11-20-feat-snake-flow`. Supersedes the display half of `2026-11-20-three-row-flow` (its
setting, persistence and host scope stay); that feature shipped chunks of up to three words on the
middle row with the previous and next chunks above and below, which is not the intended mode.

## Summary

Flow mode becomes a continuous text ribbon wrapped onto three rows of a much wider window. The eye
stays on a fixed target at the centre of the middle row; words pass through it one at a time, each
word snapping so its middle letter sits on the target. The whole ribbon shifts left by one word per
step, so text enters at the bottom right, wraps up to the middle row, crosses the target, wraps up
to the top row and leaves at the top left. Read top-left to bottom-right, the three rows are plain
running text: just read, now, coming next. Separately, the docked reader's 3-word / 20-character
chunk cap is lifted again.

## Decisions from the question round

| # | Decision | Answer |
|---|----------|--------|
| D1 | Geometry | One continuous ribbon on three rows, each row one window-width of the stream; the target is fixed at the middle row's centre; each step shifts the ribbon left by one word and row ends wrap upward (bottom → middle → top). |
| D2 | Target look | Replace the two short ticks with a box: a red horizontal brace above and below the current word, spanning its width; only the centre letter is red, not bold. |
| D3 | Inline code | Split by length: an atom (inline code or math) of at most 20 characters flows like a word, in monospace with a subtle background and extra time for its length; a longer one is a placeholder chip in the ribbon and is shown in full in the exhibits panel, following the code exhibit behaviour (stop / dwell / skip). |
| D4 | Motion | Quick glide, then hold: the ribbon eases to the next word (~100 ms, never more than a third of the word's time), then holds. The wheel drives the same glide forward or backward. |
| D5 | Width | Near full width in flow mode: about min(1200px, viewport − 64px) in the browser overlay; the full panel in VS Code. Chunk mode keeps its width. |
| D6 | Verification | Unit tests and Playwright checks before merge with PR screenshots; the operator walks it in Chrome and VS Code after merge, held by a `tester` gate. |

## Requirements

R1. In flow mode the reader shows three full rows of one continuous text ribbon; read left to right, top to bottom, the rows are consecutive running text, with the text just read on the top row and the text to come on the bottom row.
R2. Flow mode advances one word per step at the configured speed; each step shifts the ribbon left by one word, with text leaving the left end of a row continuing at the right end of the row above, so the current word is always at the centre of the middle row.
R3. The current word's middle letter — among its letters and digits, the one at index floor((n − 1) / 2) of n, or the middle character when it has none — sits exactly on a fixed target at the horizontal centre of the middle row; that letter is red and not bold.
R4. The target is drawn as a red brace above and a red brace below the current word, spanning the word's full width, always visible and never covered by the text.
R5. Between words the ribbon glides to the next word in a short ease of min(100 ms, a third of one word's time at the set speed) and then holds still; with reduced motion requested it moves without the glide.
R6. Turning the position dial or the mouse wheel moves the ribbon forward or backward word by word with the same glide, and playback resumes from the reached word.
R7. In flow mode the reading window is much wider than in chunk mode: about min(1200px, viewport − 64px) in the browser overlay and the full panel width in the browser dock and VS Code.
R8. An inline code or math token of at most 20 characters flows through the ribbon like a word, set in monospace on a subtle background, and stays on the target for max(1, ceil(length / 8)) word-times.
R9. An inline code or math token longer than 20 characters appears in the ribbon as a short numbered chip and in full in the section's exhibits panel, each such token its own exhibit, following the code (or math) exhibit setting: on stop or dwell the ribbon stays on screen with the chip on the target while the prompt shows beside it.
R10. Chapter cards, title cards, block-exhibit stops and dwells, whole-list cards and the end card keep their current behaviour in flow mode; the ribbon resumes after them.
R11. In every reader that uses the bottom stage (browser overlay, browser dock, VS Code panel) the words-per-chunk setting again goes up to 10 and the characters-per-chunk setting up to 80, the characters limit capped by how many characters fit the chunk stage; a chunk wider than the stage shrinks and then wraps inside it, and is never cut off.
R12. With speech on, the ribbon follows the spoken word, using the estimated word boundaries the bottom-stage hosts already produce; on a reader with neither real nor estimated boundaries it holds at the spoken sentence's first word with the target hidden.

## Design

### Timeline in flow mode

`buildTimeline` (`packages/core/src/timeline.ts:128`) consults `readingMode`: in `flow` it chunks
every sentence with `chunkWords: 1` (`text/chunks.ts:29`), so each prose or list-item step holds one
token and the existing per-step pacing (clause and sentence pauses, speed ramp) applies per word. The
stored `chunkWords` / `chunkChars` are untouched and apply again in chunk mode; a mode switch already
rebuilds the timeline (`ui/mount.ts:236-253`).

Pacing (`pacing.ts:24-36`): for a step whose token is an atom, the token's time is
`base × max(1, ceil(len / 8))` and it takes no flat long-token bonus; words keep today's rule
(base plus 0.3 base above 8 characters).

### Long atoms as inline exhibits (R9)

In flow mode, an atom longer than `LONG_ATOM_CHARS = 20` is replaced in its sentence by a chip token:
`{ kind: 'atom', atom, text: '⟨code n⟩' | '⟨math n⟩', full: <original text> }` (a new optional
`full` field on the atom variant of `Token`, `model.ts:40`), numbered from 1 per section. Speech reads
a chip as the word "code" or "formula" (`tts.ts:233-238` speaks atoms today; a chip must not spell a
hash).

`TimelineExhibit` (`timeline.ts:45-50`) becomes a union: the existing block exhibit, plus
`{ inline: true, blockIndex, inlineIndex, kind: 'code' | 'math', text, revealAt }`. Every exhibit gets
an identity key — `b<blockIndex>` for a block exhibit, `b<blockIndex>i<inlineIndex>` for an inline
one — and the exhibits panel's `shown` map, active highlight and E-to-expand
(`ui/exhibits.ts:59-124`) key on it instead of `blockIndex`; `player.ts:104`'s `exhibitKey` uses it
for inline exhibits. The panel and the expanded view render an inline exhibit in core as a
`<pre><code>` (math: the TeX source in the same monospace view) — never through `host.exhibit`,
which clones a source element an atom does not have (`ui/host.ts:24`, `ui/clone-host.ts:26-28`).

The step after the chip is a `stop` / `dwell` carrying the inline exhibit's key, per the `code` (or
`math`) setting; with `skip` none is added and the exhibit is still listed. In flow mode such an
inline stop or dwell does **not** end the ribbon: the ribbon stays on screen with the chip on the
target, and the stop/dwell prompt renders in the stage-details area of bottom-stage hosts
(`stage.ts:86-102` today empties the display for any non-prose step; inline stops are the exception)
or in the status line on a reader without one. Speech ends the utterance at the chip's stop and
starts a new one with the rest of the sentence on resume (`player.ts:209` already splits utterances
at a non-chunk step).

### The ribbon

`stage.ts` replaces its flow renderer (`stage.ts:109-146`) with a ribbon renderer. It lays out the
word spans of the current run — consecutive chunk / item-chunk steps, bounded by card steps (block
exhibits, chapter, title, whole-list, end; not inline stops) — limited to a window of 400 words
around the current position and re-laid out when the position comes within 100 words of the window's
edge, as one line (list items joined with a `•` separator). Widths are measured once per layout. The
three rows are three clipped viewports onto that same line: with row width `W` and the centre of the
current word's middle letter at offset `x`, the middle row shows `[x − W/2, x + W/2]`, the top row
`[x − 3W/2, x − W/2]` and the bottom row `[x + W/2, x + 3W/2]`, each by a `translateX` of one shared
offset. Words cut by a row edge stay cut at the pixel; the adjacent row continues them.

Motion: the offset changes with a CSS transition of `min(100ms, baseMs(wpm) / 3)` — defined for
timed, scrubbed and speech-driven steps alike, since it depends on the speed setting, not the step's
`durationMs` (null for scrub and speech, `player.ts:27-28, 201, 247`). A new target mid-glide
retargets from the current position (the transition's natural behaviour). A move of more than one
row width snaps without a transition, as does every move under `prefers-reduced-motion`
(`styles.ts:462`).

Target: an overlay at the middle row's centre with a red brace above and below, its width set per
step to the current word's measured width plus 4px each side, positioned outside the text's line box
so glyphs never cover it. The current word's middle letter (R3) gets the accent colour at normal
weight. The `.sr-flow-axis` ticks (`styles.ts:205-208`) are removed. All three rows use one font
size. Relayout on resize, settings change and run boundaries.

### Width (R7)

The rules to change are the bottom-stage ones every shipping host uses (`reader-entry.ts:563-564`,
`vscode-extension/src/webview/main.ts:224`): with `data-reading-mode="flow"` on the reader,
`.sr-reader[data-bottom-stage][data-layout="floating"] .sr-main` (`styles.ts:515-517`) and the
bottom-stage `.sr-stage` (`styles.ts:470-472`) widen from `min(420px, 100%)` to
`min(1200px, calc(100% - 64px))` in the overlay and `100%` in panel layout; the flow display's fixed
height (`styles.ts:475`) grows to fit three rows. Chunk mode keeps 420px. The non-bottom-stage
floating rules (`styles.ts:405-450`) are left alone.

### Chunk cap (R11)

Remove `mount.ts:122-130`'s fixed `{ words: 3, chars: 20 }` cap. In bottom-stage hosts the effective
characters limit is `fit = floor(stageWidth / charWidth)` clamped to [5, 80], where `charWidth` is
the measured width of a 10-character probe at the chunk font / 10. It is measured after the first
layout and again on resize; before layout (width 0) no fit cap applies. `readSettings` clamps the
*effective* `chunkChars` to `fit` (a change rebuilds the timeline, keeping position); the stored value
stays as the user set it, so a wider window gives it back. The settings panel's characters field shows
`fit` as its max and is refreshed when the panel opens. The words limit is 10.

Bottom-stage chunks today skip alignment (`stage.ts:171` returns before `align()`; `stage.ts:375`
realigns only without details) and are clipped by `white-space: pre` with an ellipsis
(`styles.ts:483-489`). In bottom-stage hosts `align()` now runs with the axis at 50%: it shrinks a
too-wide chunk down to `MIN_SCALE` and then sets `data-wrap`, whose bottom-stage CSS wraps the chunk
onto two centred lines without ellipsis.

### Speech (R12)

The ribbon follows the player's position, which the speech driver moves on each boundary event — real
or, in bottom-stage hosts, estimated (`mount.ts:141` `estimateBoundaries: options.bottomStage`,
`tts.ts:297, 375-376`). The no-boundary case occurs only on a non-bottom-stage reader (the demo page);
there the ribbon holds at the sentence's first word and hides the braces — new behaviour replacing
today's wrapped-sentence fallback (`stage.ts:346-351`).

### Test surface

`tests/demo/demo.ts` gains a `?bottomStage` switch, so `tests/e2e/core.spec.ts` drives the layout
users see. The flow and width checks run on the bottom-stage demo in floating and panel layout; the
no-boundary speech check runs on the plain demo.

## Verification

strategy: none
gate: tester

- reader-snake-flow: live — only an operator watching it at reading speed in Chrome and VS Code can judge that the snake reads naturally; before merge, unit tests cover ribbon offsets, row wrapping, the middle-letter rule, run bounds, glide duration and the estimated-boundary path, and Playwright on the bottom-stage demo (floating and panel) checks three rows of consecutive text, the middle letter on the target centre, brace width matching the word, wheel back and forward, a chapter card and a block stop interrupting and resuming the ribbon, and the wide window, with screenshots attached to the PR.
- reader-inline-code-split: none — unit tests on the flow timeline (a 20-character atom inline, a 21-character one as chip plus exhibit, two long atoms in one block as two exhibits with distinct keys, atom pacing) and a Playwright check of the chip on the target, its stop prompt beside the ribbon and its exhibit card verify it before merge.
- reader-dock-chunk-limits: none — unit tests on the effective-cap clamp (fit from a given width, no cap at width 0, stored value kept) and Playwright on the bottom-stage demo checking that a 6-word / 40-character chunk shows whole in panel layout and that an over-wide chunk wraps without ellipsis verify it before merge.

## Test Plan

1. After merge, in Chrome (browser overlay) and in the VS Code panel, switch Reading mode to flow and read a technical page for a minute at 300 and at 600 WPM: three rows of running text, words gliding into the braced target one at a time with the middle letter red, the window near full width.
2. Roll the mouse wheel backward and forward mid-paragraph: the ribbon reverses and advances word by word, and playback resumes from the reached word.
3. Read on past a chapter heading and a code block: the chapter card and the code stop replace the ribbon as in chunk mode, and the ribbon resumes after them.
4. Turn speech on and let it read a paragraph in flow mode: the target follows the spoken word.
5. (Also covered before merge, row reader-inline-code-split.) On a page with a long hash in inline code, see its chip on the target and the full text in the exhibits panel.

## Out of scope

Chunk mode's width; new settings (no resizable width); block-exhibit, card and speech policies beyond
what R9, R10 and R12 state; the non-bottom-stage floating layout's widths.

## Implementation Plans

| Plan | Repo | File | Depends on |
|------|------|------|------------|
| 2026-11-20-snake-flow | `derio-labs/speed-read-fr` | `2026-11-20-snake-flow` | — |
