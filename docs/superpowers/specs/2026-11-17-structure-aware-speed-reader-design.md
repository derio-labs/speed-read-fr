# Structure-aware speed reader: design

Source brief: `docs/brief.md`. Run: `2026-11-17-claude-exciting-cori-4x7e21`.

## Summary

A speed reader for long, structured AI output that streams prose in chunks and treats
everything else by what it is: list items are units, code, tables and math are never
streamed, images and diagrams are shown, headings are stops. One shared reader core runs
in three hosts: a Chrome extension, a Firefox extension (one MV3 codebase, two manifests)
and a VS Code extension. Everything works offline; every library is bundled.

## Decisions from the question round

| # | Decision | Answer |
|---|----------|--------|
| D1 | Scope of this run | All three deliverables in one PR, built in order: core, browser extension, VS Code extension |
| D2 | Browser permissions | Always-on content script on all sites, so Alt-hover works everywhere |
| D3 | Chat adapters | Ship with selectors for the known markup plus a generic fallback; the operator verifies on the real sites after merge |
| D4 | Text-to-speech | Built in this run, as the last phase, off by default |
| D5 | Pacing defaults | 300 WPM, 3 words per chunk, 20 characters per chunk |
| D6 | CI | GitHub Actions: tests and build on pull requests and on pushes to main, packaged extensions uploaded as workflow artifacts |
| D7 | License | MIT |
| D8 | Verification | Automated suite before merge; `live` operator walk after merge for real-host rows; tester gate |
| D9 | Model tiers | mechanical: sonnet, standard: opus, hard: opus |

## Requirements

R1. A shared reader core (document model, structure extraction, pacing engine, player, UI) has no dependency on any extension API and is used unchanged by all three hosts.
R2. Nothing makes a network request at run time: every library, font and style is bundled in the packaged extension.
R3. Structure extraction turns a rendered DOM subtree into sections (split at headings) holding typed blocks: prose, list, code, table, math, image, diagram.
R4. Prose is streamed in chunks; a chunk ends at the word limit, the character limit or the sentence end, whichever comes first; chunks ending in a comma-class mark, ending a sentence, or holding long words are shown longer.
R5. A list is read item by item with an `item i/n` counter and a short pause between items; nested items are shown indented; a list whose items are all short is shown whole for a dwell instead of streamed.
R6. Code, tables and display math are never streamed: per type the reader stops with a prompt naming the type and its size, skips it, or dwells N seconds (default: stop).
R7. Images and diagrams are shown in the exhibit pane for a dwell, then playback continues.
R8. A heading at a stop level (default H1 and H2, configurable) stops playback on a chapter card with title, length, estimated time and a contents summary; Space continues.
R9. After every stop or pause the speed ramps from a reduced rate back to the set speed over the next few chunks.
R10. The reader shows three zones: an outline rail (headings, current one highlighted, per-section progress and estimated time, click to jump), a stage (chunk with optimal-recognition-point highlight, the current sentence faded below it), and an exhibit pane that reveals each non-prose block of the current section when playback reaches it and keeps passed ones visible; the pane sits right, or below the stage when the reader is narrow.
R11. Keys: Space play/pause and continue, Left/Right previous/next sentence, Up/Down speed, N/P next/previous section, Tab toggles normal reading at the current position, E expands the current exhibit, Esc closes.
R12. Settings: speed in WPM, words per chunk, maximum characters per chunk, heading levels that stop, behaviour per type for code, tables and math (stop, skip, or dwell with seconds), image dwell seconds, display mode, and text-to-speech; defaults are 300 WPM, 3 words, 20 characters; settings persist per host.
R13. Browser entry points: the toolbar button reads the selection, else the main content; context-menu items "Speed read selection" and "Speed read from here"; the shortcut Alt+Shift+R does what the toolbar button does.
R14. Browser hover mode: while Alt is held the block under the pointer is outlined, and a click reads from that block to the end of its container; without Alt nothing is outlined or intercepted.
R15. On claude.ai, ChatGPT and Gemini the container is one assistant reply; on any other site, and when no reply matches, the container comes from a generic main-content heuristic.
R16. Browser exhibits and the normal-reading view are clones of the page's rendered DOM, displayed with the page's own styling, so rendered math, highlighted code and diagrams appear as they do on the page.
R17. The browser reader opens as a full-page overlay over a dimmed page by default; a setting docks it as a side panel beside the page instead.
R18. The Chrome build and the Firefox build come from one source tree with one manifest each, both Manifest V3.
R19. VS Code entry points: commands to read the file, the selection, and from the cursor; a CodeLens "▶ Read section" above each Markdown heading; a hover on Markdown headings and paragraphs with a "▶ Speed read from here" link.
R20. The VS Code reader is a webview panel beside the editor that renders Markdown with bundled markdown-it, KaTeX and Mermaid, including `$…$`, `$$…$$`, `\(…\)` and `\[…\]` math and `mermaid` fenced blocks.
R21. In VS Code the editor cursor follows the reading position, so closing or pausing the reader leaves the cursor on the line being read.
R22. Text-to-speech uses the Web Speech API; while it speaks, the displayed chunk follows the speech word boundaries; only locally installed voices are selected by default, each voice is marked local or network, and the UI states that offline speech needs a local voice.
R23. The README has installation and usage instructions for Chrome, Firefox and VS Code, the keys, the settings, and the known limits.
R24. Automated tests are written test-first and cover the core, the DOM extraction, the UI, the browser extension loaded in Chromium, and the VS Code extension's providers and webview.
R25. CI runs the tests and the build on every pull request and on pushes to main, and uploads the Chrome package, the Firefox package and the VS Code `.vsix`.
R26. The repository and every package carry the MIT license.

