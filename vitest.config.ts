import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The browser extension's test-build flag: on in unit tests (see packages/browser-extension/build.mjs).
  define: { __SR_TEST__: 'true' },
  resolve: {
    // The VS Code extension's providers and commands run against a stub `vscode` module.
    alias: { vscode: fileURLToPath(new URL('./packages/vscode-extension/src/test/vscode-stub.ts', import.meta.url)) },
  },
  test: {
    include: ['packages/*/src/**/*.test.ts', 'packages/*/test/**/*.test.ts', 'tests/*.test.ts'],
    environment: 'node',
  },
});
