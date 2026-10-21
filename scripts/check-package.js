// The last step of `npm run build`: plain Node, with no bundler, must import every entry point by the package's name,
// and the tarball npm would publish holds dist/, the two licences, the README and package.json, and nothing else.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const { name, exports } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
for (const key of Object.keys(exports)) await import(key === '.' ? name : `${name}/${key.slice(2)}`);
console.log(`node imports all ${Object.keys(exports).length} entry points of ${name}`);

const [{ files }] = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json'], { encoding: 'utf8' }));
const paths = files.map((f) => f.path);
const ROOT = ['LICENSE', 'LICENSE-ART', 'README.md', 'package.json'];
const missing = ROOT.filter((p) => !paths.includes(p));
const extra = paths.filter((p) => !ROOT.includes(p) && !p.startsWith('dist/'));
if (missing.length || extra.length) {
  console.error(`npm pack: missing ${missing.join(', ') || 'nothing'}; unexpected ${extra.join(', ') || 'nothing'}`);
  process.exit(1);
}
console.log(`npm pack holds ${paths.length} files: dist/ and ${ROOT.join(', ')}`);