## Design

### 1. Repository layout

npm workspaces, TypeScript (strict), esbuild for bundling, Vitest for unit tests,
Playwright (the Chromium already in the environment) for browser-level tests. No UI
framework: the UI is plain DOM built by small functions, which keeps the content script
small and avoids a runtime dependency in three hosts.

```
package.json                  workspaces, scripts: build, test, test:e2e, typecheck, package
tsconfig.base.json
LICENSE                       MIT
.github/workflows/ci.yml
packages/
  core/                       @speed-read/core (private workspace package)
    src/model.ts              document model types
    src/extract/              DOM subtree -> Doc
    src/text/                 sentence split, chunking, ORP
    src/timeline.ts           Doc + settings -> ordered steps
    src/pacing.ts             step durations, ramp
    src/player.ts             state machine over the timeline
    src/settings.ts           schema, defaults, validation
    src/tts.ts                speech driver
    src/ui/                   mountReader(), zones, cards, settings panel, styles
    src/index.ts
  browser-extension/
    src/background.ts         toolbar, context menu, command; injects the reader
    src/content.ts            always-on, small: Alt-hover, last context-menu target
    src/reader-entry.ts       injected on demand: resolve container, mount overlay
    src/adapters/             site table + generic main-content heuristic
    manifest.chrome.json
    manifest.firefox.json
    build.mjs                 -> dist/chrome, dist/firefox, and zips
  vscode-extension/
    src/extension.ts          commands, CodeLens, hover, panel, cursor follow
    src/webview/main.ts       markdown -> DOM -> core reader
    package.json              contributes: commands, configuration, keybinding
    build.mjs                 -> dist/, media/ (KaTeX fonts), .vsix
tests/e2e/                    Playwright: core demo page, built extension, webview
tests/fixtures/               our own Markdown and HTML test documents
```

### 2. One extraction path: rendered DOM to document model

Both hosts hand the core a rendered DOM subtree. The browser passes page elements. VS Code
renders Markdown to DOM inside the webview first and passes that. There is therefore one
extractor and one definition of every block type.

