// <noxy-bot>: importing this module registers the element (M2 spec §9). On a server it does nothing.
import { HEX, pick } from './character/look.ts';
import { DEFAULT_LOOK, nox } from './character/nox/index.ts';
import { fail, NAMES } from './commands.ts';
import { createBot, type Bot, type BotOptions, type LookPatch, type Motion } from './index.ts';
import { DIALS, isPersonality, PERSONALITIES, type Personality } from './brain/personality.ts';
import type { ThemeBase } from './character/types.ts';

export interface NoxyBotElement extends HTMLElement {
  /** The live bot, or null while the element is not on the page. */
  readonly bot: Bot | null;
  /** A look from JS, e.g. a custom theme; look attributes win over it. */
  look: LookPatch | undefined;
}
declare global {
  interface HTMLElementTagNameMap {
    'noxy-bot': NoxyBotElement;
  }
}

const PARTS = { theme: 'themes', body: 'body', ears: 'ears', eyes: 'eyes', bolts: 'bolts' } as const;
const SIZES = { 'eye-size': 'eye', 'eye-spacing': 'eyeSpacing', 'ear-size': 'ear', 'bolt-size': 'bolt' } as const;
const MOTIONS: readonly Motion[] = ['auto', 'full', 'calm', 'still'];
const COLORS = { 'color-shell': 'shell', 'color-screen': 'screen', 'color-eye': 'eye', 'color-accent': 'accent', 'color-mouth': 'mouth' } as const;
const ATTRS = ['state', ...Object.keys(PARTS), ...Object.keys(SIZES), ...Object.keys(COLORS), 'personality', ...DIALS, 'seed', 'speed', 'motion', 'fps', 'label'];
const CSS = `:host{display:inline-block;width:120px;aspect-ratio:${nox.frame[2]} / ${nox.frame[3]}}svg{display:block}`;
type Parsed = string | number;

function number(name: string, raw: string, lo: number, hi: number, int = false): number {
  const v = raw.trim() === '' ? NaN : Number(raw);
  if (!(v >= lo && v <= hi) || (int && !Number.isInteger(v))) fail(`${name}="${raw}" must be ${int ? 'an integer' : 'a number'} from ${lo} to ${hi}`);
  return v;
}

/** One attribute's value, checked; throws a noxy-bots: message naming it. */
function parse(name: string, raw: string): Parsed {
  if (name === 'state') {
    const all = Object.values(NAMES).flat() as string[];
    return all.includes(raw) ? raw : fail(`unknown state "${raw}"; valid: ${all.join(', ')}`);
  }
  if (name in PARTS) {
    const list = name === 'theme' ? nox.themes : nox.parts[PARTS[name as keyof typeof PARTS] as keyof typeof nox.parts];
    return pick(list as { id: string }[], raw, name).id;
  }
  if (name in SIZES) return number(name, raw, 0.7, 1.3);
  if (name in COLORS) return HEX.test(raw) ? raw : fail(`${name}="${raw}" must be a colour like #fa6c2e`);
  if (name === 'personality') return isPersonality(raw) ? raw : fail(`personality="${raw}" must be one of ${Object.keys(PERSONALITIES).join(', ')}`);
  if ((DIALS as readonly string[]).includes(name)) return number(name, raw, 0, 2);
  if (name === 'seed') return number(name, raw, 0, 4294967295, true);
  if (name === 'speed') return number(name, raw, 0.1, 4);
  if (name === 'fps') return number(name, raw, 1, 60, true);
  if (name === 'motion') return (MOTIONS as string[]).includes(raw) ? raw : fail(`motion="${raw}" must be one of ${MOTIONS.join(', ')}`);
  return raw; // label
}

