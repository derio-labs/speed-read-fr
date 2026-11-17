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

<!-- fr:journal kind=review scope=spec id=spec-review-1 created=2026-11-17T15:27:41+00:00 -->
### spec-review-1 · review · Independent spec review: 16 findings, all in scope; decisions honoured

Checked R1..R26 and Design 1-12 against docs/brief.md and decisions d1..d9 (all honoured), against Chrome/Firefox MV3, scripting.executeScript, shadow-DOM slots and cloneNode, the VS Code webview CSP, markdown-it line maps, texmath/KaTeX output, Mermaid rendering and Web Speech boundary events, and against the container toolchain (Chromium present, no Firefox, no VS Code). Verification rows and Test Plan heading matched. Findings raised: sr-r1 to sr-r16.

<!-- fr:journal kind=review scope=spec id=spec-review-2 created=2026-11-17T15:27:41+00:00 -->
### spec-review-2 · review · Second independent spec review of the revised spec: 14 findings, all in scope

By the fr-spec-reviewer agent on the spec as revised for sr-r1..sr-r16. Twelve of the sixteen earlier fixes confirmed present and correct; sr-r2, sr-r7, sr-r9 and sr-r15 were half-done. Verification rows, Test Plan heading, tester gate and section 11 feasibility checked and passed. Findings raised: sr2-r1 to sr2-r14.

<!-- fr:journal kind=finding scope=spec id=sr-r1 created=2026-11-17T15:27:41+00:00 state=open review_scope=in -->
### sr-r1 · finding [open] (reviewer: in scope) · Exhibit contract between core and host cannot deliver slotted light-DOM clones

Raised by the spec reviewer against the spec as first written; in scope because the spec itself was wrong or incomplete on this point.

<!-- fr:journal kind=finding scope=spec id=sr-r2 created=2026-11-17T15:27:41+00:00 state=open review_scope=in -->
### sr-r2 · finding [open] (reviewer: in scope) · Slotted clones do not keep the page's styling as R16 promises

Raised by the spec reviewer against the spec as first written; in scope because the spec itself was wrong or incomplete on this point.

<!-- fr:journal kind=finding scope=spec id=sr-r3 created=2026-11-17T15:27:41+00:00 state=open review_scope=in -->
### sr-r3 · finding [open] (reviewer: in scope) · cloneNode loses canvas pixels, shadow-root content and iframe state

Raised by the spec reviewer against the spec as first written; in scope because the spec itself was wrong or incomplete on this point.

<!-- fr:journal kind=finding scope=spec id=sr-r4 created=2026-11-17T15:27:41+00:00 state=open review_scope=in -->
### sr-r4 · finding [open] (reviewer: in scope) · How atomic inline math and code show on the stage is undefined

Raised by the spec reviewer against the spec as first written; in scope because the spec itself was wrong or incomplete on this point.

<!-- fr:journal kind=finding scope=spec id=sr-r5 created=2026-11-17T15:27:41+00:00 state=open review_scope=in -->
### sr-r5 · finding [open] (reviewer: in scope) · The VS Code webview CSP as written blocks KaTeX, Mermaid and the core's own styles

Raised by the spec reviewer against the spec as first written; in scope because the spec itself was wrong or incomplete on this point.

<!-- fr:journal kind=finding scope=spec id=sr-r6 created=2026-11-17T15:27:41+00:00 state=open review_scope=in -->
### sr-r6 · finding [open] (reviewer: in scope) · Mermaid cannot lay out diagrams rendered into a detached container

Raised by the spec reviewer against the spec as first written; in scope because the spec itself was wrong or incomplete on this point.

<!-- fr:journal kind=finding scope=spec id=sr-r7 created=2026-11-17T15:27:41+00:00 state=open review_scope=in -->
### sr-r7 · finding [open] (reviewer: in scope) · R21 promises line-accurate cursor follow, but data-line only gives a block's first line

