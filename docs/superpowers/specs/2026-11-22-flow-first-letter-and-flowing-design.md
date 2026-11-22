# Flow first letter and flowing motion: design

Run: `2026-11-22-feat-flow-first-letter-and-flowing-mode`. Builds on `2026-11-20-snake-flow` (the
ribbon) and `2026-11-22-flow-default-ux` (the fixed focus-span bracket, which removed the red middle
letter).

## Summary

Two changes to three-row flow mode. First, every word on the middle row that is inside the red
brackets shows its first letter in red. It turns red as soon as the word's leading edge enters the
bracket and stays red while any part of the word is still inside. Second, flow mode gets a motion
modifier, "Flow motion": **Word by word** (today's glide-then-hold) or **Flowing**, which is the
default. In Flowing the ribbon moves continuously at the same speed and never holds on a word. Each
word's own time (long words, clause and sentence ends) becomes slower movement instead of a stop.

## Decisions from the question round

| # | Decision | Answer |
|---|----------|--------|
| D1 | Flowing pace | Per-word timing. The ribbon slides without stopping over each word's own scheduled time, so the average speed equals the WPM and pauses become slowdowns. The player's timing, position and speech logic stay as they are. |
| D2 | Control | A "Flow motion" field in Settings (Word by word / Flowing), saved per host (`speedRead.flowMotion` in VS Code). The default is **Flowing** (the operator's amendment to the recommended option). |
| D3 | Speech and reduced motion | Flowing keeps flowing with speech on: it slides from each spoken or estimated word boundary toward the next word over the voice's estimated word time. Under reduced motion it falls back to word steps. |
| D4 | Verification | Unit tests and Playwright before merge, screenshots on the PR, `developer` gate, nothing held after merge. |
| D5 | Which words, which letter (the author's call; the brief is explicit) | Every middle-row word overlapping the bracket, not only the current word. The letter is the word's first letter or digit, from the same alphabet as the ORP and middle-letter rules (`text/orp.ts:7-10`). It is red and not bold. |

## Requirements

R1. In flow mode, in both motions, every middle-row word with any part inside the red brackets shows its first letter or digit in red, not bold. The letter turns red when the word's leading edge enters the bracket and stays red until its trailing edge leaves. A word with no letter or digit shows no red letter. The marks follow the bracket whenever words or the bracket move: a step, the continuous motion, a resize, or a focus-span change.
R2. No other letter in flow mode is red. Words outside the brackets and every word on the top and bottom rows keep the ribbon's normal colour. Chunk mode, including its ORP pivot, is unchanged.
R3. Flow mode has a "Flow motion" setting with two choices: Word by word (today's behaviour) and Flowing. Flowing is the default, both for new users and for saved settings that have no motion. The setting is saved per host like the other settings (`speedRead.flowMotion` in VS Code). Changing it takes effect at once, without moving the reading position. The Settings panel shows the field only while Reading mode is set to Three-row flow; hiding it keeps the stored value.
R4. In Flowing, while playing, the ribbon moves continuously and never holds on a word. During each word's scheduled time it moves linearly from the handover point before that word to the one after it, so its speed follows the set WPM, and a longer word time slows the movement instead of stopping it. The gap between two list items is crossed in the gap's time, the same way. The current word, the one the player is on, is the one crossing the target.
R5. In Flowing, pausing freezes the ribbon where it is, and resuming continues the movement from there. The dial and the mouse wheel move word by word with today's glide. A position jump (next/previous sentence or section, an outline entry) moves straight to the reached word, and flowing continues from there. Cards, block exhibit stops and dwells hold as they do today. A word followed by an inline stop or dwell slides only until its middle sits on the target, then holds there while the stop or dwell lasts. The end of a run settles on its last word.
R6. In Flowing with speech on, each spoken or estimated word boundary starts a continuous slide from where the ribbon is toward the next handover point. The slide takes the voice's estimated word time, the same pace the estimated boundaries use. When a boundary arrives early, the slide retargets from the current position. A reader with no word boundaries holds as it does today.
R7. With reduced motion requested, Flowing behaves like Word by word.

## Design

### First letter in the bracket (R1, R2)

Pure geometry, in `packages/core/src/ui/ribbon-geometry.ts`:

- `firstLetter(text): [start, end] | null` gives the first letter or digit as a whole code point, or
  null when the text has none. It reuses the ALNUM test of `text/orp.ts:7-10`.
- `inBracket({ span, x, row, target }): boolean`. A word's span `{start, width}` in line coordinates
  sits on screen at `left = start − x + row / 2`. (The middle row's `--sr-shift` is `0.5 × row`,
  `styles.ts:210`, and `--sr-x` moves the line left by `x`, `styles.ts:212-214`.) The word is inside
  when `left < target.x + target.w && left + width > target.x`, where `target.x = (row − w) / 2` and
  `w = focusWidth(...)` (`ribbon-geometry.ts:14`).

Renderer (`packages/core/src/ui/stage.ts`):

- `buildRibbon` (`stage.ts:146-180`) wraps each middle-row word's first letter in `span.sr-w-first`,
  unstyled by default. The top and bottom rows get no wrapper, so they cannot turn red.
- `markCurrent` (`stage.ts:221`) keeps `data-current`.
- A new `markBracket(r, x)` sets `data-in` on exactly the middle-row `.sr-w` spans that `inBracket`
  reports for `x`, diffing against the previous set.
- The style is `.sr-ribbon-row[data-position="middle"] .sr-w[data-in] .sr-w-first { color:
  var(--sr-accent); }`, not bold. This narrows the flow-default spec's "no letter red" rule
  (`2026-11-22-flow-default-ux` R5) to this one exception.
- While the braces are hidden (speech with no boundaries, the flow branch of `showWhole`,
  `stage.ts:561-565`), no word is marked.

When the marks are recomputed:

- Word by word: `placeRibbon` (`stage.ts:232-249`) marks for the destination `x` as it starts its
  glide of at most 100 ms.
- Flowing: the frame loop marks on every frame.
- `sizeTarget` (`stage.ts:252-257`, also called from `refresh`, `stage.ts:638-639`) and
  `relayoutRibbon` (`stage.ts:287-292`: resize, drawer toggle) mark again for the current `x`, so a
  resize or a focus-span change made while paused is reflected at once.

Spans are measured once per layout (`measureRibbon`, `stage.ts:208`). A mark check is arithmetic over
the spans near the target, with no layout reads.

### The motion setting (R3)

`Settings.flowMotion: 'word' | 'flowing'` (`settings.ts:16-48`), default `'flowing'`. It is
normalized with `oneOf` like `readingMode` (`settings.ts:107`), so stored settings without it read as
flowing, with no migration.

VS Code contributes `speedRead.flowMotion` (enum `word`/`flowing`, default `flowing`) in
`packages/vscode-extension/package.json:64-65`. `config.ts` takes its keys from `DEFAULT_SETTINGS`
(`config.ts:20-35`), so the value round-trips with no code change there. It is covered by
`config.test.ts` and `manifest.test.ts`.

**Render-only, not a rebuild.** Today any setting except WPM rebuilds the timeline (`mount.ts:238-265`):
the player jumps back to the start of the sentence and the stage drops its ribbon (`stage.ts:634-637`).
The motion does not change the timeline, so it is applied like the WPM:

- `sameExceptSpeed` (`mount.ts:115`) becomes `sameExceptLive`, which ignores both `wpm` and
  `flowMotion`.
- `applySettings` calls a new `player.setFlowMotion(m)`, a twin of `setSpeed` (`player.ts:402-408`)
  that updates `settings` and emits `settings`. The existing listener (`mount.ts:227-229`) saves it.
- The stage's `settings` listener (`stage.ts:584`, today `renderStatus` only) compares `flowMotion`
  with its last value:
  - moving to `word` cancels any slide and places the current word with `placeRibbon`;
  - moving to `flowing` while playing starts a slide from the current `x` to the current step's end
    anchor over that step's remaining time (`durationMs − (now − step start)`, at least one frame).

**Panel.** Display fieldset (`settings-panel.ts:81-85`): "Flow motion" (`select`, Word by word /
Flowing) comes after Focus span. It is populated (`:122`) and read (`:199-200`) like Reading mode.
Conditional visibility is new to the panel:

- the field's wrapper is `hidden` unless the Reading mode select's value is `flow`;
- an `input`/`change` listener on that select updates it;
- `read()` returns `current.flowMotion` while the field is hidden.

### Flowing motion (R4–R7)

**One source of truth: anchors, not pixels.** A slide is `{ from: Anchor, to: Anchor, startedAt,
durationMs }`. An `Anchor` is either `{ word: stepIndex, at: 'mid' | 'before' | 'after' }` or a
frozen point `{ between: [Anchor, Anchor], t }`. Pixels are derived from the ribbon's current spans
on each frame, by a pure `anchorX(spans, order, anchor)` in `ribbon-geometry.ts`:

- `before` is the handover point `(mid[prev] + mid[word]) / 2`, or `mid[word]` for the window's first
  word;
- `after` is `(mid[word] + mid[next]) / 2`, or `mid[word]` for the run's last word, so the run
  settles on it (R5).

The position at time `now` is `lerp(anchorX(from), anchorX(to), clamp((now − startedAt) /
durationMs, 0, 1))`, a pure `slideX` in `ribbon-geometry.ts`. Window rebuilds (`showFlow`,
`stage.ts:260-284`) and relayouts (`stage.ts:287-292`) only remeasure spans. The slide re-derives its
pixels from the same anchors, so it needs no re-anchoring code and makes no backward jump.

**Frame loop.** While a slide is live, a loop on `ctx.frame` (`context.ts:24`, the dial's frame source,
faked by `testing/reader.ts:75-84, 119-126`) writes `--sr-x = slideX(...)` with `--sr-glide: 0ms` and
calls `markBracket` on each frame. It stops when the slide reaches `to`, or when the slide is
cancelled. `placeRibbon` keeps the glide path for Word by word and for the cases below that say
"placed".

**Which step starts which motion.** The stage is in Flowing when `player.settings.flowMotion ===
'flowing'` and reduced motion is not requested (`reducedMotion()`, `stage.ts:228`). Under reduced
motion, Flowing behaves exactly like Word by word (R7). For a step event at index `i` while the player
is `playing`:

- **Continuation**: `i` is the word after `r.index` in the run's order, with `item-gap` steps skipped
  (see below). The slide is `from: {i, before}` (or the frozen point after a resume, below), `to:
  {i, after}`, over the step's `durationMs`. A word whose next step is an inline stop or dwell has
  `to: {i, mid}` (R5).
- **Item gap** (`item-gap`, timed, `pacing.ts:49-50`; `showStep` ignores it today, `stage.ts:419`):
  in Flowing the stage handles it. It slides `from: {prev, after}` to `{next, before}` over the gap's
  `durationMs`, crossing the `•` separator. `prev` and `next` are the chunks on either side of it.
- **Inline stop or dwell** (`showInlineStop`, `stage.ts:404-410`): the previous word's slide has
  already ended on the chip's middle. The stop cancels any slide and places `{chip, mid}`, which is
  then a no-op, with no back-glide. The stop holds for its whole time; a dwell's timed duration is not
  a slide.
- **Resume**: `i === r.index` after a pause. The slide runs from the frozen point to the same `to`
  over the re-shown step's `durationMs` (`player.ts:351-355`).
- **Jump**: any other index while playing (Left/Right, N/P, an outline entry, `player.ts:364-369`).
  The stage places `{i, mid}` at once, with no glide, then slides `from: {i, mid}` to `{i, after}`
  over the step's `durationMs`.
- **Not playing, or `durationMs: null` without speech** (a scrub, `player.ts:245-262`; a seek while
  paused; a card): the stage cancels any slide and places with `placeRibbon`, with today's glide.
- **Pause or stop** (`player.on('state')`, `player.ts:429-440`): the stage cancels the frame loop and
  freezes `x` as `{between: [from, to], t}` at the current progress.

**Speech (R6).** While the player speaks, every step comes with `durationMs: null`. The sentence's
first word comes from `show()` (`player.ts:310-342`) and later words from `showSpoken`
(`player.ts:198-208`). With `playing`, `player.settings.tts.enabled`, and a chunk step:

- a continuation, or the sentence's first word, slides from the current position (frozen or live,
  re-anchored as a frozen point) to `{i, after}` over `spokenWordMs(wpm)`;
- `spokenWordMs(wpm) = 60000 / (180 × speechRate(wpm))` is a new export of `tts.ts`, the same
  constant the estimated boundaries use (`tts.ts:282-283, 308-315`), so ribbon and voice run at one
  pace;
- an early boundary starts a new slide from wherever the ribbon is;
- a slide that ends before the next boundary holds at `to` until that boundary (an unavoidable wait
  on a slow voice);
- a jump while speaking is handled as a jump, above;
- `showWhole` (no boundaries) holds with the braces hidden, as today.

### Docs

`README.md` gets these changes:

- the flow section (`README.md:80-91`) describes the red first letter of words inside the bracket,
  replacing "no letter is coloured red" (`:88`);
- it describes the Flow motion choice, with Flowing as the default, and how it behaves on pause, at
  stops, when scrubbing, with speech and under reduced motion;
- the Settings table (`:166-170`) gets a row: "Flow motion | Flowing | Word by word or Flowing
  (`speedRead.flowMotion` in VS Code)".

### Acceptance matrix

There are two new rows, `reader-flow-first-letter` and `reader-flowing-motion`, and two amendments of
merged rows:

- `reader-focus-span`: its "no letter of the current word is red" becomes the first-letter rule;
- `reader-snake-flow`: "words glide one at a time" becomes "words flow continuously, or one at a time
  with a glide".

### Test surface

**Existing tests that change.** `flowOpts` in `stage.test.ts:88` gains `flowMotion: 'word'`. That
keeps the word-mode placement tests (`stage.test.ts:170-221`, which check `--sr-x` on `mid`, and the
window test `:223-241`) as they are. Rewritten rather than pinned, because R1 now makes the current
word's first letter red:

- `stage.test.ts:110-122` ("colours no letter of the current word") becomes "only `.sr-w-first` of
  in-bracket words is marked";
- `tests/e2e/core.spec.ts:250-256, 311-316, 1276-1278` (every element inside the current word has the
  row's colour) assert instead that only the first letter is red.

Pinned to `flowMotion: 'word'` through the demo's settings, because they check that the middle letter
is within 1 px of the centre after a pause:

- `tests/e2e/core.spec.ts:303, 363`;
- `tests/e2e/extension.spec.ts:886-910`;
- the flow cases in `tests/e2e/webview.spec.ts` and `tts-panel.test.ts`.

Harness and demo flow tests that do not pin a motion now run Flowing.

New unit tests:

- `settings.test.ts`: `flowMotion` default and normalization.
- `config.test.ts` / `manifest.test.ts`: the `speedRead.flowMotion` contribution and its round trip.
- `ribbon-geometry.test.ts`: `firstLetter` on punctuation, digits, chips and letterless words;
  `inBracket` at the bracket's edges; `anchorX` at a window's and a run's ends and for a frozen point;
  `slideX` clamping.
- `mount` / `player` tests: changing `flowMotion` neither rebuilds the timeline nor moves the
  position, and it is saved.
- `stage.test.ts`, with the fake frame source and clock:
  - `.sr-w-first` exists only on the middle row;
  - `data-in` follows the bracket in Word by word;
  - in Flowing, a word is marked on the frame its edge enters the bracket and unmarked on the frame
    its last edge leaves;
  - `--sr-x` rises monotonically within a step and across steps, including across an item gap, without
    holding;
  - a word before an inline stop ends on its middle, and the stop holds without a back-glide;
  - pause freezes and resume continues from the frozen point;
  - a scrub glides word by word;
  - a jump while playing, with speech off and with speech on, moves straight to the reached word, then
    flows;
  - with speech on, boundaries start slides at `spokenWordMs`, and an early boundary retargets;
  - a Flowing run past `RUN_EDGE` crosses the window rebuild with no backward step in `--sr-x`;
  - reduced motion places without a slide;
  - switching motion while playing takes effect at once;
  - a focus-span change and a relayout while paused re-mark the bracket.
- `settings-panel.test.ts`: the Flow motion field is hidden in chunk mode and shown on switching to
  flow, its value round-trips, and the stored value is kept while it is hidden.

Playwright on the bottom-stage demo (`tests/e2e/core.spec.ts`):

- a word's first letter is red while it overlaps the bracket, and not after it leaves;
- in Flowing, the line's transform changes between two samples taken within one word's time;
- in Word by word, it holds;
- the Flow motion field is visible in flow mode and hidden in chunk mode;
- screenshots for the PR.

## Verification

strategy: none
gate: developer

- reader-flow-first-letter: none — unit tests on the overlap rule and the marks in both motions, plus Playwright checking the red first letter on the bottom-stage demo with PR screenshots, verify it before merge.
- reader-flowing-motion: none — unit tests with a fake clock and frame source on slide, gap, inline stop, pause, jump, scrub, speech, window rebuild and reduced motion, plus Playwright sampling the ribbon's movement within one word, verify it before merge.

## Test Plan

No post-merge operator steps are required. Every requirement is covered before merge by the tests
listed under "Test surface" in `## Design`.

## Out of scope

Chunk mode; the bracket's width and the focus-span setting; the ribbon's layout, run windows and
cards; WPM controls; new keyboard shortcuts.

## Implementation Plans

| Plan | Repo | File | Depends on |
|------|------|------|------------|
| 2026-11-22-flow-first-letter-and-flowing | `derio-labs/speed-read-fr` | `2026-11-22-flow-first-letter-and-flowing` | — |
