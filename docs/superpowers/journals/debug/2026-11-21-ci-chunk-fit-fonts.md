<!-- fr:journal-schema=4 -->
# Journal: 2026-11-21-ci-chunk-fit-fonts

<!-- fr:journal kind=repro scope=debug id=6d691dd3cf62 created=2026-11-21T15:07:46+00:00 -->
### 6d691dd3cf62 · repro · CI (ubuntu) fails 3 chunk-fit e2e tests that pass on macOS

Run 44912979723: core.spec.ts:926 expects fit >= 33, got 31; core.spec.ts:1121 (floating, panel) expects a chunk of exactly fit=31 chars, shown chunk is 30. Local macOS: fit 36, all green.

<!-- fr:journal kind=ruled-out scope=debug id=c22af62a26f8 created=2026-11-21T15:08:08+00:00 -->
### c22af62a26f8 · ruled-out · Product bug in the measured fit

Fit responds to the platform font as designed (spec R11: capped by what fits). CI's wider default sans-serif gives 31 on a 420px stage vs 36 on macOS; the chunk logic itself is consistent with the measured fit.
