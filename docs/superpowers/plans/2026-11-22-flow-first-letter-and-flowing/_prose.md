# Flow first letter and flowing motion — plan

One agentic phase covers both asks of the spec (R1–R7). They share the ribbon renderer, and the
Flowing frame loop drives the same `markBracket` that the first-letter change introduces, so two
phases would mean reviewing the same code twice.

Order inside the phase:

1. pure geometry first (`firstLetter`, `inBracket`);
2. the renderer marks, in Word by word;
3. the render-only setting, so the motion can switch without a timeline rebuild;
4. anchor and slide geometry;
5. the frame loop and the step classification;
6. speech;
7. end-to-end tests and the README.

Unit tests run with `npx vitest run` (jsdom) and e2e with `npm run build && npx playwright test`.
Every behaviour cited here comes from the spec's Design section.
