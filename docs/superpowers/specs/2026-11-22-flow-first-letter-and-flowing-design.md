# Flow first letter and flowing motion: design

Run: `2026-11-22-feat-flow-first-letter-and-flowing-mode`. Builds on `2026-11-20-snake-flow` (the
ribbon) and `2026-11-22-flow-default-ux` (the fixed focus-span bracket, which removed the red middle
letter).

## Summary

Two changes to three-row flow mode. First, every word on the middle row that is inside the red
brackets shows its first letter in red: it turns red as soon as the word's leading edge enters the
bracket and stays red while any part of the word is still inside it. Second, flow mode gets a motion
modifier, "Flow motion": **Word by word** (today's glide-then-hold) or **Flowing**, which is the
default. In Flowing the ribbon moves continuously at the same speed and never holds on a word. Each
word's own time (long words, clause and sentence ends) becomes slower movement instead of a stop.

## Decisions from the question round

| # | Decision | Answer |
|---|----------|--------|
| D1 | Flowing pace | Per-word timing. The ribbon slides without stopping over each word's own scheduled time, so the average speed equals the WPM, pauses become slowdowns, and the player's timing, position and speech logic stay as they are. |
| D2 | Control | A "Flow motion" field in Settings (Word by word / Flowing), saved per host (`speedRead.flowMotion` in VS Code). The default is **Flowing** (operator's amendment to the recommended option). |
| D3 | Speech and reduced motion | Flowing keeps flowing with speech on, sliding toward the next word over its estimated time from each spoken (or estimated) word boundary. Under reduced motion it falls back to word steps. |
| D4 | Verification | Unit tests and Playwright before merge, screenshots on the PR, `developer` gate, nothing held after merge. |
| D5 | Which words, which letter (author's call, the request is explicit) | Every middle-row word overlapping the bracket, not only the current word. The letter is the word's first letter or digit (the same alphabet as the middle-letter rule, `text/middle.ts`). It is red, not bold. |

## Requirements

R1. In flow mode, in both motions, every word on the middle row any part of which lies inside the red brackets shows its first letter or digit in red, not bold. The letter turns red when the word's leading edge enters the bracket and stays red until its trailing edge leaves it. A word with no letter or digit shows no red letter.
R2. No other letter in flow mode is red: words outside the brackets and every word on the top and bottom rows keep the ribbon's normal colour. Chunk mode, including its ORP pivot, is unchanged.
R3. Flow mode has a "Flow motion" setting with the choices Word by word (today's behaviour) and Flowing. Flowing is the default for new users and for saved settings that have no motion. The setting is saved per host like the other settings (`speedRead.flowMotion` in VS Code), and changing it takes effect at once.
R4. In Flowing, while playing, the ribbon moves continuously and never holds on a word. During each word's scheduled time it moves linearly from the handover point before that word to the one after it, so the speed matches the set WPM and a longer word time slows the movement instead of stopping it. The current word, the one the player is on, is the one crossing the target.
R5. In Flowing, pausing freezes the ribbon where it is, and resuming continues the movement from there. The dial, the mouse wheel and position jumps move word by word with today's glide. Cards, block and inline stops and dwells hold as they do today, and the end of a run settles on its last word.
R6. In Flowing with speech on, each spoken or estimated word boundary starts a continuous slide from where the ribbon is toward the next handover point, over that word's estimated time. A boundary that arrives early retargets the slide from the current position. A reader with no word boundaries holds as it does today.
R7. With reduced motion requested, Flowing behaves like Word by word.

## Design

### First letter in the bracket (R1, R2)

Pure geometry, in `packages/core/src/ui/ribbon-geometry.ts`:

- `firstLetter(text): [start, end] | null` gives the first letter or digit (`\p{L}|\p{N}`, a whole
  code point), or null when there is none. It sits beside `middleLetter` (`text/middle.ts`) and uses
  the same alphabet.
- `inBracket({ span, x, row, target }): boolean`. A word's span `{start, width}` in line coordinates
  lands on screen at `start − x + row / 2` (the middle row's `--sr-shift` is `0.5 × row`,
  `styles.ts:210`, and `--sr-x` moves the line left by `x`, `styles.ts:214`). It is inside when
  `left < target.x + target.w && left + width > target.x`, where `target.x = (row − w) / 2` and
  `w = focusWidth(...)` (`ribbon-geometry.ts:14`).

Renderer (`stage.ts`): `buildRibbon` (`stage.ts:150-180`) wraps each middle-row word's first letter
in `span.sr-w-first`, which is unstyled by default. The top and bottom rows get no wrapper, so they
cannot turn red. `markCurrent` (`stage.ts:213`) keeps `data-current`. A new `markBracket(r, x)` sets
`data-in` on the middle-row `.sr-w` spans `inBracket` reports, and only those, diffing against the
previous set. The style `.sr-ribbon-row[data-position="middle"] .sr-w[data-in] .sr-w-first { color:
var(--sr-accent); }` is not bold. The flow-default spec's "no letter red" rule (`2026-11-22-flow-default-ux`
R5) is narrowed to this one exception. While the braces are hidden (speech with no boundaries,
`showWhole`, `stage.ts:556`) no word is marked.

- Word by word: `placeRibbon` marks the bracket for the destination `x` as it starts the glide.
  The glide lasts at most 100 ms, so the marks change with the step, not frame by frame.
- Flowing: the frame loop below marks the bracket on every frame, so a letter turns red the frame the
  word's edge enters the bracket and back the frame its last edge leaves.

Spans are measured once per layout (`measureRibbon`, `stage.ts:200`), so the per-frame check is
arithmetic over the spans near the target, with no layout reads.

### The motion setting (R3)

`Settings.flowMotion: 'word' | 'flowing'` (`settings.ts:16-48`), default `'flowing'`, normalized with
`oneOf` like `readingMode` (`settings.ts:107`), so a stored settings object without it reads as
flowing. No migration is needed. VS Code contributes `speedRead.flowMotion` (enum `word`/`flowing`,
default `flowing`) in `packages/vscode-extension/package.json` and carries it through `config.ts`
like `readingMode`. The Settings panel's Display fieldset gains "Flow motion" (`select`, Word by word /
Flowing) after Focus span (`settings-panel.ts:84-85`), populated (`:122`) and read (`:199`) like
Reading mode. It is shown only while the panel's Reading mode select is on flow. A setting change
reaches the stage through `player.on('settings', …)` (`stage.ts:582`): moving to word stops the
frame loop and places the current word (`placeRibbon`), and moving to flowing starts the loop on the
next timed step.

### Flowing motion (R4–R7)

Geometry, in `ribbon-geometry.ts`, pure and unit-tested:

- `handover(spans, at)`: the point between word `at − 1` and word `at`, `(mid[at − 1] + mid[at]) / 2`,
  or `mid[at]` for the first word of the laid-out window. The point after the last word is
  `mid[last]`, so a run settles on its last word (R5).
- `flowX({ from, to, startedAt, durationMs, now })`: a linear position, clamped at `to` once
  `now ≥ startedAt + durationMs`.

Renderer: a step event (`stage.ts:577`) that reaches `showFlow` in flowing mode, with a timed
`durationMs`, playing, and no reduced motion (`reducedMotion()`, `stage.ts:222`), starts a
**slide** instead of `placeRibbon`'s glide: `{ from: currentX, to: handover(after this word),
startedAt: ctx.scheduler.now(), durationMs }`. `currentX` is the handover before this word on an
ordinary advance, or the frozen `x` after a resume (R5). The line's transition is off
(`--sr-glide: 0ms`) while sliding. A loop on `ctx.frame` (`context.ts:23`, the dial's frame source,
faked in tests) writes `--sr-x = flowX(...)` and calls `markBracket` each frame, until the slide
reaches `to` or is cancelled. `data-current` still moves on the step (R4).

- Pause or stop (`player.on('state')`): cancel the frame and keep `x` where it was (R5). On resume
  the player re-shows the step with its full duration (`player.ts:351-355`), and the slide runs from
  the frozen `x` to the same `to` over that duration.
- A step with `durationMs: null` (a scrub, `player.ts:249`, a seek, a stop or dwell, a card) cancels
  any slide and uses `placeRibbon` with its glide, as today (R5).
- Speech (R6): spoken steps come with `durationMs: null` through `showSpoken` (`player.ts:198-208`).
  When `player.settings.tts.enabled` and the step arrives while playing in flowing mode, the stage
  starts a slide from the current `x` to the next handover point over `stepDuration(step,
  player.settings)` (`pacing.ts:26`), the word's estimated time at the set speed. A boundary that
  arrives first starts a new slide from wherever the ribbon is. A slide that finishes before the
  next boundary holds at its `to`. `showWhole` (no boundaries) holds with the braces hidden, as today.
- A run window rebuilt mid-slide (`showFlow`, `stage.ts:258-268`) carries the slide's progress into
  the new ribbon's coordinates by re-anchoring `from` and `to` to the same word indices.
- `relayoutRibbon` (resize, `stage.ts:276`) remeasures and recomputes the slide's `from` and `to`
  from the word indices, keeping its timing.
- Reduced motion: no slide. The step is placed as in Word by word, with no glide (R7).

### Docs

`README.md`: the flow section (`README.md:80-90`) describes the red first letter of words inside the
bracket (replacing "no letter is coloured red", `:88`), the Flow motion choice with Flowing as the
default, its behaviour on pause, scrub, speech and reduced motion, and a Settings table row "Flow
motion | Flowing | Word by word or Flowing (`speedRead.flowMotion` in VS Code)" (`:169-170`).

### Acceptance matrix

Two new rows (`reader-flow-first-letter`, `reader-flowing-motion`) and two amendments of merged rows:
`reader-focus-span` (its "no letter of the current word is red" becomes the first-letter rule) and
`reader-snake-flow` ("words glide one at a time" becomes "flow continuously, or word by word with a
glide").

### Test surface

Making Flowing the default moves harness- and demo-based flow tests that assert glide-then-hold
(`stage.test.ts`, `tts-panel.test.ts`, `tests/e2e/core.spec.ts`, `webview.spec.ts`) into flowing.
Those that test word-by-word placement pin `flowMotion: 'word'` explicitly.

Unit tests:

- `settings.test.ts`: `flowMotion` default and normalization.
- `config.test.ts` / `manifest.test.ts`: the VS Code contribution and its round trip.
- `ribbon-geometry.test.ts`: `firstLetter` on punctuation, digits, chips and letterless words;
  `inBracket` at the bracket's edges; `handover` at a window's ends; `flowX` clamping.
- `stage.test.ts`, with the fake frame source and clock:
  - first-letter spans exist only on the middle row; `data-in` follows the bracket in word mode;
  - in flowing, a word turns red on the frame its edge enters and clears on the frame it leaves;
  - `--sr-x` advances monotonically within a step and across steps, without holding;
  - pause freezes and resume continues; a scrub glides word by word;
  - with speech on, boundaries start and retarget slides;
  - reduced motion places without a slide;
  - switching motion takes effect at once.
- `settings-panel.test.ts`: the Flow motion field appears only with flow selected, and its value
  round-trips.

Playwright on the bottom-stage demo (`tests/e2e/core.spec.ts`):

- a word's first letter is red while it overlaps the bracket and not after it leaves;
- in flowing, the ribbon's transform changes between two samples taken within one word's time;
- in word by word, it holds;
- screenshots for the PR.

## Verification

strategy: none
gate: developer

- reader-flow-first-letter: none — unit tests on the overlap rule and the marks in both motions, plus Playwright checking the red first letter on the bottom-stage demo with PR screenshots, verify it before merge.
- reader-flowing-motion: none — unit tests with a fake clock and frame source on slide, pause, scrub, speech and reduced motion, plus Playwright sampling the ribbon's movement within one word, verify it before merge.

## Test Plan

No post-merge operator steps are required. Every requirement is covered before merge by the tests
listed in `## Verification`.

## Out of scope

Chunk mode; the bracket's width and the focus-span setting; the ribbon's layout, run windows and
cards; WPM controls; new keyboard shortcuts.
