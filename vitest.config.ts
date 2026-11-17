import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The browser extension's test-build flag: on in unit tests (see packages/browser-extension/build.mjs).
  define: { __SR_TEST__: 'true' },
  test: {
    include: ['packages/*/src/**/*.test.ts', 'packages/*/test/**/*.test.ts'],
    environment: 'node',
  },
});