Raised by the spec reviewer against the spec as first written; in scope because the spec itself was wrong or incomplete on this point.

<!-- fr:journal kind=finding scope=spec id=sr-r8 created=2026-11-17T15:27:41+00:00 state=open review_scope=in -->
### sr-r8 · finding [open] (reviewer: in scope) · Inject reader.js once per tab breaks with an ephemeral MV3 background

Raised by the spec reviewer against the spec as first written; in scope because the spec itself was wrong or incomplete on this point.

<!-- fr:journal kind=finding scope=spec id=sr-r9 created=2026-11-17T15:27:41+00:00 state=open review_scope=in -->
### sr-r9 · finding [open] (reviewer: in scope) · Firefox MV3 specifics missing

Raised by the spec reviewer against the spec as first written; in scope because the spec itself was wrong or incomplete on this point.

<!-- fr:journal kind=finding scope=spec id=sr-r10 created=2026-11-17T15:27:41+00:00 state=open review_scope=in -->
### sr-r10 · finding [open] (reviewer: in scope) · Alt-hover click collides with browser and OS Alt+click behaviour

Raised by the spec reviewer against the spec as first written; in scope because the spec itself was wrong or incomplete on this point.

<!-- fr:journal kind=finding scope=spec id=sr-r11 created=2026-11-17T15:27:41+00:00 state=open review_scope=in -->
### sr-r11 · finding [open] (reviewer: in scope) · Reader key handling conflicts with Tab focus trap and settings form controls

Raised by the spec reviewer against the spec as first written; in scope because the spec itself was wrong or incomplete on this point.

<!-- fr:journal kind=finding scope=spec id=sr-r12 created=2026-11-17T15:27:41+00:00 state=open review_scope=in -->
### sr-r12 · finding [open] (reviewer: in scope) · Pre-merge suite cannot exercise the real toolbar, context menu or shortcut

Raised by the spec reviewer against the spec as first written; in scope because the spec itself was wrong or incomplete on this point.

<!-- fr:journal kind=finding scope=spec id=sr-r13 created=2026-11-17T15:27:41+00:00 state=open review_scope=in -->
### sr-r13 · finding [open] (reviewer: in scope) · Packaging the .vsix from an npm-workspaces repo needs stated vsce handling

Raised by the spec reviewer against the spec as first written; in scope because the spec itself was wrong or incomplete on this point.

<!-- fr:journal kind=finding scope=spec id=sr-r14 created=2026-11-17T15:27:41+00:00 state=open review_scope=in -->
### sr-r14 · finding [open] (reviewer: in scope) · TTS voice rules contradict each other, and the boundary fallback can desync

Raised by the spec reviewer against the spec as first written; in scope because the spec itself was wrong or incomplete on this point.

<!-- fr:journal kind=finding scope=spec id=sr-r15 created=2026-11-17T15:27:41+00:00 state=open review_scope=in -->
### sr-r15 · finding [open] (reviewer: in scope) · Acceptance rows: R15 cited without behaviour; R23, R25 and R1 have no row

Raised by the spec reviewer against the spec as first written; in scope because the spec itself was wrong or incomplete on this point.

<!-- fr:journal kind=finding scope=spec id=sr-r16 created=2026-11-17T15:27:41+00:00 state=open review_scope=in -->
### sr-r16 · finding [open] (reviewer: in scope) · Webview Markdown rendering does not state HTML or Mermaid hardening

Raised by the spec reviewer against the spec as first written; in scope because the spec itself was wrong or incomplete on this point.

<!-- fr:journal kind=finding scope=spec id=sr2-r1 created=2026-11-17T15:27:41+00:00 state=open review_scope=in -->
### sr2-r1 · finding [open] (reviewer: in scope) · Storage bullet contradicted the API shim

Raised by the second spec review; in scope because the revised spec was wrong or incomplete on this point.

<!-- fr:journal kind=finding scope=spec id=sr2-r2 created=2026-11-17T15:27:41+00:00 state=open review_scope=in -->
### sr2-r2 · finding [open] (reviewer: in scope) · Firefox permission flow lost the user gesture

