<!-- fr:journal-schema=4 -->
# Journal: 2026-11-17-structure-aware-speed-reader

<!-- fr:journal kind=decision scope=plan id=p1-heading-step-position created=2026-11-17T15:43:15+00:00 phase=1 -->
### p1-heading-step-position · decision · Heading steps carry blockIndex -1 and a null-element source (phase 1)

The spec's `Section.heading` (kept verbatim) has no `SourceRef`, and a heading is not a
block, so `chapter` and `title` steps carry `blockIndex: -1` and `source: { element: null }`.
If cursor-follow on headings (R21) needs a source, phase 2/4 extraction must add one.

<!-- fr:journal kind=decision scope=plan id=p1-item-step-source created=2026-11-17T15:43:15+00:00 phase=1 -->
### p1-item-step-source · decision · List item steps carry the item's source, not the list block's (phase 1)

`item-chunk` and `item-gap` steps take `ListItem.source` so the VS Code cursor can sit on
the list item being read (R21 says list-item granularity); `list-whole` carries the block source.

<!-- fr:journal kind=decision scope=plan id=p1-timeline-shape created=2026-11-17T15:43:15+00:00 phase=1 -->
### p1-timeline-shape · decision · buildTimeline returns { steps, sections } with per-section firstStep and exhibits (phase 1)

`TimelineSection` holds id, title, level, words, `firstStep` and `exhibits`
(`{ blockIndex, block, revealAt }`). Every code/table/math/image/diagram block is listed;
`revealAt` is its own step index, or for a skipped one the index of the next step (the
timeline length when nothing follows). Chunk steps carry `sentenceIndex` (within the block
or item) and `sentenceStart`. The chapter card holds title, words, summary and direct
sub-headings; its estimated time is left to `sectionEstimate` in pacing.

<!-- fr:journal kind=decision scope=plan id=p1-sentence-split-details created=2026-11-17T15:43:15+00:00 phase=1 -->
### p1-sentence-split-details · decision · Sentence ends look through closing quotes/brackets; atoms never end a sentence or clause (phase 1)

A token like `"stop!"` or `(Mostly.)` ends a sentence (trailing closers are stripped before
the terminal check, leading openers before the abbreviation and single-capital check).
Abbreviations match case-sensitively. Atom tokens are never sentence or clause ends. The
clause marks are , ; : and the dashes - – —.

<!-- fr:journal kind=decision scope=plan id=p1-orp-midpoint created=2026-11-17T15:43:15+00:00 phase=1 -->
### p1-orp-midpoint · decision · ORP midpoint is floor(length / 2); a midpoint on a space picks the following word (phase 1)

`orp(text)` takes the chunk text. A word with no letters or digits pivots on its first character.

<!-- fr:journal kind=decision scope=plan id=p1-player-semantics created=2026-11-17T15:43:15+00:00 phase=1 -->
### p1-player-semantics · decision · Player choices where the spec is silent (phase 1)

- `toggle` from idle starts (from index 0 again after the end); resuming a pause replays the
  current step with a fresh ramp.
- Navigation (sentence/section/jump) while playing or stopped keeps playing from the target
  (fresh ramp, stopping again if it lands on a stop); while idle or paused it shows the target
  and leaves the player paused; while reading it only moves the position.
- `sentence(+1)` with no later sentence and `section(±1)` past either end do nothing;
  `sentence(-1)` at the first sentence replays it.
- `jumpToBlock(ref)` matches a step source by identity, the same element, or an element the
  ref's element contains (so a list's element finds its items).
- `speed` emits `settings` only when the clamped WPM changes; persisting is the host's job.
- `expand` acts only on stop/dwell steps: pauses if playing and emits a new `expand` event
  (sectionId, blockIndex, source) for the UI.
- End step: words = tokens of chunk steps plus list-whole words shown since play started;
  elapsedMs = wall time since that play started, pauses included.
- `revealedExhibits` uses a per-section high-water mark; a section becomes fully revealed only
  when playback advances out of it naturally, so jumping over a section reveals nothing in it.
- `position` is emitted when the step index changes (not on a replay of the same step).

<!-- fr:journal kind=decision scope=plan id=p1-settings-validation created=2026-11-17T15:43:15+00:00 phase=1 -->
### p1-settings-validation · decision · Settings validation fallbacks (phase 1)

Non-numeric or non-finite numbers fall back to the default (not clamped). Numbers are clamped
but not rounded. `stopLevels` keeps first-occurrence order; a non-array falls back to [1, 2].
`display` accepts overlay|dock; `tts` keeps a boolean `enabled` and a string `voiceURI`.

<!-- fr:journal kind=discovery scope=plan id=p1-toolchain created=2026-11-17T15:43:15+00:00 phase=1 -->
### p1-toolchain · discovery · Toolchain versions and tsc layout (phase 1)

typescript ^5.9, vitest ^3.2, jsdom ^26, esbuild ^0.25, @playwright/test exactly 1.63.0.
`tsc -b` builds the root `tsconfig.json`, which references `packages/core` (composite,
output under node_modules/.cache/tsc so nothing lands in the tree). Later packages add a
reference there. Test-only helpers live in `packages/core/src/testing/` (doc builders and
`fakeClock`) and are not exported from the package index.

<!-- fr:journal kind=discovery scope=plan id=no-refactor-p1-t1 created=2026-11-17T15:43:15+00:00 phase=1 -->
### no-refactor-p1-t1 · discovery · no-refactor-because P1.T1 (phase 1)

Scaffolding only (config files, one defaults module); there is no logic yet to clean.

<!-- fr:journal kind=discovery scope=plan id=no-refactor-p1-t2 created=2026-11-17T15:43:15+00:00 phase=1 -->
### no-refactor-p1-t2 · discovery · no-refactor-because P1.T2 (phase 1)

normalizeSettings already shares clampNumber/oneOf/normalizeExhibit helpers across every field; no duplication or unclear names were left to remove.

<!-- fr:journal kind=discovery scope=plan id=no-refactor-p1-t4 created=2026-11-17T15:43:15+00:00 phase=1 -->
### no-refactor-p1-t4 · discovery · no-refactor-because P1.T4 (phase 1)

buildTimeline was written with its helpers (stopPrompt, summarise, directSubheadings, sentenceParts) factored out; an unused-locals check found nothing, so the refactor step changed nothing.

<!-- fr:journal kind=discovery scope=plan id=no-refactor-p1-t5 created=2026-11-17T15:43:15+00:00 phase=1 -->
### no-refactor-p1-t5 · discovery · no-refactor-because P1.T5 (phase 1)

pacing.ts is one switch over step kinds with named constants for every factor; nothing to clean.
