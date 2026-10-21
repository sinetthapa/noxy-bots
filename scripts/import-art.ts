// npm run import-art: src/character/nox/art/*.svg → src/character/nox/parts.gen.ts.
// Runs on Node's built-in type stripping (erasable TS only). Not in tsc's include: there's no @types/node.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateParts } from '../src/character/import.ts';

const dir = join(import.meta.dirname, '../src/character/nox');
const frame: [number, number, number, number] = [-180, -60, 985, 830]; // Nox's frame (viewBox); every body and side is drawn on it
const names = readdirSync(join(dir, 'art')).filter((f) => f.endsWith('.svg')).sort();
writeFileSync(join(dir, 'parts.gen.ts'), generateParts(names.map((f) => [f, readFileSync(join(dir, 'art', f), 'utf8')]), frame));
console.log(`parts.gen.ts written from ${names.length} art files`);