```ts
interface Doc { sections: Section[] }
interface Section { id: string; heading?: { level: 1|2|3|4|5|6; text: string }; blocks: Block[]; words: number }
type Block =
  | { kind: 'prose'; sentences: Sentence[]; source: SourceRef }
  | { kind: 'list'; ordered: boolean; items: ListItem[]; source: SourceRef }
  | { kind: 'code' | 'table' | 'math' | 'image' | 'diagram'; meta: ExhibitMeta; source: SourceRef }
interface ListItem { depth: number; index: number; of: number; sentences: Sentence[]; source: SourceRef }
interface Sentence { tokens: Token[] }        // Token: word text, or an atomic inline (inline code, inline math)
interface SourceRef { element: Element; line?: number }   // line from data-line when present
interface ExhibitMeta { lines?: number; rows?: number; cols?: number; alt?: string; language?: string }
```

Extraction rules (`extract(root: Element | Element[], opts)`):

- Walk block-level descendants in document order. `h1`–`h6` (and `[role=heading][aria-level]`)
  start a new section. Content before the first heading is an untitled first section.
- `p`, and any leaf block whose children are inline, become prose. `blockquote`, `div`,
  `section`, `article`, `details` are walked into.
- `ul`/`ol` become one list block; nested lists contribute items with `depth + 1`; `index`
  and `of` count siblings of the item's own list.
- `pre` is code (`lines` from its text; `language` from a `language-*` class). `table` is a
  table (`rows`, `cols`).
- Display math: `.katex-display`, `mjx-container[display="true"]`, `math[display="block"]`.
  Inline math (`.katex`, `mjx-container`, `math`) and inline `code` are atomic tokens in the
  sentence: shown as one unit, never split, counted as one word.
- Diagram: an element with class `mermaid` that contains an `svg`, or a block-level `svg`
  or `canvas`. Image: `img`, `picture`, and `figure` whose content is an image (a `figure`
  holding a table or code is that type). `alt` text is kept in `meta`.
- Skipped: elements that are not rendered (`hidden`, `display: none`, `visibility: hidden`,
  `aria-hidden="true"` at block level), and `script`, `style`, `nav`, `aside`, `button`,
  `form`, `noscript`, `template`.
- A fenced `mermaid` block that the page did not render is a code block. This is a stated
  limit for the browser; VS Code renders it before extraction.

A selection is extracted as the block elements the range intersects; when the range lies
inside a single block, its text becomes one prose block.

### 3. Text: sentences, chunks, ORP

- Sentence split on `.`, `!`, `?`, `…` followed by whitespace and an upper-case letter,
  digit, quote or bracket, with a small abbreviation list (`e.g.`, `i.e.`, `etc.`, `vs.`,
  `Dr.`, `Mr.`, `Mrs.`, `Ms.`, `No.`, `Fig.`) and no split inside numbers or after a single
  capital letter. Atomic tokens never contain a split.
- Chunking, per sentence: add tokens while the chunk has fewer than `chunkWords` tokens and
  the joined text stays within `chunkChars`. A single token longer than `chunkChars` is its
  own chunk. A chunk never crosses a sentence end. A chunk also ends after a token ending in
  `,` `;` `:` or a dash, when it already holds at least two tokens.
- ORP: the pivot letter of a word of length n is at index 0 (n ≤ 1), 1 (2–5), 2 (6–9),
  3 (10–13), 4 (longer), counting letters and digits only. For a multi-word chunk the anchor
  word is the one containing the chunk's character midpoint; its pivot letter is highlighted
  and the chunk is positioned so the pivot sits on a fixed vertical axis of the stage.

### 4. Timeline and pacing

`buildTimeline(doc, settings)` produces ordered steps, each tied to a section and a block:

| Step | From | Behaviour |
|------|------|-----------|
| `chapter` | heading at a stop level | stop; chapter card |
| `title` | heading at a non-stop level | heading text shown for a dwell (1.2 s) |
| `chunk` | prose | timed |
| `item-chunk` | list item, streamed | timed; carries `i/n` and depth; an `item-gap` pause (400 ms) follows each item |
| `list-whole` | list whose items are all short | whole list on the stage for a dwell |
| `stop` | code/table/math set to `stop` | stop; prompt, e.g. "Code, 24 lines: Space to continue, E to expand" |
| `dwell` | image, diagram; code/table/math set to `dwell` | exhibit shown, timed |
| (none) | code/table/math set to `skip` | no step; the exhibit is still revealed when its position is passed |

