/**
 * The reader's stylesheet: one string, applied by `mountReader` (spec section 6).
 *
 * Hosts theme the reader by setting `--speed-read-*` custom properties on (or above) the mount
 * root, e.g. `--speed-read-bg`, `--speed-read-text`, `--speed-read-accent`; every colour the
 * reader uses falls back to its own light or dark palette. No external stylesheet, no web font.
 */

/** Custom property the reader reads back to prove the stylesheet applies. */
export const SENTINEL_PROPERTY = '--sr-sentinel';

/** Reader width from which the three zones sit side by side. */
export const WIDE_MIN_PX = 900;

const LIGHT = `
  --sr-bg: var(--speed-read-bg, #f6f5f1);
  --sr-surface: var(--speed-read-surface, #ffffff);
  --sr-surface-2: var(--speed-read-surface-2, #efede7);
  --sr-text: var(--speed-read-text, #1c1c1e);
  --sr-muted: var(--speed-read-muted, #5f5e66);
  --sr-faint: var(--speed-read-faint, #8c8b93);
  --sr-border: var(--speed-read-border, #dedbd3);
  --sr-accent: var(--speed-read-accent, #c8322b);
  --sr-progress: var(--speed-read-progress, #2f63c9);
  --sr-progress-soft: var(--speed-read-progress-soft, #dde6f8);
  --sr-focus: var(--speed-read-focus, #2f63c9);
  --sr-warning: var(--speed-read-warning, #8a4b00);
  --sr-warning-soft: var(--speed-read-warning-soft, #fdf0dc);
  --sr-shadow: 0 1px 2px rgb(0 0 0 / 6%), 0 8px 24px rgb(0 0 0 / 8%);
  --sr-float-shadow: 0 10px 34px rgb(23 32 56 / 18%), 0 1px 3px rgb(23 32 56 / 12%);
  color-scheme: light;
`;

const DARK = `
  --sr-bg: var(--speed-read-bg, #141518);
  --sr-surface: var(--speed-read-surface, #1c1d21);
  --sr-surface-2: var(--speed-read-surface-2, #25272c);
  --sr-text: var(--speed-read-text, #ececef);
  --sr-muted: var(--speed-read-muted, #a9a9b3);
  --sr-faint: var(--speed-read-faint, #7d7d88);
  --sr-border: var(--speed-read-border, #30323a);
  --sr-accent: var(--speed-read-accent, #ff6b5f);
  --sr-progress: var(--speed-read-progress, #7aa7ff);
  --sr-progress-soft: var(--speed-read-progress-soft, #263451);
  --sr-focus: var(--speed-read-focus, #7aa7ff);
  --sr-warning: var(--speed-read-warning, #f5b454);
  --sr-warning-soft: var(--speed-read-warning-soft, #3a2c14);
  --sr-shadow: 0 1px 2px rgb(0 0 0 / 30%), 0 8px 24px rgb(0 0 0 / 35%);
  --sr-float-shadow: 0 10px 34px rgb(0 0 0 / 55%), 0 1px 3px rgb(0 0 0 / 50%);
  color-scheme: dark;
`;

