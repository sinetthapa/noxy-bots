// The docs (M5 spec §6): Demo attributes checked like a studio link, page paths, the Markdown copies and llms.txt.
import { NAMES } from 'noxy-bots';
import { snippet } from '../../studio/src/snippets.ts';
import type { StudioState } from '../../studio/src/state.ts';
import { parse, PARAMS } from '../../studio/src/url.ts';

export interface DocPage {
  id: string;
  title: string;
  description: string;
  order: number;
}

/** A Demo's attrs ("state=thinking theme=mint"), read by the studio's allowlist. parse() never throws and skips names it doesn't
 *  know, so this throws (failing the build) on an unknown name, a repeat, a missing value, or a value parse() put in `ignored`. */
export function demoState(attrs: string): StudioState {
  const pairs = attrs.trim() ? attrs.trim().split(/\s+/).map((t) => t.split('=')) : [];
  const seen = new Set<string>();
  for (const p of pairs) {
    if (p.length !== 2 || !p[1] || !(PARAMS as readonly string[]).includes(p[0]) || seen.has(p[0])) throw new Error(`Demo: bad attribute "${p.join('=')}" in attrs="${attrs}"`);
    seen.add(p[0]);
  }
  const { state, ignored } = parse(new URLSearchParams(pairs as [string, string][]).toString());
  if (ignored.length) throw new Error(`Demo: bad value for ${ignored.join(', ')} in attrs="${attrs}"`);
  return state;
}

/** Ids for each Demo's code tabs; unique within a build, so within a page. */
let demos = 0;
export const nextId = (): string => `demo-${++demos}`;

/** Headings start lower case (the 2026-10-13 brand decisions), except an acronym: "API reference" stays. */
export const heading = (title: string): string => (/^[A-Z]{2}/.test(title) ? title : title[0].toLowerCase() + title.slice(1));

export const pagePath = (id: string): string => (id === 'index' ? '/docs' : `/docs/${id}`);
export const mdPath = (id: string): string => `/docs/${id}.md`;
export const byOrder = (a: DocPage, b: DocPage): number => a.order - b.order;

const DEMO = /^<Demo attrs="([^"]*)" \/>$/;
const CHIPS = /^<StateChips layer="(base|activity|emotion|event)" \/>$/;

/** A page's Markdown copy (M5 spec §6.3): frontmatter, then the MDX body with each component line as plain Markdown. Any other
 *  component (a `<` and a capital outside code) throws, so no .md copy ships raw JSX. */
export function toMarkdown(page: Pick<DocPage, 'title' | 'description'>, body: string): string {
  let fenced = false;
  const lines = body.split('\n').map((line) => {
    if (line.startsWith('```')) fenced = !fenced;
    if (fenced || line.startsWith('```')) return line;
    let m = DEMO.exec(line);
    if (m) return '```html\n' + snippet(demoState(m[1]), 'html') + '\n```';
    if ((m = CHIPS.exec(line))) return NAMES[m[1] as keyof typeof NAMES].map((n) => `\`${n}\``).join(', ');
    if (/<[A-Z]/.test(line.replace(/`[^`]*`/g, ''))) throw new Error(`docs: "${line.trim()}" has no Markdown form; put <Demo attrs="…" /> or <StateChips layer="…" /> on a line of its own`);
    return line;
  });
  return `---\ntitle: ${JSON.stringify(page.title)}\ndescription: ${JSON.stringify(page.description)}\n---\n\n${lines.join('\n')}`;
}

/** /llms.txt in the llmstxt.org format: the site, a summary, then every docs page's Markdown copy. */
export function llmsTxt(pages: DocPage[], site: URL): string {
  const list = [...pages].sort(byOrder).map((p) => `- [${p.title}](${new URL(mdPath(p.id), site)}): ${p.description}`);
  return `# noxybots\n\n> Nox, a little animated open-source bot for your UI: the noxy-bots package gives you a <noxy-bot> element, a React component and a JS API, and the free studio at ${new URL('/studio', site)} makes a look and exports it.\n\n## Docs\n\n${list.join('\n')}\n`;
}