A list is short when every item has at most 6 words and it has at most 8 items. Its dwell is
`max(1500 ms, words × base × 1.5)`.

Durations, with `base = 60000 / wpm` ms per word:

- chunk: `base × tokens`, plus `0.5 × base` if it ends in a comma-class mark, plus
  `1.2 × base` if it ends the sentence, plus `0.3 × base` per token longer than 8 characters.
- Ramp: after a stop, a pause, a jump, or the start, the next six timed steps run at
  60 %, 68 %, 76 %, 84 %, 92 %, 100 % of the set speed (duration divided by the factor).
- Section estimates (outline, chapter card) sum the timed durations without the ramp and
  count each stop as 3 s.

Chapter card contents: title, word count, estimated time, a summary such as
"4 paragraphs, 1 list, 2 code blocks, 1 table", and the titles of its direct sub-headings.

### 5. Player

A state machine over the timeline with an injected scheduler (`setTimeout`, `clearTimeout`,
`now`), so every timing test runs on a fake clock.

States: `idle`, `playing`, `paused`, `stopped` (waiting at a stop step), `reading` (normal
reading view), `closed`. Commands: `toggle`, `continue`, `sentence(±1)`, `section(±1)`,
`jumpToSection(id)`, `jumpToBlock(ref)`, `speed(±25)` clamped to 100–1000 WPM,
`toggleReading`, `expand`, `close`. Events: `step`, `state`, `position` (section, block,
source ref), `settings`.

- `sentence(-1)` goes to the start of the current sentence, or the previous one when
  already within its first chunk. Sentence moves cross block boundaries and land on stops.
- `section(±1)` lands on the section's first step (its chapter card when it has one).
- Space on a stop continues; Space while playing pauses; Space while paused plays.
- Speed changes apply from the next step and are saved to settings.
- Reaching the end shows an end card (words read, time) and leaves the reader open.

### 6. UI

`mountReader(root, doc, { settings, store, host })` builds the reader inside `root` (an
element or a shadow root) and returns a handle with `destroy()`.

- `host` is the bridge the core calls: `exhibit(block): Node` (how to display a block),
  `document(): Node` (the content for normal reading), `onPosition(ref)`, `onClose()`.
  The browser returns clones in the light DOM (section 7); VS Code returns clones of its own
  rendered nodes.
- Outline rail: one row per section with a heading, indented by level; the current row is
  highlighted; each row has a thin progress bar and the remaining time; a click jumps.
- Stage: the chunk with the pivot letter coloured and aligned on the axis; for list items
  the `item i/n` counter and indentation by depth; under it the current sentence at reduced
  opacity with the current chunk at full opacity. Stop, chapter, list-whole and end cards
  replace the chunk. A status line shows WPM, play state and overall progress.
- Exhibit pane: the non-prose blocks of the current section; each appears when playback
  reaches it and stays; the active one is marked and scrolled into view; changing section
  replaces the pane's contents, and blocks of an already-read section are all visible when
  it is revisited. `E` opens the active exhibit over the stage at full size, `E` or Esc
  closes it.
- Layout: three columns from 900 px reader width; under that the exhibit pane moves below
  the stage and the outline collapses to a bar showing the current heading, which opens the
  rail as a drawer.
- Normal reading (`Tab`): the stage and pane are replaced by the host's document, scrolled
  to the current block, which is marked. Clicking a block moves the position there. `Tab`
  returns to the stage, paused, at the position.
- Settings panel (gear button, or `,`): every setting in R12. Changes apply immediately and
  are saved through `store` (`load(): Promise<Partial<Settings>>`, `save(settings)`).
