<!-- fr:journal-schema=4 -->
# Journal: 2026-11-17-structure-aware-speed-reader

<!-- fr:journal kind=discovery scope=spec id=operator-brief created=2026-11-17T15:16:30+00:00 input=true -->
### operator-brief · discovery · Operator brief: /fr-goal implement docs/brief.md

Goal as typed: `/fr-goal implement docs/brief.md`

# speed-read-fr: product brief

Input for `/fr-goal`. Decisions already taken with the operator are marked **decided**;
everything else is open for the brainstorm round.

## Problem

AI output is long, structured Markdown. Reading it line by line is slow. Plain RSVP speed
readers are worse: they flash code, formulas and tables word by word, mangle lists, drop
images, and lose all sense of where you are in the document. Nothing found on the market
(mdr, the Obsidian RSVP plugins, RocketRead, SplashReader, SPDRD, Flow) combines
structure awareness with an offline browser extension.

## Deliverables and order (decided)

1. Shared reader core (structure extraction, pacing engine, UI), host-agnostic.
2. Chrome extension and Firefox extension (one MV3 codebase, two manifests).
3. VS Code extension.

All of it works fully offline: no network calls, all libraries bundled.
herdr plugin: dropped.

Also required (decided): installation instructions for every target in the README, and
automated tests written test-first.

## Reader UX (shared by every host)

**Layout, three zones**
- Outline rail: document headings, current one highlighted, per-section progress and
  estimated time; click to jump.
- Stage: the RSVP chunk with optimal-recognition-point highlight; below it, the current
  sentence faded so you keep your place.
- Exhibit pane (right, or below when narrow): non-prose blocks of the current section,
  rendered properly. **Decided: reveal on arrival**; blocks already passed stay visible.

**Block behaviour**
- Prose: streamed in chunks; extra dwell on commas, sentence ends, long words.
- Lists: each item is its own unit with an `item 3/7` counter and a short pause between
  items; nested items indented. Lists of short items are shown whole for a dwell rather
  than streamed.
- Code, tables, math: never streamed. Playback stops with e.g. "Code, 24 lines: Space to
  continue, E to expand". Per type configurable: stop | skip | dwell N seconds.
- Images and diagrams: shown in the exhibit pane with a dwell; Mermaid rendered.
- Headings: hard stop. Chapter card with title, length and contents summary; Space
  continues. Which levels stop is configurable (default H1, H2). Speed ramps up gently
  after every stop.

**Settings (decided)**
- Speed (WPM).
- Number of words shown simultaneously (chunk size), **default: chunks, not single words**.
- Maximum total characters per chunk; a chunk ends at whichever limit is hit first.
- Heading levels that stop; per-type behaviour for code, tables, math.
- Bonus: text-to-speech via the browser's Web Speech API, chunk display synced to speech
  boundaries. Offline only with locally installed voices (OS voices; Chrome's "Google"
  voices need network): the UI should say so.

**Keys**: Space play/pause, ←/→ sentence back/forward, ↑/↓ speed, N/P next/previous
section, Tab toggles normal reading at the current position, Esc closes.

## Chrome and Firefox

- Entry points: toolbar button (selection, else main content), context menu
  ("Speed read selection", "Speed read from here"), keyboard shortcut (Alt+Shift+R).
- Hover mode: hold Alt, the block under the pointer is outlined; click reads from that
  block to the end of its container. No modifier-free hover trigger.
- AI chat adapters: on claude.ai, ChatGPT and Gemini, "container" is one assistant reply.
  Other sites: generic main-content heuristic.
- Exhibits are clones of the page's rendered DOM, so already-rendered math and diagrams
  come through as-is.
- Display: full-page overlay (page dimmed) by default; optional docked side panel.

## VS Code

- Entry points: commands (file, selection, from cursor); CodeLens "▶ Read section" above
  Markdown headings; hover on headings and paragraphs with a "▶ Speed read from here" link.
- Webview panel beside the editor, markdown-it + KaTeX + Mermaid bundled.
- The editor cursor follows the reading position, so stopping leaves you at that line.
- Known limit: extensions cannot read the Copilot or Claude Code chat panels; AI output
  must be in a file or a selection.

