/// <reference types="vite/client" />

declare const __SOLAR_STATIC_BUILD__: boolean;

interface Window {
  __Solar3D?: {
    initAll: () => void;
  };
}