- Keyboard: handled on the reader root, which takes focus when opened and traps Tab.
- Theme: light and dark from `prefers-color-scheme`; VS Code passes its theme colours in as
  CSS variables. Styles are a single string injected by `mountReader`; no external
  stylesheet, no web font.

### 7. Browser extension

- Manifests: MV3 for both. Chrome uses `background.service_worker`; Firefox uses
  `background.scripts` and `browser_specific_settings.gecko`. Permissions: `storage`,
  `contextMenus`, `scripting`, `activeTab`; host access `<all_urls>` for the always-on
  content script (D2). No remote code, no `web_accessible_resources` beyond what the
  injected reader needs.
- `content.ts` (always on, kept small): Alt-hover outline and click capture (R14), remembers
  the element under the last `contextmenu` event, answers the background's requests.
- `background.ts`: toolbar click and the `Alt+Shift+R` command read the selection, else the
  main content; the two context-menu items; each injects `reader.js` with
  `scripting.executeScript` once per tab and sends it a `{ mode, … }` message.
- `reader-entry.ts`: resolves the container and start block, extracts, mounts.
  - Selection: R13. From here / hover: from the chosen block to the end of its container.
  - Container: the site adapter's reply element containing the block (or, with no block,
    the last reply on the page), else the generic heuristic: `main`, `article`,
    `[role=main]`, otherwise the element with the highest score of direct paragraph text
    length, penalised for link density.
  - Site adapters are a data table: hostname pattern, reply selectors, content selector.
    Entries for `claude.ai`, `chatgpt.com` / `chat.openai.com`, `gemini.google.com`. When no
    selector matches, the generic heuristic is used, so a markup change degrades to generic
    behaviour instead of failing.
- Mount and styling (R16): a host element appended to `documentElement` holds a shadow root
  with the reader UI, so page CSS cannot restyle the reader. Exhibits and the normal-reading
  document are clones placed in the host element's light DOM and projected through slots,
  so the page's CSS still applies to them. Each clone is wrapped in shallow copies of its
  original ancestors up to the container (tag, `class`, `data-*`, `dir`, `lang`; no `id`), so
  ancestor-dependent selectors keep matching.
- Display (R17): overlay covers the viewport over a dimmed backdrop and locks page scroll.
  Docked: a panel fixed to the right edge (420 px), the page stays usable and is given a
  matching right margin while the panel is open.
- Close: the page scrolls to the last-read block and outlines it briefly.
- Storage: `chrome.storage.local`. The `chrome.*` namespace with promises is used in both
  browsers.

### 8. VS Code extension

- Commands: `speedRead.readFile`, `speedRead.readSelection`, `speedRead.readFromCursor`;
  keybinding `Alt+Shift+R` (file, or selection when one exists) in Markdown editors.
  CodeLens above every Markdown heading (`speedRead.readFromLine`). Hover provider on
  headings and paragraphs with a trusted command link. Fenced code is ignored when finding
  headings.
- Panel: one webview beside the editor, reused. The extension sends
  `{ markdown, startLine, endLine?, settings }`; the webview renders with markdown-it
  (source line numbers written as `data-line`), markdown-it-texmath with KaTeX for both
  dollar and bracket delimiters, and Mermaid for `mermaid` fences, into a detached
  container, then calls the core extractor and `mountReader`. KaTeX CSS and fonts are local
  webview resources; the CSP allows only the webview's own origin and a script nonce.
- Cursor follow (R21): the webview posts `{ line }` on each position change; the extension
  moves the selection of the source editor to that line and reveals it, without taking
  focus from the webview. Closing the panel leaves the cursor there.
- Settings: `contributes.configuration` (`speedRead.*`) mirrors R12; the webview's settings
  panel writes back through messages; configuration changes are pushed to an open panel.
- Known limit, stated in the README: the Copilot and Claude Code chat panels cannot be read;
  the text must be in a file or a selection. Non-Markdown files are read as plain prose.

### 9. Text-to-speech

`createSpeechDriver(synth = globalThis.speechSynthesis)`; absent API means the TTS controls
are disabled with a note.

