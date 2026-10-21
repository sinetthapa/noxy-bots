import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { devGuard } from '../scripts/dev-guard.ts';

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));
// The studio imports noxy-bots by name; these aliases point it at src/, so it never needs a package build (M3 spec §5.1).
export default defineConfig({
  root: at('.'),
  base: './',
  plugins: [react(), tailwindcss(), devGuard()],
  resolve: {
    alias: [
      { find: /^noxy-bots\/element$/, replacement: at('../src/element.ts') },
      { find: /^noxy-bots\/react$/, replacement: at('../src/react.ts') },
      { find: /^noxy-bots$/, replacement: at('../src/index.ts') },
      { find: /^noxy-src\//, replacement: at('../src/') }, // the package's internals, for studio/src/animation only (M4 spec §8)
      { find: /^@\//, replacement: at('./src/') },
    ],
  },
  build: { outDir: at('../dist-studio'), emptyOutDir: true },
});
