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