if (typeof HTMLElement !== 'undefined' && !customElements.get('noxy-bot')) {
  customElements.define(
    'noxy-bot',
    class extends HTMLElement implements NoxyBotElement {
      static observedAttributes = ATTRS;
      #bot: Bot | null = null;
      #look: LookPatch | undefined;
      #good = new Map<string, Parsed>(); // the last good value of each attribute
      #warned = new Set<string>();

      constructor() {
        super();
        const root = this.attachShadow({ mode: 'open' });
        if ('adoptedStyleSheets' in root && typeof CSSStyleSheet !== 'undefined' && 'replaceSync' in CSSStyleSheet.prototype) {
          const sheet = new CSSStyleSheet();
          sheet.replaceSync(CSS);
          root.adoptedStyleSheets = [sheet];
        } else root.append(Object.assign(document.createElement('style'), { textContent: CSS })); // Safari < 16.4
        // A look set before this element upgraded sits on the instance and would hide the accessor.
        if (Object.hasOwn(this, 'look')) {
          const look = (this as { look?: LookPatch }).look;
          delete (this as { look?: LookPatch }).look;
          this.look = look;
        }
      }

      get bot(): Bot | null {
        return this.#bot;
      }
      get look(): LookPatch | undefined {
        return this.#look;
      }
      set look(look: LookPatch | undefined) {
        const before = this.#look;
        this.#look = look;
        try {
          this.#bot?.update({ look: this.#fullLook() });
        } catch (e) {
          this.#look = before;
          this.#warn(e);
        }
      }

      /** Warns once per key: a callback can't throw (the page would see it), and a repeated bad value shouldn't flood the console. */
      #warn(e: unknown, key = (e as Error).message): void {
        if (!this.#warned.has(key)) console.warn((e as Error).message);
        this.#warned.add(key);
      }

      /** Reads one attribute into #good; a bad value warns once and keeps the last good one. */
      #read(name: string): boolean {
        const raw = this.getAttribute(name);
        if (raw === null) return this.#good.delete(name), true;
        try {
          this.#good.set(name, parse(name, raw));
          return true;
        } catch (e) {
          this.#warn(e, `${name}=${raw}`);
          return false;
        }
      }

      /** DEFAULT_LOOK ← the look property ← the look attributes; colour attributes go over the underlying theme's base. */
      #fullLook(): LookPatch {
        const g = this.#good;
        const parts = Object.fromEntries(Object.keys(PARTS).filter((k) => g.has(k)).map((k) => [k, g.get(k)]));
        const sizes = Object.fromEntries(Object.entries(SIZES).filter(([a]) => g.has(a)).map(([a, k]) => [k, g.get(a)]));
        const look: LookPatch = { ...DEFAULT_LOOK, ...this.#look, ...parts, sizes: { ...DEFAULT_LOOK.sizes, ...this.#look?.sizes, ...sizes } };
        const colors = Object.fromEntries(Object.entries(COLORS).filter(([a]) => g.has(a)).map(([a, k]) => [k, g.get(a)]));
        if (Object.keys(colors).length) {
          const t = look.theme;
          // The underlying theme, never a theme derived earlier. An unknown id leaves gaps that resolveLook rejects.
          const base = typeof t === 'string' ? nox.themes.find((x) => x.id === t)?.base : t?.base;
          look.theme = { base: { ...base, ...colors } as ThemeBase };
        }
        return look;
      }

      #settings(): Omit<BotOptions, 'look' | 'seed' | 'state'> {
        const g = this.#good;
        return {
          speed: (g.get('speed') as number) ?? 1,
          fps: (g.get('fps') as number) ?? 30,
          motion: (g.get('motion') as Motion) ?? 'auto',
          label: (g.get('label') as string) ?? '',
          personality: (g.get('personality') as Personality) ?? 'default',
          // A missing dial is null: back to the personality's value. createBot retunes only on a real change.
          ...Object.fromEntries(DIALS.map((k) => [k, (g.get(k) as number | undefined) ?? null])),
        };
      }

      #aria(): void {
        const label = this.#good.get('label') as string | undefined;
        for (const a of ['role', 'aria-label', 'aria-hidden']) this.removeAttribute(a);
        if (label) {
          this.setAttribute('role', 'img');
          this.setAttribute('aria-label', label);
        } else this.setAttribute('aria-hidden', 'true');
      }

      connectedCallback(): void {
        for (const name of ATTRS) this.#read(name);
        const g = this.#good;
        const options = { ...this.#settings(), seed: g.get('seed') as number | undefined, state: g.get('state') as BotOptions['state'] };
        try {
          this.#bot = createBot(this.shadowRoot!, { ...options, look: this.#fullLook() });
        } catch (e) {
          this.#warn(e); // a bad look property: fall back to the attributes alone
          this.#look = undefined;
          try {
            this.#bot = createBot(this.shadowRoot!, { ...options, look: this.#fullLook() });
          } catch (e) {
            this.#warn(e); // the page itself can't host a bot
          }
        }
        this.#aria();
      }

      disconnectedCallback(): void {
        this.#bot?.destroy();
        this.#bot = null;
      }

      attributeChangedCallback(name: string): void {
        const bot = this.#bot;
        if (!bot || !this.#read(name)) return; // before connect, connectedCallback reads every attribute
        const v = this.#good.get(name);
        if (name === 'state') {
          if (v !== undefined) bot.state(v as never);
        } else if (name in PARTS || name in SIZES || name in COLORS) {
          try {
            bot.update({ look: this.#fullLook() });
          } catch (e) {
            this.#warn(e); // a bad look property an attribute was hiding: keep the last look
          }
        } else if (name !== 'seed') {
          bot.update(this.#settings());
          if (name === 'label') this.#aria();
        }
      }
    },
  );
}
