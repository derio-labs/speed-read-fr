<!-- fr:journal-schema=4 -->
# Journal: stable-reader-dock

<!-- fr:journal kind=root-cause scope=debug id=04a61c239d29 created=2026-11-19T19:55:54+00:00 -->
### 04a61c239d29 · root-cause · Content-driven stage geometry and speech fallback

The browser stage reads layout each chunk and shrinks or wraps on overflow, then rerenders sentence context that changes its height. An exhibit pushes the stage; a speech boundary timeout renders a whole sentence. Overlay follow aims in viewport coordinates without accounting for the visible scrollport and sticky page chrome.

<!-- fr:journal kind=repro scope=debug id=0ecebcb63b87 created=2026-11-19T20:00:16+00:00 -->
### 0ecebcb63b87 · repro · Pin the reported motion and whole-sentence speech

Regression coverage uses a Markdown-like preview with fixed chrome, a nested scroll area, long inline code, chapter and table. The first Chromium run was blocked by missing container browser libraries; installed them in the disposable workspace. Speech fake-clock cases reproduced both missing chunk timing and lack of an alternate voice on synthesis startup error.

<!-- fr:journal kind=finding scope=debug id=e3689a4bd643 created=2026-11-19T20:06:05+00:00 state=fixed -->
### e3689a4bd643 · finding [fixed] · Fixed geometry, clipped source highlight and chunk-based speech fallback

The browser uses a fixed stage and distinct support area; CSS aligns chunks without per-word geometry measurement or resizing. Overlay follow aims below page chrome and clamps the highlight to the visible area above support cards. Speech uses an estimate when there are no timings, tries another same-language local voice on startup errors, and switches to timed text at the same chunk on failure. Chromium fixtures and fake speech cover the changed paths.
