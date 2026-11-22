<!-- fr:journal-schema=4 -->
# Journal: 2026-11-22-tts-firefox-noise

<!-- fr:journal kind=repro scope=debug id=8fe1e1bcbb99 created=2026-11-22T07:36:55+00:00 -->
### 8fe1e1bcbb99 · repro · Firefox (Zen) TTS: garbled speech, loud noise at ~1 s, then playback stalls

Operator walk 2026-11-22, Firefox (Zen Browser) on macOS, extension packaged from main ec592f5: with TTS on, the speech is incomprehensible, a loud noise follows after about 1 s, and from then on playback does not advance while TTS stays enabled. Not reproducible in the dev container (no Firefox, no macOS voices).

<!-- fr:journal kind=hypothesis scope=debug id=5b498ae88d04 created=2026-11-22T07:36:56+00:00 -->
### 5b498ae88d04 · hypothesis · Automatic voice resolves to a macOS novelty voice in Firefox

defaultVoice() (packages/core/src/tts.ts) takes the first localService voice whose primary language matches and ignores SpeechSynthesisVoice.default. Firefox on macOS lists all system voices alphabetically, including Apple's novelty en-US voices (Albert, Bad News, Bahh, Bells, Boing, Bubbles, Cellos...), so Automatic resolves to a novelty voice: garbled speech, then a sung or sound-effect 'noise'. Does not yet explain the stall. Evidence asked from the operator: the Automatic voice name in Settings and the en voice list from the Zen console.

<!-- fr:journal kind=ruled-out scope=debug id=15c7a08c6536 created=2026-11-22T07:48:36+00:00 -->
### 15c7a08c6536 · ruled-out · Not a novelty default voice: Automatic is Daniel (default=true)

Operator evidence from Zen's console: the en voice list starts with Daniel (default=true, local), then Karen, Moira, Rishi, Samantha, Tessa, Fred, Junior, Kathy, Ralph. Settings shows 'Automatic: Daniel'. The garbling happens with a normal voice. New operator facts: no status note while stalled; changing WPM while TTS is on leaves playback stuck; some local voices never play at all.
