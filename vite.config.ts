import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { defineConfig } from 'vitest/config';

// SINGLE_FILE=1 bundles everything into one HTML file (handy for sharing a preview).
export default defineConfig({
  plugins: [react(), ...(process.env.SINGLE_FILE ? [viteSingleFile()] : [])],
  test: {
    // The module cache doesn't notice new library files picked up by
    // import.meta.glob, so new devices would silently skip validation.
    fsModuleCache: false,
  },
});
