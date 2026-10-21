// The package as npm will get it (M5 spec §10.2), and every link to the public repo pointing at the same one.
import { describe, expect, it } from 'vitest';
import { nox } from '../src/index.ts';
import { LINKS } from '../site/src/site.ts';
import pkg from '../package.json';

const REPO = 'https://github.com/sinetthapa/noxy-bots';

describe('package.json', () => {
  // No version pin: the Changesets Version PR sets 0.1.0, and CI must pass on it.
  it('is publishable: public, MIT and CC BY 4.0, with both licence files, provenance on', () => {
    expect(pkg).not.toHaveProperty('private');
    expect(pkg.license).toBe('(MIT AND CC-BY-4.0)'); // the code is MIT, the art in dist/ is CC BY 4.0
    expect(pkg.files).toEqual(['dist', 'LICENSE', 'LICENSE-ART']);
    expect(pkg.publishConfig).toEqual({ access: 'public', provenance: true });
  });

  it('every link to the repo names sinetthapa/noxy-bots', () => {
    expect(pkg.repository.url).toBe(`git+${REPO}.git`);
    expect(pkg.bugs).toBe(`${REPO}/issues`);
    expect(LINKS.github).toBe(REPO);
    expect(nox.license.source).toBe(REPO);
  });
});