Raised by the second spec review; in scope because the revised spec was wrong or incomplete on this point.

<!-- fr:journal kind=finding scope=spec id=sr2-r3 created=2026-11-17T15:27:41+00:00 state=open review_scope=in -->
### sr2-r3 · finding [open] (reviewer: in scope) · Test Plan asked a temporary add-on to survive a restart

Raised by the second spec review; in scope because the revised spec was wrong or incomplete on this point.

<!-- fr:journal kind=finding scope=spec id=sr2-r4 created=2026-11-17T15:27:41+00:00 state=open review_scope=in -->
### sr2-r4 · finding [open] (reviewer: in scope) · TTS off by default was not a requirement

Raised by the second spec review; in scope because the revised spec was wrong or incomplete on this point.

<!-- fr:journal kind=finding scope=spec id=sr2-r5 created=2026-11-17T15:27:41+00:00 state=open review_scope=in -->
### sr2-r5 · finding [open] (reviewer: in scope) · Dwell defaults were missing

Raised by the second spec review; in scope because the revised spec was wrong or incomplete on this point.

<!-- fr:journal kind=finding scope=spec id=sr2-r6 created=2026-11-17T15:27:41+00:00 state=open review_scope=in -->
### sr2-r6 · finding [open] (reviewer: in scope) · Ramp trigger was ambiguous

Raised by the second spec review; in scope because the revised spec was wrong or incomplete on this point.

<!-- fr:journal kind=finding scope=spec id=sr2-r7 created=2026-11-17T15:27:41+00:00 state=open review_scope=in -->
### sr2-r7 · finding [open] (reviewer: in scope) · Alt-hover click had no route to inject the reader

Raised by the second spec review; in scope because the revised spec was wrong or incomplete on this point.

<!-- fr:journal kind=finding scope=spec id=sr2-r8 created=2026-11-17T15:27:41+00:00 state=open review_scope=in -->
### sr2-r8 · finding [open] (reviewer: in scope) · browser-entry-points still cited R15

Raised by the second spec review; in scope because the revised spec was wrong or incomplete on this point.

<!-- fr:journal kind=finding scope=spec id=sr2-r9 created=2026-11-17T15:27:41+00:00 state=open review_scope=in -->
### sr2-r9 · finding [open] (reviewer: in scope) · New rows used a different origin form

Raised by the second spec review; in scope because the revised spec was wrong or incomplete on this point.

<!-- fr:journal kind=finding scope=spec id=sr2-r10 created=2026-11-17T15:27:41+00:00 state=open review_scope=in -->
### sr2-r10 · finding [open] (reviewer: in scope) · vscode-cursor-follows row promised line accuracy

Raised by the second spec review; in scope because the revised spec was wrong or incomplete on this point.

<!-- fr:journal kind=finding scope=spec id=sr2-r11 created=2026-11-17T15:27:41+00:00 state=open review_scope=in -->
### sr2-r11 · finding [open] (reviewer: in scope) · Verification overclaimed for install-docs and ci-builds-packages

Raised by the second spec review; in scope because the revised spec was wrong or incomplete on this point.

<!-- fr:journal kind=finding scope=spec id=sr2-r12 created=2026-11-17T15:27:41+00:00 state=open review_scope=in -->
### sr2-r12 · finding [open] (reviewer: in scope) · CodeLens range undefined

Raised by the second spec review; in scope because the revised spec was wrong or incomplete on this point.

<!-- fr:journal kind=finding scope=spec id=sr2-r13 created=2026-11-17T15:27:41+00:00 state=open review_scope=in -->
### sr2-r13 · finding [open] (reviewer: in scope) · Page CSS could reach the reader through the host element

Raised by the second spec review; in scope because the revised spec was wrong or incomplete on this point.

