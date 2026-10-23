import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 120_000,
  expect: { timeout: 90_000 },
  workers: 1,
  use: {
    baseURL: "http://localhost:4175",
    viewport: { width: 1000, height: 700 },
    launchOptions: {
      ...(process.env.CHROMIUM_PATH
        ? { executablePath: process.env.CHROMIUM_PATH }
        : {}),
      args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl"],
    },
  },
  webServer: {
    command: "npm run build && npm run preview -- --port 4175 --strictPort",
    url: "http://localhost:4175",
    reuseExistingServer: !process.env.CI,
  },
});
