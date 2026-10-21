import { defineConfig } from 'vite';
import { devGuard } from './scripts/dev-guard.ts';

// The playground page lives in playground/; it imports engine code from ../src.
export default defineConfig({
  root: 'playground',
  plugins: [devGuard()],
  build: { outDir: '../dist-lab', emptyOutDir: true },
});