<!-- fr:journal kind=finding scope=spec id=sr2-r14 created=2026-11-17T15:27:41+00:00 state=open review_scope=in -->
### sr2-r14 · finding [open] (reviewer: in scope) · adoptedStyleSheets may be ignored in a Firefox content script

Raised by the second spec review; in scope because the revised spec was wrong or incomplete on this point.

<!-- fr:journal kind=lens scope=spec id=lens-tests-1 created=2026-11-17T15:27:41+00:00 lens=tests step=spec-review -->
### lens-tests-1 · lens · Suggested by the spec reviewer: entry-point proof is split across unit, browser-level and live; check each requirement has a real test

<!-- fr:journal kind=finding scope=spec id=sr-r1-resolved created=2026-11-17T15:27:41+00:00 state=fixed resolves=sr-r1 -->
### sr-r1-resolved · finding [fixed] · resolves sr-r1: Exhibit contract between core and host cannot deliver slotted light-DOM clones

Section 6 now defines exhibit(block, use), document() with locate/refAt, and release(); the host owns cloning and the browser returns a slot.

<!-- fr:journal kind=finding scope=spec id=sr-r2-resolved created=2026-11-17T15:27:41+00:00 state=fixed resolves=sr-r2 -->
### sr-r2-resolved · finding [fixed] · resolves sr-r2: Slotted clones do not keep the page's styling as R16 promises

Host appended to body; wrappers up to body; inherited computed properties and background copied onto the outer wrapper; R16 reworded to stylesheet rules applying, with limits listed.

<!-- fr:journal kind=finding scope=spec id=sr-r3-resolved created=2026-11-17T15:27:41+00:00 state=fixed resolves=sr-r3 -->
### sr-r3-resolved · finding [fixed] · resolves sr-r3: cloneNode loses canvas pixels, shadow-root content and iframe state

Canvas replaced by an image of its pixels with a placeholder fallback; shadow-root elements and iframe/video/audio/object/embed become placeholders; extraction skips embedded media.

<!-- fr:journal kind=finding scope=spec id=sr-r4-resolved created=2026-11-17T15:27:41+00:00 state=fixed resolves=sr-r4 -->
### sr-r4-resolved · finding [fixed] · resolves sr-r4: How atomic inline math and code show on the stage is undefined

Token type now carries text; math text comes from the TeX annotation, aria-label or MathML, never raw textContent; shown monospace; TTS omits math atoms.

<!-- fr:journal kind=finding scope=spec id=sr-r5-resolved created=2026-11-17T15:27:41+00:00 state=fixed resolves=sr-r5 -->
### sr-r5-resolved · finding [fixed] · resolves sr-r5: The VS Code webview CSP as written blocks KaTeX, Mermaid and the core's own styles

Exact CSP written with webview.cspSource, style 'unsafe-inline', font and img sources, localResourceRoots; core styles use adoptedStyleSheets.

<!-- fr:journal kind=finding scope=spec id=sr-r6-resolved created=2026-11-17T15:27:41+00:00 state=fixed resolves=sr-r6 -->
### sr-r6-resolved · finding [fixed] · resolves sr-r6: Mermaid cannot lay out diagrams rendered into a detached container

Rendering happens in an attached hidden container with mermaid.render per fence, awaited before extraction; strict security level.

<!-- fr:journal kind=finding scope=spec id=sr-r7-resolved created=2026-11-17T15:27:41+00:00 state=fixed resolves=sr-r7 -->
### sr-r7-resolved · finding [fixed] · resolves sr-r7: R21 promises line-accurate cursor follow, but data-line only gives a block's first line

R21 weakened to block granularity; the markdown-it rule that writes data-line and the tokens that get it are named.

<!-- fr:journal kind=finding scope=spec id=sr-r8-resolved created=2026-11-17T15:27:41+00:00 state=fixed resolves=sr-r8 -->
### sr-r8-resolved · finding [fixed] · resolves sr-r8: Inject reader.js once per tab breaks with an ephemeral MV3 background

