# Word-by-word default, Red letters toggle, reading box on top: plan

Spec: `2026-11-26-word-default-red-toggle-top-dock-design.md`.

The plan has two agentic phases, one per independently reviewable ask:

1. **Settings (R1–R3).** Word by word becomes the default and saved browser settings migrate
   once. The new Red letters setting goes through the live (no-rebuild) settings path, with CSS
   that gates the accent rules instead of overriding them. This phase is the skeleton, so its
   first task is the smoke check: the unchanged suite must be green.
2. **Top dock (R4–R6).** It depends on phase 1. Exhibits are inserted newest first, the dock DOM
   and grid flip, the page band moves below the cards and re-follows when they change, and the
   e2e geometry tests are rewritten to match.

No manual phase. The VS Code panel walk is a Test Plan line (the row stays `walk-owed`).
