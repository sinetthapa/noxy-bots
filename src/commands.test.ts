import { describe, expect, it } from 'vitest';
import { createNox, STEP, type Nox } from './brain/nox.ts';
import { commands, NAMES, num } from './commands.ts';

const setup = () => {
  const brain = createNox({ seed: 1 });
  return { brain, r: brain.resolver, c: commands(brain) };
};
const run = (brain: Nox, ms: number) => {
  for (let t = 0; t < ms; t += STEP) brain.tick(STEP);
};

describe('NAMES', () => {
  it('has the 29 public names: the brain names in kebab case, without wake', () => {
    expect(NAMES).toEqual({
      base: ['idle', 'focused', 'break', 'drowsy', 'sleep', 'deep-sleep'],
      activity: ['thinking', 'listening', 'processing', 'speaking', 'connecting', 'offline'],
      emotion: ['happy', 'curious', 'concerned', 'excited', 'confused', 'sad', 'love', 'amazed'],
      event: ['error', 'success', 'reminder', 'notification', 'boot', 'alert', 'idea', 'laugh', 'dizzy'],
    });
    expect(Object.isFrozen(NAMES) && Object.isFrozen(NAMES.base)).toBe(true);
  });
});

describe('state()', () => {
  const rows = (Object.keys(NAMES) as (keyof typeof NAMES)[]).flatMap((layer) => NAMES[layer].map((name) => [layer, name] as const));
  it.each(rows)('%s %s reaches the brain', (layer, name) => {
    const { r, c } = setup();
    c.state(name);
    const brain = name.toUpperCase().replace('-', '_');
    if (layer === 'base') expect(r.base).toBe(brain);
    if (layer === 'activity') expect(r.activity).toBe(brain);
    if (layer === 'emotion') expect(r.emotion).toBe(brain);
    if (layer === 'event') expect(r.playing?.name).toBe(brain);
  });

  it('a base clears the activity and both emotions', () => {
    const { brain, r, c } = setup();
    c.state('thinking');
    c.state('sad');
    brain.setEmotion('HAPPY', 5000);
    c.state('focused');
    expect([r.base, r.activity, r.emotion]).toEqual(['FOCUSED', null, null]);
  });

  it('an activity wakes a sleeping bot', () => {
    const { r, c } = setup();
    c.state('sleep');
    c.state('thinking');
    expect([r.base, r.activity]).toEqual(['IDLE', 'THINKING']);
  });

  it('an activity also cancels a sleep that waits for an event', () => {
    const { brain, r, c } = setup();
    c.state('success');
    c.state('sleep'); // deferred: an event plays
    c.state('thinking');
    run(brain, 4000);
    expect([r.base, r.effectiveActivity]).toEqual(['IDLE', 'THINKING']);
  });

  it('an emotion stays until changed', () => {
    const { brain, r, c } = setup();
    c.state('happy');
    run(brain, 10000);
    expect(r.emotion).toBe('HAPPY');
  });

  it('wake is not a public name', () => {
    expect(() => setup().c.state('wake' as never)).toThrow(/noxy-bots: unknown state "wake"; valid: idle, .*, dizzy$/);
  });
});

describe('layer setters', () => {
  it('base() keeps the activity (the brain rule)', () => {
    const { r, c } = setup();
    c.activity('speaking');
    c.base('focused');
    expect([r.base, r.activity]).toEqual(['FOCUSED', 'SPEAKING']);
  });

  it('activity(null) clears it', () => {
    const { r, c } = setup();
    c.activity('thinking');
    c.activity(null);
    expect(r.activity).toBe(null);
  });

  it('emotion(e, ms) shows over a sticky emotion, then clears', () => {
    const { brain, r, c } = setup();
    c.emotion('sad');
    c.emotion('happy', 2000);
    expect(r.emotion).toBe('HAPPY');
    run(brain, 2500);
    expect(r.emotion).toBe(null);
  });

  it('emotion(null) clears both', () => {
    const { brain, r, c } = setup();
    c.emotion('sad');
    brain.setEmotion('HAPPY', 5000);
    c.emotion(null);
    expect(r.emotion).toBe(null);
  });

  it('play() takes events only', () => {
    const { r, c } = setup();
    c.play('idea');
    expect(r.playing?.name).toBe('IDEA');
    expect(() => c.play('happy' as never)).toThrow(/unknown event "happy"; valid: error, success/);
  });

  it.each([
    [() => setup().c.base('awake' as never), /unknown base "awake"; valid: idle, focused/],
    [() => setup().c.activity(3 as never), /unknown activity 3; valid: thinking/],
    [() => setup().c.emotion('happy', -1), /holdMs must be a number from 0 to Infinity, got -1/],
  ])('rejects bad input', (call, message) => {
    expect(call).toThrow(message);
  });
});

describe('num', () => {
  it.each([
    [() => num('fps', 0, 1, 60, true), /fps must be an integer from 1 to 60, got 0/],
    [() => num('fps', 2.5, 1, 60, true), /got 2.5/],
    [() => num('speed', Number.NaN, 0.1, 4), /speed must be a number from 0.1 to 4, got NaN/],
    [() => num('speed', '2', 0.1, 4), /got "2"/],
  ])('rejects bad values', (call, message) => {
    expect(call).toThrow(message);
  });
  it('passes a good value through', () => expect(num('fps', 60, 1, 60, true)).toBe(60));
});
