<!-- fr:journal-schema=4 -->
# Journal: 2026-11-21-ci-chunk-fit-fonts

<!-- fr:journal kind=repro scope=debug id=6d691dd3cf62 created=2026-11-21T15:07:46+00:00 -->
### 6d691dd3cf62 · repro · CI (ubuntu) fails 3 chunk-fit e2e tests that pass on macOS

Run 44912979723: core.spec.ts:926 expects fit >= 33, got 31; core.spec.ts:1121 (floating, panel) expects a chunk of exactly fit=31 chars, shown chunk is 30. Local macOS: fit 36, all green.

<!-- fr:journal kind=ruled-out scope=debug id=c22af62a26f8 created=2026-11-21T15:08:08+00:00 -->
### c22af62a26f8 · ruled-out · Product bug in the measured fit

Fit responds to the platform font as designed (spec R11: capped by what fits). CI's wider default sans-serif gives 31 on a 420px stage vs 36 on macOS; the chunk logic itself is consistent with the measured fit.

<!-- fr:journal kind=root-cause scope=debug id=68644bec380b created=2026-11-21T15:08:09+00:00 -->
### 68644bec380b · root-cause · Two e2e tests hard-code macOS font metrics

core.spec.ts:935 requires fit >= 33 so its fixed 35-char sentence fits; core.spec.ts:1136 builds the 'exactly fit' chunk with 'the quick brown fox…'.slice(0, fit), which ends on a space (trimmed → fit-1) when fit = 31. Both pass only where fit happens to be 36.

<!-- fr:journal kind=finding scope=debug id=4b5614bd53bf created=2026-11-21T15:10:02+00:00 state=fixed -->
### 4b5614bd53bf · finding [fixed] · Chunk-fit e2e tests made font-independent

e60a61c: the 6-word test builds 'we saw the old oak <word>' of exactly the effective limit; the exact-fit test pads a space-ending cut with a letter; floors 33/30 → 20. Verified under the native font, Verdana and Courier New (fits 36 / lower / 27), and still red under the 0.75x probe mutation.

<!-- fr:journal kind=finding scope=debug id=d-r1 created=2026-11-21T15:13:13+00:00 state=open review_scope=out -->
### d-r1 · finding [open] (reviewer: out of scope) · Exact-fit test text would split by word count where fit > ~42

core.spec.ts:1138: short words, chunkWords capped at 10, so a platform with fit > 42 would end the chunk by word count. No current platform hits it (macOS 36, Ubuntu 31). A long-word text was tried and reverted: the chunk centres on its ORP letter, so uneven long words drop the scale below 0.9 — the test's text needs a balanced pivot as well as length.

<!-- fr:journal kind=review scope=debug id=67682a95d31a created=2026-11-21T15:13:14+00:00 -->
### 67682a95d31a · review · Independent review of e60a61c: root cause confirmed, 1 out-of-scope finding

A separate reviewer confirmed the root cause (fit 31 vs 36; the 33 floor and the space-ending slice), that both tests still assert their original intent (stricter: toHaveText proves no split), and no new flakiness. Raised d-r1 (out): hypothetical split above fit 42. Full suite after e60a61c: typecheck clean, vitest 711 passed / 7 skipped, Playwright 108 passed.
