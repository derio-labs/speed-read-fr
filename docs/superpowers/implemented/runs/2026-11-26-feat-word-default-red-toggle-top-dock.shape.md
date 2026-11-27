The dock reader (`bottomStage: true`: browser Overlay, Side panel, VS Code panel), top to bottom:

```diff
  .sr-main             toolbar · overall progress
- .sr-stage-support    title / stop / dwell card, then exhibits in document order
  .sr-stage            the reading box, fixed size
+ .sr-stage-support    title / stop / dwell card (kept whole), then exhibits latest-by-position first (list scrolls)
  .sr-outline          floating only: its own left column beside the reading box and cards, ending above the page band
```

What changed in each file. `+` marks what the change adds and `-` what it replaces:

```diff
  packages/core/src/settings.ts                 # Settings, DEFAULT_SETTINGS, normalizeSettings
-   flowMotion: 'flowing'
+   flowMotion: 'word'
+   redLetters: true
  packages/core/src/ui/settings-panel.ts        # the Settings form
+   field('Red letters', 'first letters and pivot', …)
  packages/core/src/ui/mount.ts                 # builds the reader DOM, applies settings, the dock's band
+   sameExceptLive ignores redLetters; live branch sets data-red-letters, saves on save=true
-   stage.before(support)
+   stage.after(support); floating order outline, main, support
+   freeBand(): band starts at the cards' bottom; onBandChange(fn)
  packages/core/src/ui/exhibits.ts              # createExhibits: the exhibit pane and its list
+   newestFirst: latest-by-position first (one direction-aware insert)
  packages/core/src/ui/layout.ts                # FreeBand type, narrow push layout
+   FreeBand doc: the dock's band lies below the reader's cards
  packages/core/src/ui/styles.ts                # reader stylesheet, incl. the [data-bottom-stage] dock grid
+   accents gated on .sr-reader:not([data-red-letters="off"])
+   floating grid rows auto auto minmax(0,1fr), columns auto (Contents) minmax(0,1fr); details flex 0 0 auto; drawer rows 2-4
  packages/browser-extension/src/storage.ts     # storage.local store + one-time migrations
+   MIGRATIONS list: flow-default, word-motion-default (one write)
  packages/browser-extension/src/reader-entry.ts  # Overlay: page fade, follow, scroll band
-   setBandBottom(fn)
+   setBandTop(fn), refollow(), place(); scroll-padding-top on the scroller (restored on close)
-   place(): window bottom clipped to the band bottom
+   place(): window top clipped to the band top
-   belowChrome scan limit innerHeight × 0.6
+   belowChrome scan limit start + innerHeight × 0.6
  packages/vscode-extension/package.json        # speedRead.* configuration manifest
+   speedRead.flowMotion default "word"; speedRead.redLetters
```
