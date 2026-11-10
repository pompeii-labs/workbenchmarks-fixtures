import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { readFileSync } from "node:fs";

export default defineConfig({
  base: "./",
  plugins: [
    viteSingleFile(),
    {
      name: "embedded-font-licenses",
      transformIndexHtml(html) {
        const licenses = ["dm-sans-OFL.txt", "libre-caslon-display-OFL.txt"]
          .map((file) =>
            readFileSync(
              new URL(`./src/fonts/${file}`, import.meta.url),
              "utf8",
            ),
          )
          .join("\n\n");
        return html.replace(
          "</head>",
          `<!-- Bundled font licenses\n${licenses}\n-->\n</head>`,
        );
      },
    },
  ],
  build: { assetsInlineLimit: 1_000_000 },
});
