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

<!-- fr:journal kind=root-cause scope=debug id=707f3542444c created=2026-11-22T07:57:00+00:00 -->
### 707f3542444c · root-cause · Gecko's macOS speech engine: queue jams after cancel, rate scale is off, and every utterance ends with a loud bang

Operator console probes in Zen (Gecko) on macOS, voice Daniel. (1) cancel() mid-utterance: A never fires end or error; B, spoken right after, and C, spoken 4.5 s later, never start; speaking=true and pending=true stay set, and resume(), a second cancel(), and pause+resume+cancel do not recover it. The reader cancels on every WPM change, scrub and jump, which is the stall. Its voice fallback then marks voice after voice as failed ('some voices never play'), and each silent sentence waits two 5 s watchdogs, so no status note shows within the operator's patience. (2) The rate scale differs from Chrome's: a 9-word sentence took 3774 / 1714 / 1330 / 1054 / 785 ms at rates 1 / 1.2 / 1.4 / 1.67 / 2, so the reader's 1.67 at 300 WPM plays about 510 WPM, and the operator heard only each word's first sound. (3) Every utterance end produced a loud bang, at every rate and with no cancel involved. None of this can be fixed from page script; the operator asked that the app and the tests never trigger it.

<!-- fr:journal kind=finding scope=debug id=eb4b547caaeb created=2026-11-22T07:59:21+00:00 state=fixed -->
### eb4b547caaeb · finding [fixed] · Speech is off in Gecko on macOS; the engine is never touched there

speechBlockedReason(userAgent) in packages/core/src/tts.ts recognises Gecko (token 'Gecko/<date>'; Chromium only says 'like Gecko') on macOS; mount.ts passes it to createSpeechDriver as blockedReason, which makes the driver unavailable (no getVoices, speak, cancel or listener) and exposes unavailableReason, shown in Settings with the toggle disabled. Failing tests first: tts.test.ts 'names a reason for Firefox and Zen on macOS, and none elsewhere', 'a blocked driver is unavailable, never touches the engine, and says why', 'an unblocked driver has no reason'; tts-panel.test.ts 'the default driver never speaks, even with speech saved on, and the panel says why' (failed with speak called once under a Zen UA). After the fix: tsc clean, 714 unit tests pass. Acceptance: new row speech-off-gecko-macos (ci); tts-speaks-in-sync back to walk-owed for Chrome and VS Code, to be walked at low volume. Known limit: a Gecko UA spoofed to another OS (resistFingerprinting) is not caught.

<!-- fr:journal kind=review scope=debug id=d356c826e49f created=2026-11-22T07:59:36+00:00 -->
### d356c826e49f · review · Self-review of the fix diff: no findings

Checked: the Firefox reader frame (moz-extension) carries the browser UA, so the block applies there; Chrome and VS Code's Electron UA say only 'like Gecko' and stay unblocked (unit-tested); Firefox on iOS is WebKit without a Gecko/ token; a blocked driver registers no voiceschanged listener and destroy() removes none. Accepted limit, recorded on row speech-off-gecko-macos: a Gecko UA spoofed to another OS is not caught. E2E (Playwright) not run locally: the dev container lacks Chromium's system libraries; CI runs it on the PR.
