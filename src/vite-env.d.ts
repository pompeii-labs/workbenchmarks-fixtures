/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TEST_HOOKS?: string;
}

interface Window {
  __THREE_GAME_DIAGNOSTICS__?: Record<string, unknown>;
  __THREE_GAME_TEST_HOOKS__?: Record<string, (...args: never[]) => unknown>;
}
