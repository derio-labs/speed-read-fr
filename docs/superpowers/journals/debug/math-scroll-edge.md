<!-- fr:journal-schema=4 -->
# Journal: math-scroll-edge

<!-- fr:journal kind=repro scope=debug id=6324d59a4230 created=2026-11-19T11:05:23+00:00 -->
### 6324d59a4230 · repro · Chromium reports both clipped edges at far-right scroll

Repro: run npm run test:e2e -- --grep "a wider one stops at 0.6". In tests/e2e/webview.spec.ts, the test sets the second .katex-display scrollLeft to scrollWidth then polls data-clip. It times out with expected left, received both. Setup uses Chromium and CSS zoom=0.6.

<!-- fr:journal kind=finding scope=debug id=5a7f2b7e19fe created=2026-11-19T11:10:59+00:00 state=open -->
### 5a7f2b7e19fe · finding [open] · Not reproduced in isolated Chromium environment

The isolated Linux ARM64 container uses Playwright Chromium 153.0.8010.12. The failing test passed once and then passed five consecutive repeats. The original failure was on the host Chromium run, so the platform-specific condition is not understood and no root cause or fix is confirmed. Keep the issue open pending host-side reproduction and metrics.

<!-- fr:journal kind=hypothesis scope=debug id=eba9c6ba71fd created=2026-11-19T14:26:01+00:00 -->
### eba9c6ba71fd · hypothesis · Failure is platform-dependent, not a Chromium version mismatch

The operator reproduced the failure on macOS with Chromium 153.0.8010.12. The same test passed six times in isolated Linux ARM64 Chromium 153.0.8010.12. This rules out a simple browser-version mismatch but does not yet distinguish scroll metrics, scroll clamping, or event delivery. Added a temporary diagnostic assertion to report clip, scrollLeft, scrollWidth, clientWidth, maxScrollLeft, zoom, and devicePixelRatio on failure; awaiting the Mac measurements.

<!-- fr:journal kind=finding scope=debug id=a0aa15517477 created=2026-11-19T14:27:45+00:00 state=open -->
### a0aa15517477 · finding [open] · Mac diagnostic blocked by Linux node_modules

The operator ran the instrumented test from the worktree on macOS, but the webServer failed before Playwright started: node_modules/esbuild contains @esbuild/linux-arm64 and lacks @esbuild/darwin-arm64. npm ci was run inside the Linux container against the bind-mounted worktree, so its node_modules is shared with and incompatible with host macOS. Run npm ci on the Mac in this worktree before retrying the diagnostic. This is setup evidence, not the original scroll root cause.

<!-- fr:journal kind=finding scope=debug id=e23427527ddd created=2026-11-19T14:29:42+00:00 state=open -->
### e23427527ddd · finding [open] · Mac repro confirmed after native dependency reinstall

After npm ci on the Mac fixed the Linux esbuild binary issue, the instrumented test again failed with clip=both on Chromium 153.0.8010.12. Playwright toMatchObject only reported the mismatching clip field, so the diagnostic now logs the last complete scroll state explicitly on failure.

<!-- fr:journal kind=root-cause scope=debug id=26851efeadec created=2026-11-19T14:35:50+00:00 -->
### 26851efeadec · root-cause · Fractional scrollLeft falls just outside the end tolerance

Mac Chromium 153 at zoom 0.6 clamps scrollLeft to 1964.9998779296875 while scrollWidth=2557 and clientWidth=591 (maxScrollLeft=1966). updateClip compares scrollLeft + clientWidth against scrollWidth - 1, requiring scrollLeft >= 1965. The subpixel fractional clamp is 0.000122 below that threshold, so atEnd remains false and the clip is reported as both. Linux Chromium reports a position that passes the same check.

<!-- fr:journal kind=finding scope=debug id=72a94cf28275 created=2026-11-19T14:47:14+00:00 state=fixed -->
### 72a94cf28275 · finding [fixed] · Round fractional end-edge before classifying clip

Changed updateClip in packages/vscode-extension/src/webview/fit.ts to round scrollLeft + clientWidth before comparing against the integer scrollWidth with the existing 1 px tolerance. The existing wide-equation e2e regression passed on the operator Mac with Chromium 153.0.8010.12. npm test passed: 624 passed, 7 skipped. Full e2e suite is still running.

<!-- fr:journal kind=finding scope=debug id=e8f3191a8225 created=2026-11-19T14:50:44+00:00 state=open -->
### e8f3191a8225 · finding [open] · Full Linux e2e run still fails after the Mac rounding fix

A complete e2e run in the isolated worktree passed 74 of 75 tests but still failed the wide-equation far-right clipping assertion under Linux Chromium, despite the Mac targeted test passing with the Math.round change. The failing test now temporarily logs scrollLeft, scrollWidth, clientWidth, rounded right edge, zoom, and devicePixelRatio. A five-repeat targeted Linux run is collecting the failing measurement before another fix is considered.

<!-- fr:journal kind=finding scope=debug id=5a7f2b7e19fe-resolved created=2026-11-19T14:54:45+00:00 state=fixed resolves=5a7f2b7e19fe -->
### 5a7f2b7e19fe-resolved · finding [fixed] · resolves 5a7f2b7e19fe: Not reproduced in isolated Chromium environment

Host reproduction and metrics later confirmed the subpixel scroll-end condition; the fractional-edge comparison now passes the Mac regression test.

<!-- fr:journal kind=finding scope=debug id=a0aa15517477-resolved created=2026-11-19T14:55:01+00:00 state=fixed resolves=a0aa15517477 -->
### a0aa15517477-resolved · finding [fixed] · resolves a0aa15517477: Mac diagnostic blocked by Linux node_modules

Installed Mac-native dependencies with npm ci in the worktree; the instrumented Mac run then reached the original assertion and exposed the scroll metrics.

<!-- fr:journal kind=finding scope=debug id=e23427527ddd-resolved created=2026-11-19T14:55:13+00:00 state=fixed resolves=e23427527ddd -->
### e23427527ddd-resolved · finding [fixed] · resolves e23427527ddd: Mac repro confirmed after native dependency reinstall

After recording the Mac scroll metrics and adjusting the edge comparison, the same Mac Chromium 153 test passed.

<!-- fr:journal kind=finding scope=debug id=e8f3191a8225-resolved created=2026-11-19T14:57:04+00:00 state=fixed resolves=e8f3191a8225 -->
### e8f3191a8225-resolved · finding [fixed] · resolves e8f3191a8225: Full Linux e2e run still fails after the Mac rounding fix

After the isolated suite was run alone, all 75 e2e tests passed with the edge-rounding fix. The targeted test also passed repeatedly; the repeat run failures after two passes were separate test-server connection refusals.

<!-- fr:journal kind=review scope=debug id=c68c657f6554 created=2026-11-19T15:02:14+00:00 -->
### c68c657f6554 · review · Reviewed the fractional scroll-edge fix

Reviewed updateClip rounding and the existing wide-equation e2e assertion. The change is limited to classifying the right-edge position against integer scroll dimensions; no additional findings.
