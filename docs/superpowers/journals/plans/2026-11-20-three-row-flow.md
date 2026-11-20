<!-- fr:journal-schema=4 -->
# Journal: 2026-11-20-three-row-flow

<!-- fr:journal kind=discovery scope=plan id=shared-reading-mode-persistence created=2026-11-20T07:28:19+00:00 phase=1 -->
### shared-reading-mode-persistence · discovery · Adding the mode to shared Settings covers browser and VS Code persistence paths. (phase 1)

The browser extension persists a complete Settings value through its existing storage key, and VS Code derives flattened configuration keys from DEFAULT_SETTINGS. A single shared readingMode field and normalization therefore preserve old saved values as chunk without host-specific mode logic.

<!-- fr:journal kind=discovery scope=plan id=no-refactor-p1-t1 created=2026-11-20T07:28:19+00:00 phase=1 -->
### no-refactor-p1-t1 · discovery · no-refactor-because P1.T1 (phase 1)

The browser stores already serialize complete Settings objects, while VS Code flattens the shared defaults; using those paths keeps mode normalization centralized.

<!-- fr:journal kind=discovery scope=plan id=no-refactor-p1-t3 created=2026-11-20T07:28:19+00:00 phase=1 -->
### no-refactor-p1-t3 · discovery · no-refactor-because P1.T3 (phase 1)

The selector reuses the panel's shared select/read/apply/save flow, so no redundant control wiring remains.

<!-- fr:journal kind=discovery scope=plan id=no-refactor-p1-t4 created=2026-11-20T07:28:19+00:00 phase=1 -->
### no-refactor-p1-t4 · discovery · no-refactor-because P1.T4 (phase 1)

The browser scenario uses existing openDemo helpers and captures each visual state directly; no separate test-only capture layer was needed.
