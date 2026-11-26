<!-- fr:journal-schema=4 -->
# Journal: 2026-11-26-word-default-red-toggle-top-dock

<!-- fr:journal kind=discovery scope=plan id=p1-d1 created=2026-11-26T11:27:08+00:00 phase=1 -->
### p1-d1 · discovery · A fresh worktree has no node_modules (phase 1)

npm ci was needed in the workspace before typecheck/test could run.

<!-- fr:journal kind=discovery scope=plan id=p1-d2 created=2026-11-26T11:27:08+00:00 phase=1 -->
### p1-d2 · discovery · handle.applySettings never saves (phase 1)

ReaderHandle.applySettings applies with save=false (host-driven); the panel's path saves. The redLetters live branch saves only when save is true, so the mount test asserts the store save through the panel.