Background keeps no per-tab state; it injects every time and reader.js guards itself.

<!-- fr:journal kind=finding scope=spec id=sr-r9-resolved created=2026-11-17T15:27:41+00:00 state=fixed resolves=sr-r9 -->
### sr-r9-resolved · finding [fixed] · resolves sr-r9: Firefox MV3 specifics missing

gecko id, strict_min_version 128.0, permission check and request on user gesture, API shim, README note.

<!-- fr:journal kind=finding scope=spec id=sr-r10-resolved created=2026-11-17T15:27:41+00:00 state=fixed resolves=sr-r10 -->
### sr-r10-resolved · finding [fixed] · resolves sr-r10: Alt-hover click collides with browser and OS Alt+click behaviour

Capture-phase suppression of mouse events only while Alt is held and a block is outlined; Alt keyup default prevented; Linux window-manager limit listed.

<!-- fr:journal kind=finding scope=spec id=sr-r11-resolved created=2026-11-17T15:27:41+00:00 state=fixed resolves=sr-r11 -->
### sr-r11-resolved · finding [fixed] · resolves sr-r11: Reader key handling conflicts with Tab focus trap and settings form controls

Shortcuts act only with focus on the reader root or stage; inside the settings panel and form controls keys belong to the controls.

<!-- fr:journal kind=finding scope=spec id=sr-r12-resolved created=2026-11-17T15:27:41+00:00 state=fixed resolves=sr-r12 -->
### sr-r12-resolved · finding [fixed] · resolves sr-r12: Pre-merge suite cannot exercise the real toolbar, context menu or shortcut

Section 11 states the Playwright constraints and what the suite proves; browser-entry-points narrowed; new live row chrome-entry-points-in-browser and a Chrome Test Plan step.

<!-- fr:journal kind=finding scope=spec id=sr-r13-resolved created=2026-11-17T15:27:41+00:00 state=fixed resolves=sr-r13 -->
### sr-r13-resolved · finding [fixed] · resolves sr-r13: Packaging the .vsix from an npm-workspaces repo needs stated vsce handling

Section 12 specifies full esbuild bundling, vsce package --no-dependencies, .vscodeignore, package.json fields and per-package LICENSE.

<!-- fr:journal kind=finding scope=spec id=sr-r14-resolved created=2026-11-17T15:27:41+00:00 state=fixed resolves=sr-r14 -->
### sr-r14-resolved · finding [fixed] · resolves sr-r14: TTS voice rules contradict each other, and the boundary fallback can desync

Voices read on voiceschanged with a timeout; network voice only by explicit choice; boundary-less fallback shows the whole sentence until end.

<!-- fr:journal kind=finding scope=spec id=sr-r15-resolved created=2026-11-17T15:27:41+00:00 state=fixed resolves=sr-r15 -->
### sr-r15-resolved · finding [fixed] · resolves sr-r15: Acceptance rows: R15 cited without behaviour; R23, R25 and R1 have no row

Added rows browser-generic-main-content, install-docs and ci-builds-packages; browser-entry-points no longer claims container behaviour; Verification says why R1, R24, R26 have none.

<!-- fr:journal kind=finding scope=spec id=sr-r16-resolved created=2026-11-17T15:27:41+00:00 state=fixed resolves=sr-r16 -->
### sr-r16-resolved · finding [fixed] · resolves sr-r16: Webview Markdown rendering does not state HTML or Mermaid hardening

html false, linkify false, Mermaid strict, UI writes text with textContent only.

<!-- fr:journal kind=finding scope=spec id=sr2-r1-resolved created=2026-11-17T15:27:41+00:00 state=fixed resolves=sr2-r1 -->
### sr2-r1-resolved · finding [fixed] · resolves sr2-r1: Storage bullet contradicted the API shim

Storage bullet now says storage.local through the shim.

