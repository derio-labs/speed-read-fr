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
R3. The current word sits with the letter nearest its character midpoint exactly on a fixed target at the horizontal centre of the middle row; that letter is red and not bold.
R4. The target is drawn as a red brace above and a red brace below the current word, spanning the word's full width, always visible and never covered by the text.
R5. Between steps the ribbon glides to the next word in a short ease (no more than a third of the word's display time) and holds still for the rest of it.
R6. Turning the position dial or the mouse wheel moves the ribbon forward or backward word by word with the same glide, and playback resumes from the reached word.
R7. In flow mode the reading window is much wider than in chunk mode: near the full viewport width in the browser overlay and the full panel width in VS Code.
R8. An inline code or math token of at most 20 characters flows through the ribbon like a word, set in monospace on a subtle background, and stays on the target longer the longer it is.
R9. An inline code or math token longer than 20 characters appears in the ribbon as a short numbered chip and in full in the section's exhibits panel, where it follows the code exhibit setting (stop, dwell or skip).
R10. Chapter cards, title cards, stops, dwells, whole-list cards and the end card keep their current behaviour in flow mode; the ribbon resumes after them.
R11. In the docked reader (browser dock and VS Code panel) the words-per-chunk and characters-per-chunk settings again go up to the general limits (10 words, 80 characters), capped only by how many characters fit the reading window, and a long chunk is never cut.
R12. With speech on, the ribbon follows the spoken word; without word-boundary events it holds at the start of the spoken sentence with the target hidden.

## Design

### Timeline in flow mode

When `readingMode` is `flow`, `buildTimeline` chunks every sentence with `chunkWords: 1`, so each
prose or list-item step is one token and the existing pacing (clause and sentence pauses, long-token
factor, speed ramp) applies per word. The `chunkWords` / `chunkChars` settings keep their values and
apply again on switching back to chunk mode. Atom pacing: an atom's duration grows with its length
(R8) — the existing long-token factor is extended so a code atom counts roughly one base unit per
eight characters.

Long atoms (R9): during timeline build in flow mode, an atom longer than `LONG_ATOM_CHARS = 20` is
replaced by a chip token (`⟨code n⟩` / `⟨math n⟩`, numbered per section) and registered as an
exhibit of the section — a new inline-exhibit entry carrying the atom text and its kind — revealed
at the chip's step. The step after the chip is a `stop` / `dwell` per the `code` exhibit setting
(math atoms follow the `math` setting); with `skip` the chip flows on and the exhibit is still
listed. The exhibits panel renders an inline exhibit as a code (or math) view of the text.

### The ribbon

`stage.ts` gets a flow renderer that owns a ribbon element per row. The run of consecutive chunk /
item-chunk steps around the current position (bounded by cards) is laid out once as a single line
of word spans (list items joined with a bullet separator); widths are measured once per layout. The
three rows are three clipped viewports onto that same line: with row width `W` and the current
word's middle-letter centre at offset `x` in the line, the middle row shows `[x − W/2, x + W/2]`,
the top row `[x − 3W/2, x − W/2]` and the bottom row `[x + W/2, x + 3W/2]`, each by a
`translateX`. Moving to another word animates the shared offset (CSS transition on transform,
duration `min(100ms, stepMs / 3)`); a jump of more than a row snaps without animation. Words cut by
a row edge stay cut at the pixel — the next row continues them. The middle letter is the character
at `floor(len / 2)` of the word's letters and digits (punctuation excluded); for a chip, its centre.

The target is an overlay at the middle row's centre: a brace above and below whose width is set to
the current word's measured width (plus a small margin) and re-set per step; it sits outside the
text box so glyphs never cover it. The current word's middle letter gets the accent colour at
normal weight; the old `.sr-flow-axis` ticks go. Rows render at one size (the current-row font);
the middle row is not emphasised beyond the target. Relayout on resize, settings change, and
section or card boundaries.

### Width

The floating stage card gets `data-reading-mode="flow"` and, in that mode, a width of
`min(1200px, calc(100% - 64px))` in all floating breakpoints; the outline and exhibits cards keep
their positions and the stage card sits above them when they would overlap. The VS Code webview's
bottom stage already fills the panel; flow mode only removes the old fixed height so three rows fit.

### Chunk cap (R11)

Remove `mount.ts`'s `bottomStage ? { words: 3, chars: 20 }` cap. In the docked reader, the settings
panel's characters field takes as its maximum the number of characters that fit the stage width at
the chunk font (measured, at most 80); a chunk wider than the stage wraps inside it (the existing
wrap path) instead of being clipped.

### Speech

The ribbon follows the speech driver's word-boundary position exactly as the player's position
today. With no boundary events, the existing whole-sentence fallback holds the ribbon at the
sentence's first word and hides the target braces.

## Verification

strategy: none
gate: tester

- reader-snake-flow: live — only an operator watching it at reading speed in Chrome and VS Code can judge that the snake reads naturally; before merge, unit tests cover the ribbon offsets, wrapping, middle-letter choice, atom split and timeline, and Playwright (`tests/e2e/core.spec.ts`, webview spec) checks three rows of consecutive text, the middle letter on the target centre, brace width matching the word, forward and backward wheel movement, and the wide window, with screenshots attached to the PR.
- reader-inline-code-split: none — unit tests on the flow timeline (chip and exhibit for a 21-character atom, inline flow for a 20-character one, pacing growth) and a Playwright check of the chip and its exhibit card verify it before merge.
- reader-dock-chunk-limits: none — unit tests on settings capping in `bottomStage` and a Playwright check that a 6-word / 40-character chunk shows whole in the dock verify it before merge.

## Test Plan

1. After merge, in Chrome (browser overlay) and in the VS Code panel, switch Reading mode to flow and read a technical page for a minute at 300 and at 600 WPM: three rows of running text, words gliding into the braced target one at a time with the middle letter red, the window near full width.
2. Roll the mouse wheel backward and forward mid-paragraph: the ribbon reverses and advances word by word, and playback resumes from the reached word.
3. On a page with a long hash or identifier in inline code, see its chip pass in the ribbon and the full text in the exhibits panel.

## Out of scope

Changing chunk mode's layout or alignment beyond lifting the cap; new settings (no resizable width);
changing structured-content cards, exhibits for block code, or the speech policy.
