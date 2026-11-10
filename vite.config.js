import { defineConfig } from 'vite';

/**
 * Custom plugin so the built static site runs directly from disk (file://)
 * with NO server as well as from any static HTTP host:
 * - Bundles JS as an IIFE classic script (avoiding file:// CORS blocks on type="module")
 * - Removes crossorigin attributes that can block local file:// loads
 */
function fileProtocolCompatiblePlugin() {
  return {
    name: 'file-protocol-compatible',
    enforce: 'post',
    transformIndexHtml(html) {
      return html
        .replace(/<script type="module" crossorigin/g, '<script defer')
        .replace(/<script type="module"/g, '<script defer')
        .replace(/ crossorigin/g, '');
    },
  };
}

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        format: 'iife',
        name: 'SaunaSolarApp',
        inlineDynamicImports: true,
      },
    },
  },
  plugins: [fileProtocolCompatiblePlugin()],
});
