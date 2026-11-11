import { defineConfig, type Plugin } from 'vite';

// The built site must open straight from disk (file://), where browsers refuse
// ES-module scripts. So the main bundle is emitted as a classic IIFE script and
// the heavy 3D code is a separate classic script (see vite.three.config.ts)
// that is injected only when a 3D figure scrolls near the viewport.
function classicScripts(): Plugin {
  return {
    name: 'classic-scripts',
    apply: 'build',
    enforce: 'post',
    transformIndexHtml(html) {
      return html
        .replace(/<script type="module" crossorigin src="([^"]+)"><\/script>/g, '<script defer src="$1"></script>')
        .replace(/ crossorigin/g, '');
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [classicScripts()],
  build: {
    target: 'es2020',
    emptyOutDir: false,
    modulePreload: false,
    cssCodeSplit: false,
    rolldownOptions: {
      output: { format: 'iife', entryFileNames: 'assets/app-[hash].js' },
    },
  },
});
