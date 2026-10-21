import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let frames: ((now: number) => void)[] = [];
let observers: { cb: IntersectionObserverCallback; watched: Set<Element> }[] = [];
const tick = (now: number) => {
  const due = frames;
  frames = [];
  for (const f of due) f(now);
};
const report = (el: Element, isIntersecting: boolean) =>
  observers[0].cb([{ target: el, isIntersecting } as unknown as IntersectionObserverEntry], {} as IntersectionObserver);

beforeEach(() => {
  frames = [];
  observers = [];
  vi.resetModules(); // the loop keeps module state; each test gets a fresh one
  vi.stubGlobal('requestAnimationFrame', (f: (now: number) => void) => frames.push(f));
  vi.stubGlobal('cancelAnimationFrame', () => (frames = []));
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      watched = new Set<Element>();
      constructor(public cb: IntersectionObserverCallback) {
        observers.push(this);
      }
      observe(el: Element) {
        this.watched.add(el);
      }
      unobserve(el: Element) {
        this.watched.delete(el);
      }
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

const runner = () => ({ el: {} as Element, frame: vi.fn() });

describe('the shared loop', () => {
  it('starts with the first runner, drives every runner each frame, and stops with the last', async () => {
    const { run, halt } = await import('./loop.ts');
    const a = runner();
    const b = runner();
    run(a);
    run(b);
    expect(frames.length).toBe(1); // one loop for both
    tick(16);
    expect([a.frame.mock.calls, b.frame.mock.calls]).toEqual([[[16]], [[16]]]);
    halt(a);
    tick(32);
    expect([a.frame.mock.calls.length, b.frame.mock.calls.length]).toEqual([1, 2]);
    halt(b);
    expect(frames.length).toBe(0);
  });

  it('uses one IntersectionObserver and skips runners off screen until they return', async () => {
    const { run } = await import('./loop.ts');
    const a = runner();
    const b = runner();
    run(a);
    run(b);
    expect(observers.length).toBe(1);
    expect(observers[0].watched).toEqual(new Set([a.el, b.el]));
    report(a.el, false);
    tick(16);
    expect([a.frame.mock.calls.length, b.frame.mock.calls.length]).toEqual([0, 1]);
    report(a.el, true);
    tick(32);
    expect(a.frame.mock.calls).toEqual([[32]]);
  });

  it('stops watching a halted runner', async () => {
    const { run, halt } = await import('./loop.ts');
    const a = runner();
    run(a);
    halt(a);
    expect(observers[0].watched.size).toBe(0);
  });

  it('a runner that throws does not stop the others; the error is reported', async () => {
    const { run } = await import('./loop.ts');
    const reportError = vi.fn();
    vi.stubGlobal('reportError', reportError);
    const boom = new Error('boom');
    const a = { el: {} as Element, frame: vi.fn(() => { throw boom; }) };
    const b = runner();
    run(a);
    run(b);
    tick(16);
    tick(32);
    expect(b.frame.mock.calls).toEqual([[16], [32]]);
    expect(reportError.mock.calls).toEqual([[boom], [boom]]);
  });

  it('restarts after stopping', async () => {
    const { run, halt } = await import('./loop.ts');
    const a = runner();
    run(a);
    halt(a);
    run(a);
    tick(16);
    expect(a.frame).toHaveBeenCalledTimes(1);
  });
});
