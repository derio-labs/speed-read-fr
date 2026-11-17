# Structure-aware speed reader: implementation plan

Spec: `docs/superpowers/specs/2026-11-17-structure-aware-speed-reader-design.md`. The spec is the contract; this plan orders the work and names the tests.

## Shape

Five agentic phases, each one ask of the brief:

1. **Engine** (skeleton). Workspace, toolchain, MIT license, CI workflow, then the pure logic of the core: settings, text (sentences, chunks, ORP), timeline, pacing, player on a fake clock. No DOM.
2. **Extraction and UI.** The single DOM-to-document extractor and the three-zone reader UI, a demo page, and the first browser-level tests. First phase with visual evidence.
3. **Browser extension.** One MV3 source tree, Chrome and Firefox manifests, always-on content script for Alt-hover, on-demand reader injection, containers, slotted clones that keep page styling, overlay and dock. Tested with the built extension in Chromium.
4. **VS Code extension.** Commands, CodeLens, hover, webview rendering with markdown-it, KaTeX and Mermaid, cursor follow. Depends only on phase 2.
5. **Text-to-speech, README, packaging.** The bonus feature last, then the install documentation and the three packaged artifacts in CI.

## Conventions for every phase

- Test-first: each task's first step writes failing tests and sees them fail; the second makes them pass; the third refactors or records why not.
- Unit tests: `npm test`. Browser-level: `npm run test:e2e` with `@playwright/test` 1.63.0 and `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers` (never `playwright install` locally). Loading the extension needs the full Chromium via `launchPersistentContext`.
- Nothing may issue a network request at run time; browser-level tests fail on any request that is not to localhost.
- Test documents under `tests/fixtures/` are our own. No page captured from a chat site exists; adapter tests use minimal markup marked synthetic, and real-site behaviour is a live row.
- Visual evidence goes to the git-ignored `.visual/phase-N/` through `scripts/capture-visual.mjs`.
- `fr services` reports `ci none` for this run, so each phase's evidence is the local suite log, written outside the repository after the last code commit.

## Not in this plan

The five `verify: live` rows (chat sites, Chrome physical entry points, Firefox, VS Code in a real window, speech in sync) are the operator's post-merge walk in the spec's Test Plan. There is no manual phase.