export const READER_CSS = `
.sr-reader {
  ${SENTINEL_PROPERTY}: 1;
  ${LIGHT}
  --sr-font: var(--speed-read-font, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif);
  --sr-mono: var(--speed-read-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace);
  --sr-radius: 10px;
  --sr-axis: 45%;
  container-type: inline-size;
  container-name: sr-reader;
  position: relative;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  min-height: 320px;
  overflow: hidden;
  outline: none;
  background: var(--sr-bg);
  /* Every inherited property, so page styles never leak into the reader. */
  color: var(--sr-text);
  font-family: var(--sr-font);
  font-size: 16px;
  font-style: normal;
  font-variant: normal;
  font-weight: 400;
  font-stretch: normal;
  font-kerning: auto;
  line-height: 1.5;
  letter-spacing: normal;
  word-spacing: normal;
  text-align: left;
  text-indent: 0;
  text-transform: none;
  text-shadow: none;
  text-rendering: auto;
  white-space: normal;
  word-break: normal;
  overflow-wrap: break-word;
  hyphens: manual;
  tab-size: 4;
  direction: ltr;
  writing-mode: horizontal-tb;
  visibility: visible;
  cursor: default;
  caret-color: auto;
  list-style: none;
  quotes: auto;
  border-collapse: separate;
  border-spacing: 0;
  caption-side: top;
  empty-cells: show;
  -webkit-font-smoothing: antialiased;
}
@media (prefers-color-scheme: dark) {
  .sr-reader { ${DARK} }
}
.sr-reader *, .sr-reader *::before, .sr-reader *::after { box-sizing: border-box; }
.sr-reader [hidden] { display: none !important; }
/* Zero specificity, so every class rule below sets its own colours over this reset. */
:where(.sr-reader) :where(button, input, select) {
  font: inherit; color: inherit; letter-spacing: inherit; text-transform: none; margin: 0;
}
.sr-reader :focus-visible { outline: 2px solid var(--sr-focus); outline-offset: 2px; }
.sr-reader .sr-icon { fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }

/* Layout: one column under ${WIDE_MIN_PX}px of reader width, three from there. */
.sr-layout {
  display: grid;
  height: 100%;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto minmax(0, 1fr) minmax(0, 42%);
  grid-template-areas: "bar" "main" "exhibits";
}
.sr-outline-bar { grid-area: bar; }
.sr-outline { grid-area: main; }
.sr-main { grid-area: main; }
.sr-exhibits { grid-area: exhibits; border-top: 1px solid var(--sr-border); }
/* Outline bar (narrow) and rail. */
.sr-outline-bar {
  display: flex; align-items: center; gap: 8px; min-width: 0;
  padding: 8px 12px; border-bottom: 1px solid var(--sr-border); background: var(--sr-surface);
}
.sr-outline-toggle {
  display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1;
  padding: 6px 10px; border: 1px solid var(--sr-border); border-radius: 8px;
  background: var(--sr-bg); cursor: pointer; text-align: left;
}
.sr-outline-toggle .sr-icon { flex: none; }
.sr-outline-toggle-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
.sr-outline {
  display: none; flex-direction: column; min-height: 0; z-index: 3;
  position: relative; align-self: stretch; width: min(320px, 88%);
  background: var(--sr-surface); box-shadow: var(--sr-shadow);
}
.sr-layout[data-drawer="open"] .sr-outline { display: flex; }
.sr-outline-head, .sr-exhibits-head {
  padding: 16px 16px 8px; font-size: 11px; font-weight: 650; letter-spacing: .08em; text-transform: uppercase; color: var(--sr-faint);
}
.sr-outline-list { list-style: none; margin: 0; padding: 0 8px 16px; overflow-y: auto; min-height: 0; }
.sr-outline-list li { margin: 0; padding: 0; }
.sr-outline-row {
  display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-rows: auto auto; column-gap: 8px; row-gap: 5px;
  width: 100%; padding: 7px 10px 8px calc(10px + (var(--sr-level, 1) - 1) * 14px);
  border: 0; border-radius: 8px; background: transparent; cursor: pointer; text-align: left; color: var(--sr-muted);
}
.sr-outline-row:hover { background: var(--sr-surface-2); color: var(--sr-text); }
.sr-outline-row[aria-current="true"] { background: var(--sr-progress-soft); color: var(--sr-text); }
.sr-outline-row[aria-current="true"] .sr-row-title { font-weight: 650; }
.sr-row-title { font-size: 14px; line-height: 1.35; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sr-outline-row[data-level="1"] .sr-row-title { font-weight: 600; color: var(--sr-text); }
.sr-row-time { font-size: 12px; color: var(--sr-faint); font-variant-numeric: tabular-nums; white-space: nowrap; }
.sr-row-bar { grid-column: 1 / -1; height: 3px; border-radius: 2px; background: var(--sr-border); overflow: hidden; }
.sr-row-fill { display: block; height: 100%; width: 0; background: var(--sr-progress); border-radius: 2px; }

/* Main column: toolbar, stage, normal reading. */
.sr-main { position: relative; display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.sr-toolbar {
  display: flex; align-items: center; gap: 12px; padding: 10px 14px 10px 18px;
  border-bottom: 1px solid var(--sr-border);
}
.sr-status { flex: 1; display: flex; align-items: center; gap: 10px; min-width: 0; font-size: 13px; color: var(--sr-muted); font-variant-numeric: tabular-nums; }
.sr-status-wpm { font-weight: 650; color: var(--sr-text); }
.sr-status-state { padding: 1px 8px; border-radius: 999px; background: var(--sr-surface-2); font-size: 12px; }
.sr-reader[data-state="playing"] .sr-status-state { background: var(--sr-progress-soft); color: var(--sr-progress); }
.sr-status-sep { color: var(--sr-border); }
.sr-icon-button {
  display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px;
  border: 1px solid transparent; border-radius: 8px; background: transparent; color: var(--sr-muted); cursor: pointer;
}
.sr-icon-button:hover { background: var(--sr-surface-2); color: var(--sr-text); }
.sr-overall { height: 3px; background: var(--sr-border); }
.sr-overall-fill { display: block; height: 100%; width: 0; background: var(--sr-progress); transition: width .2s linear; }

.sr-stage {
  position: relative; flex: 1; min-height: 220px; display: flex; flex-direction: column; justify-content: safe center;
  padding: 24px clamp(16px, 4cqi, 48px); outline: none; overflow: hidden auto;
}
.sr-display { position: relative; flex-shrink: 0; min-height: 120px; display: flex; align-items: safe center; justify-content: safe center; }
.sr-display[data-kind="chunk"], .sr-display[data-kind="item-chunk"] { display: block; height: 150px; }
.sr-axis { position: absolute; left: calc(var(--sr-axis) + var(--sr-depth, 0) * 28px); top: 0; bottom: 0; width: 0; pointer-events: none; }
.sr-axis::before, .sr-axis::after {
  content: ""; position: absolute; left: -1px; width: 2px; height: 16px; border-radius: 1px; background: var(--sr-accent); opacity: .55;
}
.sr-axis::before { top: 18px; }
.sr-axis::after { bottom: 18px; }
.sr-chunk {
  position: absolute; top: 0; left: var(--sr-axis); margin-left: calc(var(--sr-depth, 0) * 28px - var(--sr-shift, 0px));
  white-space: pre; font-size: calc(46px * var(--sr-scale, 1)); line-height: 150px; font-weight: 500; letter-spacing: -0.01em;
}
.sr-display[data-wrap] { height: auto; min-height: 150px; display: flex; align-items: center; }
.sr-display[data-wrap] .sr-axis { display: none; }
.sr-display[data-wrap] .sr-chunk { position: static; margin: 0; width: 100%; white-space: normal; overflow-wrap: anywhere; text-align: center; line-height: 1.25; }
.sr-pivot { color: var(--sr-accent); font-weight: 700; }
.sr-atom { font-family: var(--sr-mono); font-size: .86em; padding: 0 .14em; border-radius: 4px; background: var(--sr-surface-2); }
.sr-pivot.sr-atom, .sr-pivot .sr-atom { background: transparent; }
.sr-item-counter {
  position: absolute; top: -34px; left: calc(var(--sr-axis) + var(--sr-depth, 0) * 28px); transform: translateX(-50%);
  display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 650; letter-spacing: .06em; text-transform: uppercase; color: var(--sr-faint);
  font-variant-numeric: tabular-nums;
}
.sr-depth-mark { display: inline-block; width: calc(var(--sr-depth, 0) * 10px); height: 2px; background: var(--sr-border); }
.sr-sentence {
  min-height: 3.2em; max-width: min(46em, 100%); overflow-wrap: anywhere; margin: 18px auto 0; text-align: center; font-size: 17px; line-height: 1.6; color: var(--sr-text);
}
.sr-sentence > span { opacity: .38; }
.sr-sentence > .sr-current { opacity: 1; font-weight: 600; }

/* Position dial: a tick strip that slides as the position moves, a centre needle, the multiplier. */
.sr-dial-row { display: flex; align-items: center; gap: 12px; width: min(100%, 560px); margin: 14px auto 0; flex-shrink: 0; }
.sr-dial {
  position: relative; flex: 1 1 auto; height: 34px; border-radius: 8px; overflow: hidden; cursor: ew-resize; touch-action: none;
  background-color: var(--sr-surface-2);
  background-image: repeating-linear-gradient(90deg, var(--sr-faint) 0 1px, transparent 1px 12px), repeating-linear-gradient(90deg, var(--sr-text) 0 2px, transparent 2px 60px);
  background-size: 12px 9px, 60px 16px; background-repeat: repeat-x;
  background-position: var(--sr-dial-offset, 0px) 100%, var(--sr-dial-offset, 0px) 100%;
}
.sr-dial::before { content: ""; position: absolute; inset: 0; pointer-events: none; background: linear-gradient(90deg, var(--sr-surface-2), transparent 22%, transparent 78%, var(--sr-surface-2)); }
.sr-dial-needle { position: absolute; left: 50%; top: 0; bottom: 0; width: 2px; margin-left: -1px; background: var(--sr-progress); pointer-events: none; }
.sr-dial-gain { min-width: 3.4em; text-align: right; font-size: 13px; font-weight: 650; color: var(--sr-progress); font-variant-numeric: tabular-nums; }

/* Speech without word boundaries shows the whole sentence. */
.sr-chunk.sr-chunk-whole { font-size: 28px; }
.sr-tts-notes { padding: 2px 0 6px; }
.sr-settings select[name="tts-voice"] { max-width: 260px; min-width: 0; }
.sr-settings select[name="tts-voice"][size] { height: auto; padding: 4px; }
.sr-tts-note { margin: 4px 0; }
/* Warnings stand apart from hints: an icon and a colour of at least 4.5:1 on the panel (p5b-r5). */
.sr-tts-note[data-kind="warning"] { color: var(--sr-warning); font-weight: 600; }
.sr-tts-note[data-kind="warning"]::before { content: "\\26A0\\FE0E\\00a0"; }
.sr-voice-badge {
  flex: none; padding: 1px 8px; border-radius: 999px; font-size: 12px; font-weight: 650;
  background: var(--sr-progress-soft); color: var(--sr-text);
}
.sr-voice-badge[data-kind="network"] { background: var(--sr-warning-soft); color: var(--sr-warning); }
.sr-settings input[type="checkbox"]:disabled { opacity: 1; cursor: not-allowed; filter: grayscale(1); outline: 1px dashed var(--sr-muted); outline-offset: 2px; }
.sr-status-note { color: var(--sr-warning); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* Cards that replace the chunk. */
.sr-card { width: min(100%, 560px); padding: 26px 28px; border: 1px solid var(--sr-border); border-radius: 14px; background: var(--sr-surface); box-shadow: var(--sr-shadow); }
.sr-card-eyebrow { font-size: 11px; font-weight: 650; letter-spacing: .1em; text-transform: uppercase; color: var(--sr-accent); }
.sr-card-title { margin: 6px 0 4px; font-size: 28px; line-height: 1.2; font-weight: 700; letter-spacing: -0.01em; overflow-wrap: anywhere; }
.sr-card-meta { font-size: 14px; color: var(--sr-muted); font-variant-numeric: tabular-nums; }
.sr-card-summary { margin-top: 12px; font-size: 15px; color: var(--sr-text); }
.sr-card-subs { margin: 14px 0 0; padding: 12px 0 0; border-top: 1px solid var(--sr-border); list-style: none; display: grid; gap: 4px; font-size: 14px; color: var(--sr-muted); }
.sr-card-subs li::before { content: "\\2014\\00a0"; color: var(--sr-faint); }
.sr-card-hint { margin-top: 18px; font-size: 13px; color: var(--sr-faint); }
.sr-kbd { display: inline-block; min-width: 1.6em; padding: 0 .4em; border: 1px solid var(--sr-border); border-bottom-width: 2px; border-radius: 5px; font-family: var(--sr-mono); font-size: 12px; line-height: 1.6; text-align: center; color: var(--sr-muted); background: var(--sr-bg); }
.sr-card-title-step { text-align: center; }
.sr-card-title-step .sr-card-title { font-size: 34px; }
.sr-list-whole { list-style: none; margin: 10px 0 0; padding: 0; display: grid; gap: 6px; font-size: 20px; }
.sr-list-whole li { padding-left: calc(var(--sr-depth, 0) * 24px + 18px); position: relative; }
.sr-list-whole li::before { content: ""; position: absolute; left: calc(var(--sr-depth, 0) * 24px + 2px); top: .7em; width: 6px; height: 6px; border-radius: 50%; background: var(--sr-accent); }

/* Exhibit pane and the expanded overlay. */
.sr-exhibits { display: flex; flex-direction: column; min-width: 0; min-height: 0; background: var(--sr-surface); }
.sr-exhibit-list { flex: 1; overflow-y: auto; padding: 0 14px 16px; display: flex; flex-direction: column; gap: 12px; min-height: 0; }
.sr-exhibits-empty { margin: 4px 2px; font-size: 13px; color: var(--sr-faint); }
.sr-exhibit { margin: 0; border: 1px solid var(--sr-border); border-radius: var(--sr-radius); background: var(--sr-bg); overflow: hidden; flex: none; }
.sr-exhibit[aria-current="true"] { border-color: var(--sr-progress); box-shadow: 0 0 0 3px var(--sr-progress-soft); }
.sr-exhibit-caption { display: flex; justify-content: space-between; gap: 8px; padding: 7px 12px; font-size: 12px; color: var(--sr-muted); border-bottom: 1px solid var(--sr-border); background: var(--sr-surface); }
.sr-exhibit-kind { font-weight: 650; color: var(--sr-text); }
.sr-exhibit-body { padding: 10px 12px; overflow: auto; max-height: 420px; }
/* Pictures and diagrams fit; an SVG inside KaTeX (a radical, an arrow) keeps KaTeX's own sizing. */
.sr-exhibit-body img, .sr-exhibit-body svg:not(.katex svg), .sr-expanded-body img, .sr-expanded-body svg:not(.katex svg), .sr-reading img, .sr-reading svg:not(.katex svg) { max-width: 100%; height: auto; }
/* Expanded over the whole reader (spec section 13): up to 92 % of its width and 88 % of its height. */
.sr-expanded {
  position: absolute; inset: 6% 4%; z-index: 6; display: flex; flex-direction: column; overflow: hidden;
  background: var(--sr-bg); border: 1px solid var(--sr-border); border-radius: 14px; box-shadow: var(--sr-float-shadow);
}
.sr-expanded-head { display: flex; align-items: center; gap: 12px; padding: 10px 14px 10px 18px; border-bottom: 1px solid var(--sr-border); font-size: 13px; color: var(--sr-muted); }
.sr-expanded-title { flex: 1; font-weight: 650; color: var(--sr-text); }
.sr-expanded-body { flex: 1; overflow: auto; padding: 20px clamp(16px, 4cqi, 40px); }

/* Normal reading. */
.sr-reading { flex: 1; overflow-y: auto; padding: 24px clamp(16px, 5cqi, 64px) 64px; min-height: 0; }
.sr-reading :is(p, li, h1, h2, h3, h4, h5, h6, pre, table, figure) { cursor: pointer; }

/* Settings panel. */
.sr-settings-backdrop { position: absolute; inset: 0; z-index: 8; background: transparent; display: flex; justify-content: flex-end; }
.sr-settings {
  width: min(400px, 100%); height: 100%; overflow-y: auto; padding: 0 0 24px;
  background: var(--sr-surface); border-left: 1px solid var(--sr-border); box-shadow: var(--sr-shadow);
}
.sr-settings-head { position: sticky; top: 0; z-index: 1; display: flex; align-items: center; justify-content: space-between; padding: 14px 14px 12px 20px; background: var(--sr-surface); border-bottom: 1px solid var(--sr-border); }
.sr-settings-title { margin: 0; font-size: 17px; font-weight: 700; }
.sr-settings fieldset { margin: 0; padding: 14px 20px 4px; border: 0; min-width: 0; }
.sr-settings legend { float: left; width: 100%; padding: 0; margin-bottom: 4px; font-size: 11px; font-weight: 650; letter-spacing: .08em; text-transform: uppercase; color: var(--sr-faint); }
.sr-settings legend + * { clear: both; }
.sr-settings-foot { display: flex; justify-content: flex-end; padding: 18px 20px 0; margin-top: 10px; border-top: 1px solid var(--sr-border); }
.sr-settings-done { height: 34px; padding: 0 18px; border: 0; border-radius: 8px; background: var(--sr-progress); color: var(--sr-surface); font-weight: 650; cursor: pointer; }
.sr-settings-done:hover { filter: brightness(1.08); }
.sr-field { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 12px; padding: 7px 0; font-size: 14px; }
.sr-field-label { color: var(--sr-text); }
.sr-field-hint { display: block; font-size: 12px; color: var(--sr-faint); }
.sr-field-controls { display: flex; align-items: center; gap: 8px; }
.sr-settings input[type="number"], .sr-settings select {
  height: 32px; padding: 0 8px; border: 1px solid var(--sr-border); border-radius: 7px; background: var(--sr-bg); font-size: 14px;
}
.sr-settings input[type="number"] { width: 76px; font-variant-numeric: tabular-nums; }
.sr-settings input:disabled, .sr-settings select:disabled { opacity: .45; }
.sr-levels { display: flex; gap: 6px; flex-wrap: wrap; }
.sr-level { position: relative; display: inline-flex; }
.sr-level input { position: absolute; opacity: 0; inset: 0; margin: 0; cursor: pointer; }
.sr-level span { display: inline-flex; align-items: center; justify-content: center; min-width: 40px; height: 32px; padding: 0 8px; border: 1px solid var(--sr-border); border-radius: 7px; font-size: 13px; font-weight: 600; color: var(--sr-muted); background: var(--sr-bg); }
.sr-level input:checked + span { border-color: var(--sr-progress); background: var(--sr-progress-soft); color: var(--sr-text); }
.sr-level input:focus-visible + span { outline: 2px solid var(--sr-focus); outline-offset: 2px; }
.sr-field[data-disabled] { color: var(--sr-faint); }
.sr-field[data-disabled] .sr-field-label { color: var(--sr-faint); }
.sr-settings input[type="checkbox"] { width: 18px; height: 18px; accent-color: var(--sr-progress); }

/* Nothing to outline (no headings, or an empty document): no bar, no rail. */
/* A narrow reader (the browser dock) keeps a whole card in view: compact cards, a lower exhibit pane. */
@container sr-reader (max-width: ${WIDE_MIN_PX - 1}px) {
  .sr-layout { grid-template-rows: auto minmax(0, 1fr) minmax(0, 34%); }
  .sr-stage { padding-block: 12px; }
  .sr-card { padding: 16px 18px; }
  .sr-card-title { font-size: 22px; margin: 4px 0 2px; }
  .sr-card-title-step .sr-card-title { font-size: 26px; }
  .sr-card-summary { margin-top: 8px; font-size: 14px; }
  .sr-card-subs { margin-top: 10px; padding-top: 8px; gap: 2px; font-size: 13px; }
  .sr-card-hint { margin-top: 10px; }
}
.sr-layout[data-outline="none"] { grid-template-rows: minmax(0, 1fr) minmax(0, 42%); grid-template-areas: "main" "exhibits"; }
.sr-layout[data-outline="none"] .sr-outline-bar, .sr-layout[data-outline="none"] .sr-outline { display: none; }
.sr-layout[data-outline="none"][data-mode="reading"] .sr-main { grid-row: 1 / -1; }

/* Wide layout: last, so it overrides the narrow defaults above. */
@container sr-reader (min-width: ${WIDE_MIN_PX}px) {
  .sr-layout {
    grid-template-columns: minmax(200px, 22%) minmax(0, 1fr) minmax(280px, 32%);
    grid-template-rows: minmax(0, 1fr);
    grid-template-areas: "outline main exhibits";
  }
  .sr-outline-bar { display: none; }
  .sr-outline { grid-area: outline; display: flex; position: static; border-right: 1px solid var(--sr-border); box-shadow: none; width: auto; }
  .sr-exhibits { border-top: 0; border-left: 1px solid var(--sr-border); }
  .sr-layout[data-mode="reading"] .sr-main { grid-column: 2 / -1; }
  .sr-layout[data-outline="none"] { grid-template-columns: minmax(0, 1fr) minmax(280px, 32%); grid-template-areas: "main exhibits"; }
  .sr-layout[data-outline="none"] .sr-outline { display: none; }
  .sr-layout[data-outline="none"][data-mode="reading"] .sr-main { grid-column: 1 / -1; }
}
.sr-layout[data-mode="reading"] .sr-stage,
.sr-layout[data-mode="reading"] .sr-exhibits { display: none; }
.sr-layout[data-mode="reading"] .sr-main { grid-row: 2 / -1; }
@container sr-reader (min-width: ${WIDE_MIN_PX}px) {
  .sr-layout[data-mode="reading"] .sr-main { grid-row: 1; }
}

/* Narrow exhibit push (spec section 13, R28), both layouts: the exhibit card sits above the stage,
   as tall as its content up to --sr-exhibit-max; the stage moves down by the numbers ui/layout.ts sets. */
@container sr-reader (max-width: ${WIDE_MIN_PX - 1}px) {
  /* The card grows from 0 and shrinks back before it hides, with the stage's 400 ms ease (p5a-r7). */
  .sr-exhibits {
    height: var(--sr-exhibit-height, 0px); visibility: visible;
    transition: height .4s ease, visibility 0s linear 0s;
  }
  .sr-exhibits[data-empty] { visibility: hidden; transition: height .4s ease, visibility 0s linear .4s; }
  .sr-exhibit-body { max-height: none; }
  .sr-reader[data-layout="panel"] .sr-layout { grid-template-rows: auto minmax(0, 1fr); grid-template-areas: "bar" "main"; }
  .sr-reader[data-layout="panel"] .sr-layout[data-outline="none"] { grid-template-rows: minmax(0, 1fr); grid-template-areas: "main"; }
  .sr-reader[data-layout="panel"] .sr-stage { margin-top: var(--sr-stage-push, 0px); transition: margin-top .4s ease; }
  .sr-reader[data-layout="panel"] .sr-exhibits {
    position: absolute; z-index: 2; left: 12px; right: 12px; top: var(--sr-exhibit-top, 96px); max-height: var(--sr-exhibit-max, 40%);
    border: 1px solid var(--sr-border); border-radius: 12px; box-shadow: var(--sr-float-shadow); overflow: hidden;
  }
}

/* Floating layout (spec section 13): no reader background; the outline, the stage and the exhibits
   are separate cards; the space between them is the host's (the browser overlay's faded page). */
.sr-reader[data-layout="floating"] { background: transparent; min-height: 0; }
.sr-reader[data-layout="floating"] .sr-layout { display: block; position: relative; height: 100%; }
.sr-reader[data-layout="floating"] .sr-outline,
.sr-reader[data-layout="floating"] .sr-main,
.sr-reader[data-layout="floating"] .sr-exhibits {
  position: absolute; z-index: 1; background: var(--sr-surface); border: 1px solid var(--sr-border); border-radius: 14px;
  box-shadow: var(--sr-float-shadow); overflow: hidden;
}
.sr-reader[data-layout="floating"] .sr-outline {
  display: flex; left: 18px; top: 50%; transform: translateY(-50%); width: 232px; max-height: 70%; align-self: auto;
}
.sr-reader[data-layout="floating"] .sr-outline-bar { display: none; }
.sr-reader[data-layout="floating"] .sr-main {
  left: 50%; top: 56%; transform: translate(-50%, -50%); width: min(600px, calc(100% - 668px)); max-height: calc(100% - 24px);
}
.sr-reader[data-layout="floating"] .sr-stage { flex: none; min-height: 0; padding: 16px 20px 14px; }
.sr-reader[data-layout="floating"] .sr-exhibits { right: 18px; top: 50%; transform: translateY(-50%); width: 300px; max-height: 70%; border-left: 1px solid var(--sr-border); }
.sr-reader[data-layout="floating"] .sr-layout[data-mode="reading"] .sr-main { top: 50%; height: calc(100% - 48px); width: min(760px, calc(100% - 32px)); }
.sr-reader[data-layout="floating"] .sr-settings-backdrop { padding: 12px; }
.sr-reader[data-layout="floating"] .sr-settings { border: 1px solid var(--sr-border); border-radius: 14px; box-shadow: var(--sr-float-shadow); }
/* Under 1180 px the outline card collapses to the bar and drawer in the stage card's header. */
@container sr-reader (max-width: 1179px) {
  .sr-reader[data-layout="floating"] .sr-outline { display: none; }
  .sr-reader[data-layout="floating"] .sr-outline-bar { display: flex; }
  .sr-reader[data-layout="floating"] .sr-layout[data-outline="none"] .sr-outline-bar { display: none; }
  .sr-reader[data-layout="floating"] .sr-layout[data-drawer="open"] .sr-outline {
    display: flex; z-index: 4; left: 16px; top: 16px; bottom: 16px; transform: none; max-height: none; width: min(320px, calc(100% - 32px));
  }
  .sr-reader[data-layout="floating"] .sr-main { left: calc((100% - 334px) / 2); width: min(600px, calc(100% - 366px)); }
}
@container sr-reader (max-width: ${WIDE_MIN_PX - 1}px) {
  .sr-reader[data-layout="floating"] .sr-main {
    left: 50%; width: min(600px, calc(100% - 32px)); top: var(--sr-stage-top, 30%); transform: translateX(-50%); transition: top .4s ease;
  }
  .sr-reader[data-layout="floating"] .sr-exhibits {
    left: 16px; right: 16px; width: auto; top: var(--sr-exhibit-top, 8px); transform: none; max-height: var(--sr-exhibit-max, 40%);
  }
  /* The stage card hugs its content, so the exhibit card above it gets the room (p5a-r6). */
  .sr-reader[data-layout="floating"] .sr-outline-bar { padding: 6px 10px; }
  .sr-reader[data-layout="floating"] .sr-outline-toggle { padding: 4px 10px; }
  .sr-reader[data-layout="floating"] .sr-toolbar { padding: 4px 10px 4px 16px; }
  .sr-reader[data-layout="floating"] .sr-stage { padding: 8px 14px 10px; }
  .sr-reader[data-layout="floating"] .sr-display { min-height: 0; }
  .sr-reader[data-layout="floating"] .sr-display[data-kind="chunk"], .sr-reader[data-layout="floating"] .sr-display[data-kind="item-chunk"] { height: 96px; }
  .sr-reader[data-layout="floating"] .sr-chunk { line-height: 96px; font-size: calc(38px * var(--sr-scale, 1)); }
  .sr-reader[data-layout="floating"] .sr-axis::before { top: 8px; }
  .sr-reader[data-layout="floating"] .sr-axis::after { bottom: 8px; }
  .sr-reader[data-layout="floating"] .sr-item-counter { top: 2px; }
  .sr-reader[data-layout="floating"] .sr-sentence { min-height: 0; margin-top: 6px; font-size: 15px; }
  .sr-reader[data-layout="floating"] .sr-sentence:empty { display: none; }
  .sr-reader[data-layout="floating"] .sr-card { padding: 12px 16px; }
  .sr-reader[data-layout="floating"] .sr-card-hint { margin-top: 6px; }
  .sr-reader[data-layout="floating"] .sr-dial-row { margin-top: 8px; }
  .sr-reader[data-layout="floating"] .sr-dial { height: 26px; }
}
@media (prefers-reduced-motion: reduce) {
  .sr-reader .sr-stage, .sr-reader .sr-main, .sr-reader .sr-exhibits { transition: none !important; }
}
/* A scroller of the reader's own never hands its wheel on to the page behind (p5a-r3). */
.sr-exhibit-list, .sr-settings, .sr-reading, .sr-expanded-body, .sr-outline-list, .sr-exhibit-body { overscroll-behavior: contain; }
`;
