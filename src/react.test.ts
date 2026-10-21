// @vitest-environment happy-dom
import { createElement, createRef, StrictMode, useEffect, useRef, type Ref } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Nox } from './brain/nox.ts';
import type { Bot, LookPatch } from './index.ts';
import { NoxyBot, type NoxyBotProps } from './react.ts';
import { PERSONALITIES, tuningFor } from './brain/personality.ts';

const brains = vi.hoisted(() => [] as Nox[]);
vi.mock('./brain/nox.ts', async (importOriginal) => {
  const m = await importOriginal<typeof import('./brain/nox.ts')>();
  return { ...m, createNox: (o: Parameters<typeof m.createNox>[0]) => (brains.push(m.createNox(o)), brains.at(-1)!) };
});
beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

let root: Root;
let box: HTMLElement;
const render = (props: NoxyBotProps & { ref?: Ref<Bot | null> }, strict = false) =>
  act(() => {
    const el = createElement(NoxyBot, props);
    root.render(strict ? createElement(StrictMode, null, el) : el);
  });
const mount = () => {
  box = document.body.appendChild(document.createElement('div'));
  root = createRoot(box);
};
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('<NoxyBot>', () => {
  it('creates a bot from its props and hands it to the ref', () => {
    mount();
    const ref = createRef<Bot | null>();
    render({ ref, state: 'sleep', look: { ears: 'none' }, label: 'Nox' });
    expect(ref.current!.look.ears).toBe('none');
    expect(brains.at(-1)!.resolver.base).toBe('SLEEP');
    expect(box.querySelector('svg')!.getAttribute('aria-label')).toBe('Nox');
    render({ ref, state: 'sleep', look: { ears: 'none' }, label: 'Nox 2', motion: 'still' });
    expect(box.querySelector('svg')!.getAttribute('aria-label')).toBe('Nox 2');
    expect(brains.at(-1)!.motion).toBe('still');
  });

  it('survives StrictMode: one <svg>, the first bot destroyed', () => {
    mount();
    const ref = createRef<Bot | null>();
    render({ ref }, true);
    expect(box.querySelectorAll('svg').length).toBe(1);
    expect(() => ref.current!.state('happy')).not.toThrow();
  });

  it('a state prop applies once per change; an event plays once', () => {
    mount();
    const ref = createRef<Bot | null>();
    render({ ref, state: 'idle' });
    const spy = vi.spyOn(brains.at(-1)!, 'trigger');
    render({ ref, state: 'success' });
    render({ ref, state: 'success' }); // a re-render, not a change
    expect(spy.mock.calls).toEqual([['SUCCESS']]);
    render({ ref, state: 'happy' });
    expect(brains.at(-1)!.resolver.emotion).toBe('HAPPY');
  });

  it('compares look by value: an equal inline object does not rebuild', () => {
    mount();
    render({ look: { theme: 'mint' } });
    const svg = box.querySelector('svg');
    render({ look: { theme: 'mint' } });
    expect(box.querySelector('svg')).toBe(svg);
    render({ look: { theme: 'onyx' } });
    expect(box.querySelector('svg')).not.toBe(svg);
  });

  it('a look object changed in place applies on the next render', () => {
    mount();
    const ref = createRef<Bot | null>();
    const look: { ears: string } = { ears: 'nox' };
    render({ ref, look });
    look.ears = 'none';
    render({ ref, look });
    expect(ref.current!.look.ears).toBe('none');
  });

  it('dropping a look prop goes back to the default look', () => {
    mount();
    const ref = createRef<Bot | null>();
    render({ ref, look: { ears: 'none', sizes: { eye: 1.2 } } });
    render({ ref });
    expect(ref.current!.look).toMatchObject({ ears: 'nox', sizes: { eye: 1 } });
  });

  it('warns about a bad prop and keeps the last good value', () => {
    mount();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ref = createRef<Bot | null>();
    render({ ref, look: { ears: 'none' } });
    render({ ref, look: { ears: 'wings' } });
    expect(ref.current!.look.ears).toBe('none');
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/^noxy-bots: unknown ears "wings"/));
  });

  it('destroys its bot on unmount', () => {
    mount();
    const ref = createRef<Bot | null>();
    render({ ref });
    const bot = ref.current!;
    act(() => root.unmount());
    mount(); // afterEach unmounts this one
    expect(() => bot.state('idle')).toThrow('this bot was destroyed');
    expect(document.querySelectorAll('svg').length).toBe(0);
  });

  it('renders a sized box on the server', () => {
    mount();
    expect(renderToString(createElement(NoxyBot, { className: 'hero', style: { width: 200 } }))).toBe(
      '<div class="hero" style="display:inline-block;width:200px;aspect-ratio:985 / 830"></div>',
    );
  });

  it('hands the bot to the ref before a parent mount effect runs', () => {
    mount();
    let seen: Bot | null | undefined;
    function Parent() {
      const ref = useRef<Bot | null>(null);
      useEffect(() => {
        seen = ref.current;
      }, []);
      return createElement(NoxyBot, { ref });
    }
    act(() => root.render(createElement(Parent)));
    expect(typeof seen?.state).toBe('function');
  });

  it('a bad prop on mount still applies a good state', () => {
    mount();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    render({ look: { theme: 'neon' }, state: 'sleep' });
    expect(brains.at(-1)!.resolver.base).toBe('SLEEP');
  });

  it('a look JSON cannot serialize still applies, without throwing in render', () => {
    mount();
    const ref = createRef<Bot | null>();
    render({ ref });
    expect(() => render({ ref, look: { ears: 'none', n: 1n } as LookPatch })).not.toThrow();
    expect(box.querySelectorAll('svg').length).toBe(1);
    expect(ref.current!.look.ears).toBe('none');
  });

  it('a cyclic look does not throw', () => {
    mount();
    const look: Record<string, unknown> = { ears: 'none' };
    look.self = look;
    expect(() => render({ look: look as LookPatch })).not.toThrow();
    expect(box.querySelectorAll('svg').length).toBe(1);
  });

  it('warns and shows nothing when even a default bot cannot be made', () => {
    mount();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const make = document.createElement.bind(document);
    // e.g. page markup like <img name="createElement"> shadowing document.createElement
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      if (tag === 'template') throw new TypeError('document.createElement is not a function');
      return make(tag);
    }) as typeof document.createElement);
    const ref = createRef<Bot | null>();
    expect(() => render({ ref, look: { ears: 'none' } })).not.toThrow();
    expect(() => render({ ref, look: { ears: 'antenna' }, state: 'happy', speed: 2 })).not.toThrow();
    expect(warn).toHaveBeenCalled();
    expect(box.querySelector('svg')).toBe(null);
    expect(ref.current).toBe(null);
  });
});

