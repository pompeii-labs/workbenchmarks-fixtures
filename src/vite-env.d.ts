/// <reference types="vite/client" />

declare const __TEST_HOOKS__: boolean;

interface Window {
  __THREE_GAME_DIAGNOSTICS__?: Record<string, unknown> & { frame: number };
  __THREE_GAME_TEST_HOOKS__?: Record<string, (...args: never[]) => unknown>;
}