<!-- fr:journal kind=finding scope=spec id=sr2-r2-resolved created=2026-11-17T15:27:41+00:00 state=fixed resolves=sr2-r2 -->
### sr2-r2-resolved · finding [fixed] · resolves sr2-r2: Firefox permission flow lost the user gesture

permissions.request is the handler's first statement with nothing awaited; behaviour when host access is withheld is stated for both browsers.

<!-- fr:journal kind=finding scope=spec id=sr2-r3-resolved created=2026-11-17T15:27:41+00:00 state=fixed resolves=sr2-r3 -->
### sr2-r3-resolved · finding [fixed] · resolves sr2-r3: Test Plan asked a temporary add-on to survive a restart

Step now checks persistence across an add-on and tab reload.

<!-- fr:journal kind=finding scope=spec id=sr2-r4-resolved created=2026-11-17T15:27:41+00:00 state=fixed resolves=sr2-r4 -->
### sr2-r4-resolved · finding [fixed] · resolves sr2-r4: TTS off by default was not a requirement

R12 and section 9 state it.

<!-- fr:journal kind=finding scope=spec id=sr2-r5-resolved created=2026-11-17T15:27:41+00:00 state=fixed resolves=sr2-r5 -->
### sr2-r5-resolved · finding [fixed] · resolves sr2-r5: Dwell defaults were missing

R12 and section 4 give 3 s for images and diagrams (shared) and 5 s for dwell-mode code, tables and math.

<!-- fr:journal kind=finding scope=spec id=sr2-r6-resolved created=2026-11-17T15:27:41+00:00 state=fixed resolves=sr2-r6 -->
### sr2-r6-resolved · finding [fixed] · resolves sr2-r6: Ramp trigger was ambiguous

Section 4 lists exactly which events restart the ramp and which steps do not.

<!-- fr:journal kind=finding scope=spec id=sr2-r7-resolved created=2026-11-17T15:27:41+00:00 state=fixed resolves=sr2-r7 -->
### sr2-r7-resolved · finding [fixed] · resolves sr2-r7: Alt-hover click had no route to inject the reader

Content script messages the background, which injects into sender.tab.id.

<!-- fr:journal kind=finding scope=spec id=sr2-r8-resolved created=2026-11-17T15:27:41+00:00 state=fixed resolves=sr2-r8 -->
### sr2-r8-resolved · finding [fixed] · resolves sr2-r8: browser-entry-points still cited R15

Row amended to cite R13 only.

<!-- fr:journal kind=finding scope=spec id=sr2-r9-resolved created=2026-11-17T15:27:41+00:00 state=fixed resolves=sr2-r9 -->
### sr2-r9-resolved · finding [fixed] · resolves sr2-r9: New rows used a different origin form

New rows now use spec:<slug>#R<n>.

<!-- fr:journal kind=finding scope=spec id=sr2-r10-resolved created=2026-11-17T15:27:41+00:00 state=fixed resolves=sr2-r10 -->
### sr2-r10-resolved · finding [fixed] · resolves sr2-r10: vscode-cursor-follows row promised line accuracy

Row reworded to block granularity.

<!-- fr:journal kind=finding scope=spec id=sr2-r11-resolved created=2026-11-17T15:27:41+00:00 state=fixed resolves=sr2-r11 -->
### sr2-r11-resolved · finding [fixed] · resolves sr2-r11: Verification overclaimed for install-docs and ci-builds-packages

Verification states how those two rows are checked on the pull request.

<!-- fr:journal kind=finding scope=spec id=sr2-r12-resolved created=2026-11-17T15:27:41+00:00 state=fixed resolves=sr2-r12 -->
### sr2-r12-resolved · finding [fixed] · resolves sr2-r12: CodeLens range undefined

Section 8 gives the source range of every command, including readSection.

<!-- fr:journal kind=finding scope=spec id=sr2-r13-resolved created=2026-11-17T15:27:41+00:00 state=fixed resolves=sr2-r13 -->
### sr2-r13-resolved · finding [fixed] · resolves sr2-r13: Page CSS could reach the reader through the host element