- With TTS on, the player hands timing to the driver: one utterance per sentence (or list
  item), rate `wpm / 180` clamped to 0.5–3. Each `boundary` event's `charIndex` selects the
  chunk containing that character, and the stage shows it. `end` advances to the next
  sentence. If an utterance produces no boundary event within 1 s, that sentence falls back
  to timed chunks and advances on `end`.
- Stops, dwells, pause, jumps and close cancel speech; continue starts the next utterance.
  Titles are spoken; code, tables and math are not.
- Voices: listed with a "local" or "network" label from `localService`. Only local voices
  are eligible as the default. With no local voice the toggle stays off and the panel says
  "No offline voice installed". Choosing a network voice shows "This voice needs a network
  connection". The panel always carries the line "Offline speech uses voices installed on
  this device".

### 10. Offline guarantee

No `fetch`, `XMLHttpRequest`, `WebSocket`, remote `import`, remote font or remote image is
issued by extension code. Browser-level tests record every request made while the reader is
used and fail on any request that is not to the test's own local page. The VS Code webview
CSP has no remote source. Mermaid and KaTeX are bundled from npm at build time.

### 11. Tests

- Unit (Vitest, jsdom where DOM is needed): text, timeline, pacing, player on a fake clock,
  settings, extraction against our own HTML test documents, UI behaviour, TTS with a fake
  `speechSynthesis`, adapters, VS Code providers against a stub `vscode` module.
- Browser level (Playwright, headless Chromium): a core demo page; the built Chrome
  extension loaded unpacked, with entry points driven through the service worker and real
  key and pointer input on local test pages; the built VS Code webview bundle loaded with a
  stub `acquireVsCodeApi`.
- Site adapters are tested only for their selection logic against minimal markup written
  for the test. No captured page from those sites exists in the repo, so their behaviour on
  the real sites is a live row (D3).
- Every feature is written test-first.

### 12. Packaging, CI, README

- `npm run package` produces `dist/speed-read-chrome.zip`, `dist/speed-read-firefox.zip`
  and `dist/speed-read-vscode.vsix`.
- CI: on `pull_request` and on `push` to `main`: `npm ci`, typecheck, unit tests, Playwright
  Chromium tests, build, package, upload the three packages.
- README: install per target (Chrome: load unpacked or the zip; Firefox: temporary add-on
  from `about:debugging`, and the note that a permanent install needs a signed build;
  VS Code: `code --install-extension`), usage, keys, settings, offline notes including TTS
  voices, known limits.

### Out of scope

Store publishing and signing. The herdr plugin. Reading the VS Code chat panels. Rendering
unrendered Mermaid or TeX source found on web pages. Translation of the UI.

## Verification

gate: tester

- chat-site-adapters: live — the three chat sites are login-walled and their markup can only be observed on the real pages
- firefox-extension-runs: live — no Firefox binary runs in the build environment; only an installed build in Firefox shows it
- vscode-extension-in-host: live — the suite runs the providers against a stub and the webview in Chromium; only a VS Code window shows the real host
- tts-speaks-in-sync: live — speech output and real voice boundary events exist only on a machine with voices installed

Every other row is verified before merge by the automated suite.

## Test Plan

Post-merge, operator-driven, on an installed build:

1. Chat sites: on claude.ai, ChatGPT and Gemini, open a long reply with code, a list and a table. Toolbar button reads the last reply only; Alt-hover then click inside an earlier reply reads from that block to the end of that reply; exhibits look as they do on the page.
2. Firefox: load `dist/firefox` as a temporary add-on; toolbar button, both context-menu items, Alt+Shift+R and Alt-hover work on an article page; settings persist after a restart.
3. VS Code: install the `.vsix`; on a Markdown file with math and a Mermaid block run all three commands, the CodeLens and the hover link; the panel renders math and the diagram; the editor cursor follows and stays on the last line read after closing.
4. Text-to-speech: with a local voice, turn TTS on in Chrome and in VS Code; the displayed chunk follows the voice; with networking disabled a local voice still speaks; a network voice shows the warning.
