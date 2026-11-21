# Snake flow reading mode — plan

Spec: `docs/superpowers/specs/2026-11-20-snake-flow-design.md`.

Two agentic phases, each one reviewable ask:

1. **Snake ribbon (skeleton).** R1–R7, R10, R12. Opens with the smoke: a `?bottomStage` switch on the
   demo, so every later browser check runs on the layout users actually see (spec review s-r2). Then
   the flow timeline (one word per step, middle-letter rule), a DOM-free ribbon-geometry module, the
   renderer with the braced target and wide window, and Playwright checks on the bottom-stage demo.
2. **Long inline code and chunk limits.** R8–R9 and R11. Depends on phase 1, because the chip has to
   sit on the ribbon's target and an inline stop keeps the ribbon on screen. It adds atom pacing,
   chip tokens and inline exhibits keyed by identity, and lifts the bottom-stage chunk cap with a
   measured fit and wrapping.

Every task is red → green → refactor. Suite commands: `npx vitest run`, `npm run typecheck`,
`npx playwright test`.
