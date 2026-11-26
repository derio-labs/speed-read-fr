<!-- fr:journal-schema=4 -->
# Journal: 2026-11-26-word-default-red-toggle-top-dock

<!-- fr:journal kind=discovery scope=plan id=p1-d1 created=2026-11-26T11:27:08+00:00 phase=1 -->
### p1-d1 · discovery · A fresh worktree has no node_modules (phase 1)

npm ci was needed in the workspace before typecheck/test could run.

<!-- fr:journal kind=discovery scope=plan id=p1-d2 created=2026-11-26T11:27:08+00:00 phase=1 -->
### p1-d2 · discovery · handle.applySettings never saves (phase 1)

ReaderHandle.applySettings applies with save=false (host-driven); the panel's path saves. The redLetters live branch saves only when save is true, so the mount test asserts the store save through the panel.

<!-- fr:journal kind=finding scope=plan id=p1-r1 created=2026-11-26T11:31:17+00:00 phase=1 state=open review_scope=in -->
### p1-r1 · finding [open] (reviewer: in scope) · Red letters hint says 'first letter of each word' but in chunk mode it controls the pivot (phase 1)

settings-panel.ts:91; the field shows in both modes.

<!-- fr:journal kind=finding scope=plan id=p1-r2 created=2026-11-26T11:31:17+00:00 phase=1 state=open review_scope=in -->
### p1-r2 · finding [open] (reviewer: in scope) · No test covers the save=false host path for a redLetters change (phase 1)

mount.test.ts:253-272 only exercises the panel save path.

<!-- fr:journal kind=review scope=plan id=p1-review created=2026-11-26T11:31:17+00:00 phase=1 -->
### p1-review · review · phase 1 review: 2 in-scope findings, both fixed (phase 1)

Independent reviewer checked migrations, the live redLetters path, gated CSS (computed colours in Chromium), panel and manifest against spec R1-R3, and drove the UI for the reader-red-letters-toggle row. Findings p1-r1 and p1-r2 fixed with tests in the follow-up commit.

<!-- fr:journal kind=finding scope=plan id=p1-r1-resolved created=2026-11-26T11:31:17+00:00 phase=1 state=fixed resolves=p1-r1 -->
### p1-r1-resolved · finding [fixed] · resolves p1-r1: Red letters hint says 'first letter of each word' but in chunk mode it controls the pivot (phase 1)

Hint is now 'first letters and pivot'; settings-panel test asserts it.

<!-- fr:journal kind=finding scope=plan id=p1-r2-resolved created=2026-11-26T11:31:17+00:00 phase=1 state=fixed resolves=p1-r2 -->
### p1-r2-resolved · finding [fixed] · resolves p1-r2: No test covers the save=false host path for a redLetters change (phase 1)

New mount test: handle.applySettings (save=false) flips data-red-letters and does not save.
