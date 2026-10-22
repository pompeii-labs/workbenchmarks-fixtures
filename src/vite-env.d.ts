/// <reference types="vite/client" />

interface Window {
  // Test builds only (see src/testHooks.ts); absent from production bundles.
  __THREE_GAME_DIAGNOSTICS__?: Record<string, unknown>;
  __THREE_GAME_TEST_HOOKS__?: Record<string, (...args: never[]) => unknown>;
}
