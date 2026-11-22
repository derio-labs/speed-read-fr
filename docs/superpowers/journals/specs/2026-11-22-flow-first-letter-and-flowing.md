<!-- fr:journal-schema=4 -->
# Journal: 2026-11-22-flow-first-letter-and-flowing

<!-- fr:journal kind=discovery scope=spec id=operator-brief created=2026-11-22T16:23:10+00:00 input=true -->
### operator-brief · discovery · Operator brief (verbatim)

two changes: 1. in the three row flow mode, the first letter of each word becomes red as soon as it enters inside the red brackets and remains so as long as any part of the word remains inside the brackets. 2. add a modifier to the three row flow mode, word-based vs flowing. The word-based is the current one, the flowing is the same speed but continuous, flowing, without stopping for each word.

<!-- fr:journal kind=decision scope=spec id=d1-flowing-pace created=2026-11-22T16:23:10+00:00 decided_by=operator -->
### d1-flowing-pace · decision · Flowing pace: per-word timing

The ribbon slides continuously over each word's own scheduled time (handover point to handover point); average speed equals WPM, pauses become slowdowns. Decided by the operator (recommended option).

<!-- fr:journal kind=decision scope=spec id=d2-motion-control created=2026-11-22T16:23:10+00:00 decided_by=operator -->
### d2-motion-control · decision · Control: Settings field 'Flow motion', default Flowing

A Flow motion select (Word by word / Flowing) in Settings, saved per host (speedRead.flowMotion in VS Code). Operator chose the recommended field but with Flowing as the default.

<!-- fr:journal kind=decision scope=spec id=d3-speech-reduced-motion created=2026-11-22T16:23:10+00:00 decided_by=operator -->
### d3-speech-reduced-motion · decision · Flowing keeps flowing with speech; reduced motion falls back to word steps

With speech on, each spoken/estimated boundary starts a slide toward the next word over its estimated time; reduced motion behaves like Word by word. Decided by the operator.

<!-- fr:journal kind=decision scope=spec id=d4-verification created=2026-11-22T16:23:10+00:00 decided_by=operator -->
### d4-verification · decision · Verification: unit + Playwright, developer gate

Unit tests and Playwright before merge with PR screenshots; developer gate; no post-merge steps. Decided by the operator (recommended option).

<!-- fr:journal kind=decision scope=spec id=d5-which-words created=2026-11-22T16:23:10+00:00 decided_by=operator -->
### d5-which-words · decision · Every middle-row word overlapping the bracket gets its first letter/digit red

Follows the brief's explicit "each word"; the letter is the first letter or digit (same alphabet as middleLetter), red not bold. Author's call from the brief text.
