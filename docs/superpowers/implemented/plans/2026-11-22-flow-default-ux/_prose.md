# Flow-by-default UX — implementation plan

One agentic phase covering spec R1–R7: the asks share stage.ts, settings.ts and the settings panel,
so one reviewable diff is cheaper than four round trips. Tasks follow the spec's design sections in
order: default (and the chunk-test fallout), migration, focus bracket, WPM stepper, VS Code display
choice, then README and the e2e/screenshot pass. TDD throughout; the full suite runs last.
