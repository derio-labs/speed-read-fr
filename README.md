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
4. The first press of the toolbar button asks for access to all sites. Grant it for Alt-hover
   and "Speed read from here"; without it the toolbar button, the shortcut and the menu still
   read the current tab.

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

The reader opens as three floating cards over the page: the outline on the left, the stage in
the middle and the exhibits on the right. The page stays visible behind them, faded, and the
block being read shows at full strength in the band above the stage; the page scrolls by itself
so that block stays in view near the top. The **Page fade** setting chooses how strong the page
behind is. Setting **Display** to **Side panel** docks the reader in a 420 px panel at the right
edge instead; the page stays usable beside it, and page elements fixed to the right edge (a
header bar, a help button) move out from under the panel while it is open.

Esc closes the reader and leaves the page at the block you were reading, outlined briefly.

### In VS Code

On a Markdown file (other text files are read as plain prose):

- **Speed Read: Read File**, **Speed Read: Read Selection** and **Speed Read: Read From Cursor**
  in the command palette; **Alt+Shift+R** reads the selection, else the file.
- **▶ Read section**, a CodeLens above every heading.
- **▶ Speed read from here**, a link in the hover over headings and paragraphs.

The reader opens in a panel beside the editor and renders the Markdown with math (`$…$`,
`$$…$$`, `\(…\)`, `\[…\]`) and Mermaid diagrams. The editor cursor follows the block being
read and stays on it when you pause or close.

### The position dial

A tick strip under the sentence line moves the reading position in both directions. Drag it
(left moves forward) or turn the mouse wheel over the stage; in the browser overlay the wheel
turns the dial anywhere on the page, except over the exhibit card, the settings panel and the
normal-reading view, which scroll their own content. A slow turn moves one chunk at a time;
faster turns accelerate up to fourteen-fold (the readout beside the strip shows the
multiplier), and the dial coasts briefly when you let go. Playback pauses while you turn it and
resumes on its own afterwards if it was playing. Chapter cards and stops are shown as you pass
them; they do not hold the dial.

### Narrow windows

When the reader is narrower than 900 px (a narrow window, the docked panel, a narrow VS Code
panel) the outline becomes a bar with a drawer in the stage header, and the exhibit card moves
above the stage. It takes the height its content needs, up to the room available, and the stage
glides down to make room and back up when the card empties. **E** expands an exhibit over the
whole reader in every layout.

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
| Words per chunk | 3 | 1-10 |
| Characters per chunk | 20 (maximum) | 5-80 |
| Stop at headings | H1 and H2 | any of H1-H6 |
| Code | Stop (Dwell: 5 s) | Stop, Skip, or Dwell 1-60 s |
| Tables | Stop (Dwell: 5 s) | Stop, Skip, or Dwell 1-60 s |
| Math | Stop (Dwell: 5 s) | Stop, Skip, or Dwell 1-60 s |
| Images and diagrams | 3 s | 1-60 s |
| Display | Overlay | Overlay or Side panel (browser only) |
| Page fade | 32 % | 10-80 %, strength of the page behind the floating reader (browser only) |
| Text-to-speech | Off | on or off, and the voice |

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
  off until you pick a voice yourself. Picking a network voice shows "This voice needs a network
  connection": that voice sends the text to its provider.
- While it speaks, the chunk on the stage follows the voice's word boundaries. A voice that
  reports no boundaries shows each sentence whole while it is spoken.
- Code, tables and math are not spoken; headings are. Inline math is left out of the spoken
  text.

## Known limits

- **Alt+click on Linux**: desktops that reserve Alt+click for moving windows never deliver it to
  the page, so Alt-hover cannot start the reader there; use the context menu instead.
- **Page styles by ancestor**: exhibits and the normal-reading view are copies of the page's
  rendered blocks. Page rules that select by an ancestor's `id`, or that depend on a `body > …`
  child position, do not match the copy; `url(#id)` references inside a copied SVG resolve to the
  original on the page.
- **Inline math is shown as source** in the chunks and the sentence line (display math is an
  exhibit). Headings that contain inline math show their TeX source in the outline and on cards.
- **Unrendered Mermaid or TeX on web pages** is shown as the page shows it, as source; the browser
  reader renders nothing itself.
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