Host carries all: initial plus explicit layout properties; hostile-style test page required.

<!-- fr:journal kind=finding scope=spec id=sr2-r14-resolved created=2026-11-17T15:27:41+00:00 state=fixed resolves=sr2-r14 -->
### sr2-r14-resolved · finding [fixed] · resolves sr2-r14: adoptedStyleSheets may be ignored in a Firefox content script

mountReader probes a sentinel after adopting and falls back to a style element.

<!-- fr:journal kind=decision scope=spec id=exit-baseline created=2026-11-17T15:27:42+00:00 -->
### exit-baseline · decision · exit when spec-review resolved

The exit when spec-review resolved; `fr verification set` and `deliver` compare against it.

```yaml
row_gates:
  browser-alt-hover: none
  browser-entry-points: none
  browser-exhibits-page-styled: none
  browser-generic-main-content: none
  browser-overlay-and-dock: none
  chat-site-adapters: tester
  chrome-entry-points-in-browser: tester
  chrome-firefox-one-codebase: none
  ci-builds-packages: none
  firefox-extension-runs: tester
  heading-chapter-stops: none
  install-docs: none
  list-item-reading: none
  non-prose-never-streamed: none
  offline-no-network: none
  prose-chunk-pacing: none
  reader-keys: none
  reader-settings: none
  reader-three-zone-ui: none
  structure-extraction: none
  tts-speaks-in-sync: tester
  tts-voices-offline-labels: none
  vscode-cursor-follows: none
  vscode-entry-points: none
  vscode-extension-in-host: tester
  vscode-webview-renders: none
row_kinds:
  browser-alt-hover: none
  browser-entry-points: none
  browser-exhibits-page-styled: none
  browser-generic-main-content: none
  browser-overlay-and-dock: none
  chat-site-adapters: live
  chrome-entry-points-in-browser: live
  chrome-firefox-one-codebase: none
  ci-builds-packages: none
  firefox-extension-runs: live
  heading-chapter-stops: none
  install-docs: none
  list-item-reading: none
  non-prose-never-streamed: none
  offline-no-network: none
  prose-chunk-pacing: none
  reader-keys: none
  reader-settings: none
  reader-three-zone-ui: none
  structure-extraction: none
  tts-speaks-in-sync: live
  tts-voices-offline-labels: none
  vscode-cursor-follows: none
  vscode-entry-points: none
  vscode-extension-in-host: live
  vscode-webview-renders: none
run_gate: tester
run_kind: none
```

<!-- fr:journal kind=decision scope=spec id=phase-split-2026-11-17-structure-aware-speed-reader-p2 created=2026-11-17T15:30:45+00:00 -->
### phase-split-2026-11-17-structure-aware-speed-reader-p2 · decision · ask: structure extraction and the shared reader UI (R3, R10-R12) are their own deliverable on top of the engine

<!-- fr:journal kind=decision scope=spec id=phase-split-2026-11-17-structure-aware-speed-reader-p3 created=2026-11-17T15:30:46+00:00 -->
### phase-split-2026-11-17-structure-aware-speed-reader-p3 · decision · ask: the Chrome and Firefox extension (R13-R18) is the brief's second deliverable

<!-- fr:journal kind=decision scope=spec id=tier-2026-11-17-structure-aware-speed-reader-p3 created=2026-11-17T15:30:47+00:00 -->
### tier-2026-11-17-structure-aware-speed-reader-p3 · decision · hard: keeping page styling on slotted clones while isolating the reader, and MV3 lifecycle differences, are design judgements with no test oracle but the browser

<!-- fr:journal kind=decision scope=spec id=phase-split-2026-11-17-structure-aware-speed-reader-p4 created=2026-11-17T15:30:48+00:00 -->
### phase-split-2026-11-17-structure-aware-speed-reader-p4 · decision · ask: the VS Code extension (R19-R21) is the brief's third deliverable
