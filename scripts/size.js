// npm run size (M2 spec §13): the core plus the element, bundled and minified as a user's bundler would, at most 25 KB gzip.
import { gzipSync } from 'node:zlib';
import { build } from 'vite';

const LIMIT = 25 * 1024;
// An app build, not library mode: Vite's library mode leaves ES output unminified.
const out = await build({
  configFile: false,
  logLevel: 'error',
  build: { write: false, minify: true, modulePreload: false, rollupOptions: { input: 'dist/element.js', preserveEntrySignatures: 'exports-only' } },
});
const code = [out].flat().flatMap((o) => o.output).filter((c) => c.type === 'chunk').map((c) => c.code).join('');
const gz = gzipSync(code).length;
console.log(`noxy-bots + noxy-bots/element: ${(code.length / 1024).toFixed(1)} KB minified, ${(gz / 1024).toFixed(1)} KB gzip (limit ${LIMIT / 1024} KB): ${gz <= LIMIT ? 'PASS' : 'FAIL'}`);
process.exit(gz <= LIMIT ? 0 : 1);
