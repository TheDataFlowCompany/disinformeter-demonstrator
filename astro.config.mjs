import { defineConfig } from 'astro/config';

// Deploy target: the project's custom domain on GitHub Pages. Override via env
// when hosting elsewhere, e.g. under a sub-path:
//   SITE=https://example.org BASE=/disinformeter npm run build
const SITE = process.env.SITE || 'https://disinformeter.deconspirator.eu';
const BASE = process.env.BASE || '/';

export default defineConfig({
  site: SITE,
  base: BASE,
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  devToolbar: { enabled: false },
  vite: {
    // Skip Vite's eager dependency pre-scan. It is purely a dev startup
    // optimisation and esbuild's scanner mis-parses Astro pages that pair a
    // hoisted <script> with a large template (it dumps a benign red error,
    // though the page transforms and renders fine). With only a couple of
    // static deps here, on-demand optimisation is equivalent and silent.
    optimizeDeps: { noDiscovery: true },
  },
});
