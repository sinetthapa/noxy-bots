import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));
// Studio tests import noxy-bots by name: point it at src/, never a stale dist/ (M3 spec §5.1).
export default defineConfig({
  resolve: {
    alias: [
      { find: /^noxy-bots\/element$/, replacement: at('./src/element.ts') },
      { find: /^noxy-bots\/react$/, replacement: at('./src/react.ts') },
      { find: /^noxy-bots$/, replacement: at('./src/index.ts') },
      { find: /^noxy-src\//, replacement: at('./src/') },
      { find: /^@\//, replacement: at('./studio/src/') },
    ],
  },
  test: { include: ['src/**/*.test.ts', 'scripts/**/*.test.ts', 'studio/**/*.test.{ts,tsx}', 'site/**/*.test.{ts,tsx}'] },
});
