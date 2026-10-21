import { defineConfig } from 'vite';
import { devGuard } from '../scripts/dev-guard.ts';

// The example pages import noxy-bots by its own name, which resolves through package.json "exports" to dist/.
export default defineConfig({ root: 'examples', plugins: [devGuard()] });
