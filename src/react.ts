// noxy-bots/react: <NoxyBot>, a thin wrapper around createBot (M2 spec §10). Works on React 18 and 19.
import { createElement, forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, type CSSProperties } from 'react';
import { DEFAULT_LOOK, nox } from './character/nox/index.ts';
import { createBot, type Bot, type BotOptions, type LookPatch } from './index.ts';
import { DIALS, type DialName } from './brain/personality.ts';

export interface NoxyBotProps extends BotOptions {
  className?: string;
  style?: CSSProperties;
}

const BOX: CSSProperties = { display: 'inline-block', width: 120, aspectRatio: `${nox.frame[2]} / ${nox.frame[3]}` };
// A throw inside an effect would unmount the page, so bad props warn and keep the last good value.
const warn = (e: unknown) => console.warn((e as Error).message);
type DialProps = Partial<Record<DialName, number | null>>;
/** The dial props; a missing one becomes `absent` (undefined on mount, null in updates: back to the personality's value). */
const dialsOf = (p: DialProps, absent: null | undefined): DialProps => Object.fromEntries(DIALS.map((k) => [k, p[k] ?? absent])) as DialProps;
/** The whole look the props describe: DEFAULT_LOOK ← look. */
const full = (look: LookPatch = {}): LookPatch => ({ ...DEFAULT_LOOK, ...look, sizes: { ...DEFAULT_LOOK.sizes, ...look.sizes } });
let unique = 0;
/** The look by value: an inline look={{ … }} must not rebuild on every render. One JSON can't serialize (a BigInt, a cycle) gets a fresh key, so it applies on every render. */
const keyOf = (look: LookPatch | undefined): string => {
  try {
    return JSON.stringify(look ?? {});
  } catch {
    return `\0${++unique}`; // JSON text never holds a raw NUL, so this can't equal a real key
  }
};
// The bot is made in a layout effect, so a parent's mount effect already finds it on the ref. No layout effects on a server (React 18 warns).
const useClientLayoutEffect = typeof document === 'undefined' ? useEffect : useLayoutEffect;

export const NoxyBot = forwardRef<Bot | null, NoxyBotProps>(function NoxyBot(props, ref) {
  const { look, state, seed, speed, motion, fps, label, personality, className, style } = props;
  const host = useRef<HTMLDivElement>(null);
  const bot = useRef<Bot | null>(null);
  const lookKey = keyOf(look);
  const applied = useRef({ look: '', state: undefined as BotOptions['state'] }); // what the bot shows now

  useClientLayoutEffect(() => {
    let b: Bot | null = null;
    try {
      b = createBot(host.current!, { look, state, seed, speed, motion, fps, label, personality, ...dialsOf(props, undefined) });
      applied.current = { look: lookKey, state };
    } catch (e) {
      warn(e);
      try {
        b = createBot(host.current!); // from the defaults: the effects below apply every good prop and warn about the bad one
      } catch (e) {
        warn(e); // the page itself can't host a bot: render the empty box
      }
      applied.current = { look: '', state: undefined };
    }
    bot.current = b;
    return () => {
      b?.destroy();
      bot.current = null;
    };
  }, []); // created once: later prop changes go through the effects below; seed is read on mount only

  useImperativeHandle<Bot | null, Bot | null>(ref, () => bot.current, []); // after the effect above, which fills it

  useEffect(() => {
    const b = bot.current;
    if (!b || applied.current.look === lookKey) return;
    try {
      b.update({ look: full(look) });
      applied.current.look = lookKey;
    } catch (e) {
      warn(e);
    }
  }, [lookKey]);

  useEffect(() => {
    const b = bot.current;
    if (!b || state === undefined || applied.current.state === state) return; // an event plays once per change
    try {
      b.state(state);
      applied.current.state = state;
    } catch (e) {
      warn(e);
    }
  }, [state]);

  useEffect(() => {
    try {
      bot.current?.update({ speed: speed ?? 1, motion: motion ?? 'auto', fps: fps ?? 30, label: label ?? '', personality: personality ?? 'default', ...dialsOf(props, null) });
    } catch (e) {
      warn(e);
    }
  }, [speed, motion, fps, label, personality, ...DIALS.map((k) => props[k])]); // retune runs only on a real change, so mount and speed changes are harmless

  return createElement('div', { ref: host, className, style: { ...BOX, ...style } });
});
