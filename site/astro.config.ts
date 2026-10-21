// The Noxy website (M5 spec §4): static Astro pages, the studio as a React island, Tailwind v4 through Vite.
import { fileURLToPath } from 'node:url';
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';
import { devGuard } from '../scripts/dev-guard.ts';

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));
// The same aliases as studio/vite.config.ts: the site imports the studio and noxy-bots from source.
export default defineConfig({
  site: 'https://noxybots.com',
  outDir: '../dist-site',
  build: { format: 'file' }, // /studio → studio.html: no trailing-slash redirect on Cloudflare, links match the canonical
  integrations: [react(), mdx()],
  markdown: { syntaxHighlight: false }, // docs code blocks use highlight() (snippets.ts), like the studio and the landing
  vite: {
    plugins: [tailwindcss(), devGuard()],
    resolve: {
      alias: [
        { find: /^noxy-bots\/element$/, replacement: at('../src/element.ts') },
        { find: /^noxy-bots\/react$/, replacement: at('../src/react.ts') },
        { find: /^noxy-bots$/, replacement: at('../src/index.ts') },
        { find: /^noxy-src\//, replacement: at('../src/') },
        { find: /^@\//, replacement: at('../studio/src/') },
      ],
    },
  },
});
