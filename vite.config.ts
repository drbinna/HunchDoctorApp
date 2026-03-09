import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },

  optimizeDeps: {
    // vitallens@0.4.x ships a browser bundle that references
    // new Worker(new URL("./worker.js", import.meta.url))
    // but worker.js is not in the published dist/ — Vite's esbuild pre-bundler
    // would crash trying to resolve it. Excluding it from optimizeDeps lets
    // the package load as a native ES module at runtime without pre-bundling.
    //
    // We do NOT import vitallens directly any more; useVitalLens.ts uses
    // MediaRecorder + /api/vitallens-proxy instead. This exclusion remains as
    // a safety net in case any transitive import re-introduces it.
    exclude: ['vitallens'],
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],
})