describe('personality and dials (M3 spec §4.4)', () => {
  const P = PERSONALITIES;

  it('applies them on mount, and changes or removes them without a remount', () => {
    mount();
    const n = brains.length;
    render({ personality: 'shy', glance: 2 });
    expect(brains.at(-1)!.tuning).toEqual(tuningFor({ ...P.shy, glance: 2 }));
    const svg = box.querySelector('svg');
    render({ personality: 'shy', glance: 0 });
    expect(brains.at(-1)!.tuning).toEqual(tuningFor({ ...P.shy, glance: 0 }));
    render({ personality: 'shy' });
    expect(brains.at(-1)!.tuning).toEqual(tuningFor(P.shy));
    render({});
    expect(brains.at(-1)!.tuning).toEqual(tuningFor(P.default));
    expect(box.querySelector('svg')).toBe(svg);
    expect(brains.length).toBe(n + 1);
  });

  it('an unrelated rerender does not retune', () => {
    mount();
    render({ blink: 1.5 });
    const retune = vi.spyOn(brains.at(-1)!, 'retune');
    render({ blink: 1.5, speed: 2, className: 'x' });
    expect(retune).not.toHaveBeenCalled();
  });

  it('a bad dial warns and keeps the last good value', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mount();
    render({ blink: 0.5 });
    render({ blink: 9 });
    expect(warn).toHaveBeenCalledWith('noxy-bots: blink must be a number from 0 to 2, got 9');
    expect(brains.at(-1)!.tuning).toEqual(tuningFor({ ...P.default, blink: 0.5 }));
  });

  it('works under StrictMode', () => {
    mount();
    render({ personality: 'bouncy', snap: 2 }, true);
    expect(brains.at(-1)!.tuning).toEqual(tuningFor({ ...P.bouncy, snap: 2 }));
  });
});