## Prior art worth reading

- mdr (github.com/NiloCK/mdr): TOC-first terminal RSVP with a code split pane.
- Obsidian "Speed Reader" plugins: block pauses for code, LaTeX, tables; following TOC.

<!-- fr:journal kind=decision scope=spec id=d1-scope created=2026-11-17T15:16:30+00:00 decided_by=operator -->
### d1-scope · decision · Scope: all three deliverables in one PR

Core, browser extension and VS Code extension in one run, built in that order. decider: operator (question round 1).

<!-- fr:journal kind=decision scope=spec id=d2-permissions created=2026-11-17T15:16:30+00:00 decided_by=operator -->
### d2-permissions · decision · Browser permissions: always-on content script on all sites

So Alt-hover works everywhere; accepts the all-sites install warning. decider: operator (question round 1).

<!-- fr:journal kind=decision scope=spec id=d3-chat-adapters created=2026-11-17T15:16:30+00:00 decided_by=operator -->
### d3-chat-adapters · decision · Chat adapters ship now, verified live after merge

Selectors for known markup plus generic fallback; rows on the real sites are an operator walk. decider: operator (question round 1).

<!-- fr:journal kind=decision scope=spec id=d4-tts created=2026-11-17T15:16:30+00:00 decided_by=operator -->
### d4-tts · decision · Text-to-speech built in this run, last phase, off by default

Web Speech API, synced to boundaries, local/network voice labels. decider: operator (question round 1).

<!-- fr:journal kind=decision scope=spec id=d5-defaults created=2026-11-17T15:16:30+00:00 decided_by=operator -->
### d5-defaults · decision · Pacing defaults: 300 WPM, 3 words, 20 characters

All adjustable in settings. decider: operator (question round 1).

<!-- fr:journal kind=decision scope=spec id=d6-ci created=2026-11-17T15:16:30+00:00 decided_by=operator -->
### d6-ci · decision · CI: GitHub Actions tests + build artifacts

On pull requests and pushes to main; uploads Chrome zip, Firefox zip, VS Code vsix. decider: operator (question round 1).

<!-- fr:journal kind=decision scope=spec id=d7-license created=2026-11-17T15:16:30+00:00 decided_by=operator -->
### d7-license · decision · License: MIT

Repo and packages. decider: operator (question round 1).

<!-- fr:journal kind=decision scope=spec id=d8-verification created=2026-11-17T15:16:30+00:00 decided_by=operator -->
### d8-verification · decision · Verification: suite pre-merge, live walk post-merge, tester gate

Rows only a real host can show use the live strategy; no candidate install. decider: operator (question round 1).

<!-- fr:journal kind=decision scope=spec id=d9-model-mechanical created=2026-11-17T15:16:30+00:00 decided_by=operator -->
### d9-model-mechanical · decision · Model binding mechanical tier: sonnet

old: unbound, new: sonnet, reason: unbound tier, rule: fr-goal step 1 model-per-tier question. Applied with fr models set --harness claude-code. decider: operator (question round 1).

<!-- fr:journal kind=decision scope=spec id=d9-model-standard created=2026-11-17T15:16:30+00:00 decided_by=operator -->
### d9-model-standard · decision · Model binding standard tier: opus

old: unbound, new: opus, reason: unbound tier, rule: fr-goal step 1 model-per-tier question. Applied with fr models set --harness claude-code. decider: operator (question round 1).

<!-- fr:journal kind=decision scope=spec id=d9-model-hard created=2026-11-17T15:16:30+00:00 decided_by=operator -->
### d9-model-hard · decision · Model binding hard tier: opus

old: unbound, new: opus, reason: unbound tier, rule: fr-goal step 1 model-per-tier question. Applied with fr models set --harness claude-code. decider: operator (question round 1).

<!-- fr:journal kind=lens scope=spec id=lens-security-1 created=2026-11-17T15:16:30+00:00 lens=security step=brainstorm -->
### lens-security-1 · lens · An always-on content script on all sites that clones page DOM into an injected reader
