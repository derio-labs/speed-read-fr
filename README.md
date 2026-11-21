# speed-read-fr

A structure-aware speed reader for AI output and long pages, offline, as a Chrome extension, a
Firefox extension and a VS Code extension. Prose is streamed a few words at a time, each chunk
centred on the letter your eye lands on. Code, formulas, tables, images and diagrams are shown
as they are, beside the stage; lists are read item by item; every chapter is a stop. One reader
core runs in all three hosts.

Nothing is fetched while you read: every library, font and style is bundled in the packages.

## Install

Build the packages first (see [Development](#development)), or download them from the
`packages` artifact of a CI run: `dist/speed-read-chrome.zip`, `dist/speed-read-firefox.zip` and
`dist/speed-read-vscode.vsix`.

### Chrome

1. Run `npm ci && npm run build`, or unzip `dist/speed-read-chrome.zip` into a folder.
2. Open `chrome://extensions` and turn on **Developer mode** (top right).
3. Press **Load unpacked** and pick `packages/browser-extension/dist/chrome` (or the folder you
   unzipped).
4. Pin **Speed read** to the toolbar if you like. Chrome asks nothing when you press it: the
   toolbar button and the shortcut open the reader on the current tab through `activeTab`.

The same steps work in Edge, Brave and other Chromium browsers.

### Firefox

Firefox 128 or later.

1. Run `npm ci && npm run build`, or unzip `dist/speed-read-firefox.zip` into a folder.
2. Open `about:debugging`, choose **This Firefox**, press **Load Temporary Add-on…** and pick
   `packages/browser-extension/dist/firefox/manifest.json` (or the `manifest.json` in the folder
   you unzipped).
3. A temporary add-on is removed when Firefox restarts. A permanent install needs a build
   signed by Mozilla, or Firefox Developer Edition or Nightly with
   `xpinstall.signatures.required` set to `false` in `about:config` (then install the zip from
   `about:addons`, **Install Add-on From File…**).
4. Firefox 128 and later grant the requested access to all sites when the add-on is installed.
   If you later revoke it (in `about:addons`, **Permissions**), the toolbar button asks for it
   again; Alt-hover and "Speed read from here" need it, while the toolbar button, the shortcut and
   the menu still read the current tab without it.

### VS Code

```sh
code --install-extension dist/speed-read-vscode.vsix
```

or, inside VS Code, run **Extensions: Install from VSIX…** from the command palette and pick
`dist/speed-read-vscode.vsix`.

## Usage

### In the browser

- **Toolbar button** or **Alt+Shift+R**: reads the selection, else the page's main content (on
  claude.ai, ChatGPT and Gemini: the last assistant reply).
- **Context menu**: "Speed read selection" on a selection; "Speed read from here" anywhere on
  the page reads from that block to the end of its container.
- **Alt-hover**: hold Alt, the block under the pointer is outlined; Alt+click reads from that
  block to the end of its container (inside a chat reply: to the end of that reply).

In **Overlay** and **Side panel**, the speed-read box stays at the bottom with a fixed font
size and focus point. Chapter cards and scrollable exhibits have their own space above it.
In Overlay, the faded page stays visible behind the reader, and the current block is outlined at
full contrast. The page scrolls smoothly to keep that block near the visible top, below sticky
headers where possible. The **Page fade** setting chooses how strong the page
behind is. Setting **Display** to **Side panel** docks the reader in a 420 px panel at the right
edge instead; the page stays usable beside it, and page elements fixed to the right edge (a
header bar, a help button) move out from under the panel while it is open.

Esc closes the reader and leaves the page at the block you were reading, outlined briefly.

Choose **Chunk-by-chunk** or **Three-row flow** with **Reading mode** in Settings. Chunk-by-chunk
remains the default. Flow shows the text as one continuous ribbon wrapped onto three rows of a much
wider window (up to 1200 px in the browser overlay, the full panel in the browser dock and VS Code):
read top left to bottom right, the rows are plain running text, with what you just read on top, the
current line in the middle and what comes next below. Each step moves the ribbon left by one word, so
the current word glides into a fixed braced target at the center of the middle row, between a red
brace above and below it, with its middle letter in red. The wheel or the dial moves the ribbon
back and forward word by word with the same glide, and reading resumes from the word you reach; under
reduced motion it moves without the glide. Both modes use the same speed, timeline, chapter and
exhibit behavior, pause/play, sentence and section navigation, and dial controls.

In flow, inline code or math of up to 20 characters runs through the target like a word, in monospace
and staying on it a little longer the longer it is (one word-time per 8 characters). A longer one
shows in the ribbon as a short numbered chip such as `⟨code 1⟩` and in full in the exhibits panel,
each as an exhibit of its own; the Code (or Math) setting decides what happens at the chip: Stop or
Dwell hold the ribbon on screen with the chip on the target while the prompt shows beside it (E
expands the full text), and Skip only lists it. Speech reads a chip as "code" or "formula".

The choice is saved
with the browser extension's settings or the VS Code `speedRead.readingMode` setting; older saved
settings without a mode continue in chunk mode.

### In VS Code

On a Markdown file (other text files are read as plain prose):

- **Speed Read: Read File**, **Speed Read: Read Selection** and **Speed Read: Read From Cursor**
  in the command palette; **Alt+Shift+R** reads the selection, else the file.
- **▶ Read section**, a CodeLens above every heading.
- **▶ Speed read from here**, a link in the hover over headings and paragraphs.

The reader opens in a panel beside the editor and renders the Markdown with math (`$…$`,
`$$…$$`, `\(…\)`, `\[…\]`) and Mermaid diagrams. A diagram that fails to render, or takes
longer than 10 s, stays a code block under a one-line "Diagram failed to render" caption. The
editor cursor follows the block being read and stays on it when you pause or close.

### The position dial

A tick strip under the speed-read text moves the reading position in both directions. Drag it
(left moves forward) or turn the mouse wheel over the stage; in the browser overlay the wheel
turns the dial anywhere on the page, except over the outline card, the exhibit card, the
settings panel and the normal-reading view, which scroll their own content (and never hand the
wheel on to the page behind). Ctrl+wheel and pinch still zoom the page, and a horizontal swipe
still goes back or forward; only on the strip itself does a sideways turn move the dial. While
you read in the overlay, the page follows the current block in the visible area above the reader.
A slow turn moves one chunk at a time;
faster turns accelerate up to fourteen-fold (the readout beside the strip shows the
multiplier), and the dial coasts briefly when you let go. Playback pauses while you turn it and
resumes on its own afterwards if it was playing. Chapter cards and stops are shown as you pass
them; they do not hold the dial.

### Narrow windows

In the browser's floating overlay the outline card collapses into a bar with a drawer in the
stage header when the window is narrower than 1180 px. The browser's Side panel always uses
that bar. In a VS Code panel narrower than 900 px the exhibit card moves above the stage. **E** expands an
exhibit over the whole reader in every layout.

## Keys

| Key | Action |
| --- | --- |
| Space | Play or pause; continue at a stop or chapter card |
| Left / Right | Previous / next sentence |
| Up / Down | Speed up / slow down by 25 WPM |
| `N` / `P` | Next / previous section |
| Tab | Normal reading at the current position, and back |
| `E` | Expand the current exhibit, and close it |
| Esc | Close the expanded exhibit, else the reader |
| `,` | Settings |

The mouse wheel and the dial strip move the position (see [The position dial](#the-position-dial)).

## Settings

Open them with the gear button or `,`. The browser keeps them in the extension's storage; VS Code
keeps them in the `speedRead.*` settings.

| Setting | Default | Range |
| --- | --- | --- |
| Speed | 300 WPM | 100-1000 |
| Reading mode | Chunk-by-chunk | Chunk-by-chunk or Three-row flow |
| Words per chunk | 3 | 1-10 |
| Characters per chunk | 20 (maximum) | 5-80; in the browser and VS Code the limit in force is capped by how many characters fit the chunk stage (the setting keeps your value, so a wider window gives it back) |
| Stop at headings | H1 and H2 | any of H1-H6 |
| Code | Stop (Dwell: 5 s) | Stop, Skip, or Dwell 1-60 s |
| Tables | Stop (Dwell: 5 s) | Stop, Skip, or Dwell 1-60 s |
| Math | Stop (Dwell: 5 s) | Stop, Skip, or Dwell 1-60 s |
| Images and diagrams | 3 s | 1-60 s |
| Display | Overlay | Overlay or Side panel (browser only) |
| Page fade | 32 % | 10-80 %, strength of the page behind the floating reader (browser only) |
| Text-to-speech | Off | on or off, and the voice |

A chunk wider than the stage shrinks to half size and then wraps onto two centred lines; it is never cut off.

## Offline and text-to-speech

The extensions make no network request while they run: KaTeX, Mermaid, markdown-it and the
reader's styles are bundled, and the browser reader shows copies of what the page already
rendered. The VS Code panel's content security policy allows no remote source.

Text-to-speech uses the voices of the browser or the system (the Web Speech API):

- It is off by default. Turn it on under **Speech** in the settings.
- Each voice is listed as **local** or **network**. Only a local voice works offline, and only a
  local voice is chosen automatically: the first local voice of the page's language, else the
  first local voice.
- With no local voice installed the panel says "No offline voice installed", and speech stays
  off until you pick a voice yourself. The voice list groups local and network voices, and a
  badge beside it shows which kind is chosen. Picking a network voice shows
  "This voice needs a network connection": that voice sends the text to its provider.
- A saved voice that is no longer installed falls back to the automatic choice, and the panel
  says "Saved voice not found; using Automatic".
- While it speaks, the chunk on the stage follows the voice's word boundaries. Without them,
  the browser reader estimates chunk timing from the speaking rate; VS Code shows the sentence.
- Code, tables and math are not spoken. Headings that do not stop are spoken; chapter cards
  (the headings that stop) are not. Inline math is left out of the spoken text, headings
  included.
- If the voice fails to start, the browser tries another installed voice of the same language
  when available. If speech still fails, the reader uses timed text. After two failed attempts in
  a row, the status line and settings say "Speech failed: showing text only". Choose another voice
  or reopen the reader to try again.

## Known limits

- **Alt+click on Linux**: desktops that reserve Alt+click for moving windows never deliver it to
  the page, so Alt-hover cannot start the reader there; use the context menu instead.
- **Page styles by ancestor**: exhibits and the normal-reading view are copies of the page's
  rendered blocks. Page rules that select by an ancestor's `id`, or that depend on a `body > …`
  child position, do not match the copy; `url(#id)` references inside a copied SVG resolve to the
  original on the page.
- **Inline math is shown as source** in the chunks (and in VS Code's sentence line; display math is an
  exhibit). Headings that contain inline math show their TeX source in the outline and on cards.
- **Canvas drawings in the browser** (charts and diagrams drawn on a `<canvas>`) are shown as a
  placeholder, "Shown on the page": the reader never reads a canvas's pixels, which may come
  from another site.
- **Unrendered Mermaid or TeX on web pages** is shown as the page shows it, as source; the browser
  reader renders nothing itself.
- **Browser pages cannot be read**: no extension may run on `chrome://` and `about:` pages, the
  extension stores or the browser's PDF viewer. There the toolbar button shows a **!** badge and
  the tooltip "Can't read this page" until that tab navigates or a read succeeds.
- **VS Code chat panels** (Copilot, Claude Code) cannot be read: the text must be in a file or a
  selection.
- **Cursor follow in VS Code is block-granular**: the cursor sits on the first line of the block
  being read, not on the word.
- **Frames**: the reader runs in the top frame of a page. A menu item used inside a frame reads
  the top page's main content; Alt-hover inside a frame is not handled.
- **Fixed elements added later**: the side panel moves the page's fixed elements when it opens;
  elements the page adds after that are not moved.
- **Bare prose runs** (text not wrapped in a paragraph) share their container as their position,
  so the clear window, the page follow and VS Code's cursor land on the container.
- **The faded page is not interactive** while the floating overlay is open: it cannot be selected
  or pressed, and Alt-hover is inactive until the reader closes. The side panel leaves the page
  usable.
- **Fixed elements restyled while the dock is open**: closing the side panel restores fixed
  elements to how they were when it opened, so a page that restyled them in the meantime may show
  them shifted until it restyles them again.
- **Without host access** (declined in Firefox, or site access "on click" in Chrome) Alt-hover is
  unavailable and "Speed read from here" reads the main content from its start.
- **Verified by the operator after merge**: the physical toolbar button, menu items and shortcut,
  the chat sites (claude.ai, ChatGPT, Gemini), the extension in a real VS Code window and
  text-to-speech with real voices are checked by hand on an installed build; the automated suite
  drives the same handlers from tests.

## Development

Node 22 and npm 10.

```sh
npm ci
npm run typecheck   # tsc -b over all packages
npm test            # unit tests (Vitest)
npm run build       # core, browser extension (dist/chrome, dist/firefox), VS Code extension
npm run test:e2e    # browser-level tests (Playwright, Chromium)
npm run package     # dist/speed-read-chrome.zip, dist/speed-read-firefox.zip, dist/speed-read-vscode.vsix
```

`tests/demo/index.html` is a demo page of the core reader (`node scripts/build-demo.mjs`, then
`node scripts/serve.mjs`); add `?layout=floating` for the floating cards.
`node scripts/capture-visual.mjs --phase <n>` writes screenshots to `.visual/phase-<n>/`.

## License

MIT, see [LICENSE](LICENSE). Every package carries its own copy.
