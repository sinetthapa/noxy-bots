import { describe, it, expect } from 'vitest';
import { Resolver } from './resolver.ts';

const DUR = { WAKE: 1000, ERROR: 500, SUCCESS: 500, REMINDER: 500, NOTIFICATION: 500, BOOT: 500, ALERT: 500, IDEA: 500, LAUGH: 500, DIZZY: 500 };
const mk = () => new Resolver(DUR, { emotionAfterEventMs: 2000 });

/** Steps the resolver in 16 ms frames; returns the names of events that START during the run. */
function run(r: Resolver, ms: number): string[] {
  const started: string[] = [];
  let id = r.playing?.id ?? 0;
  for (let t = 0; t < ms; t += 16) {
    r.update(16);
    if (r.playing && r.playing.id !== id) {
      id = r.playing.id;
      started.push(r.playing.name);
    }
  }
  return started;
}

describe('Resolver', () => {
  it('SLEEP + NOTIFICATION: wake, notify, then back to sleep', () => {
    const r = mk();
    r.setBase('SLEEP');
    r.trigger('NOTIFICATION');
    expect(r.playing?.name).toBe('WAKE');
    expect(r.effectiveBase).toBe('IDLE');
    expect(r.queue).toEqual(['NOTIFICATION']);
    expect(run(r, 3000)).toEqual(['NOTIFICATION']);
    expect(r.playing).toBeNull();
    expect(r.awakeHold).toBe(false);
    expect(r.effectiveBase).toBe('SLEEP');
  });

  it('DEEP_SLEEP counts as asleep: events wake first, then back to DEEP_SLEEP', () => {
    const r = mk();
    r.setBase('DEEP_SLEEP');
    r.trigger('NOTIFICATION');
    expect(r.playing?.name).toBe('WAKE');
    expect(r.effectiveBase).toBe('IDLE');
    expect(r.queue).toEqual(['NOTIFICATION']);
    run(r, 3000);
    expect(r.effectiveBase).toBe('DEEP_SLEEP');
  });

  it('moving between asleep bases never plays WAKE; waking does', () => {
    const r = mk();
    r.setBase('SLEEP');
    r.setBase('DEEP_SLEEP');
    expect(r.playing).toBeNull();
    r.setBase('IDLE');
    expect(r.playing?.name).toBe('WAKE');
  });

  it('several events while waking play in priority order, then sleep again', () => {
    const r = mk();
    r.setBase('SLEEP');
    r.trigger('NOTIFICATION');
    r.trigger('ERROR');
    expect(r.queue).toEqual(['ERROR', 'NOTIFICATION']);
    expect(run(r, 4000)).toEqual(['ERROR', 'NOTIFICATION']);
    expect(r.effectiveBase).toBe('SLEEP');
  });

  it('ERROR interrupts an interruptible NOTIFICATION, which is dropped', () => {
    const r = mk();
    r.trigger('NOTIFICATION');
    run(r, 100);
    r.trigger('ERROR');
    expect(r.playing?.name).toBe('ERROR');
    expect(r.queue).toEqual([]);
  });

  it('a lower-priority event queues behind ERROR', () => {
    const r = mk();
    r.trigger('ERROR');
    r.trigger('NOTIFICATION');
    expect(r.queue).toEqual(['NOTIFICATION']);
    expect(run(r, 1200)).toEqual(['NOTIFICATION']);
  });

  it('a higher-priority event queues behind a non-interruptible SUCCESS', () => {
    const r = mk();
    r.trigger('SUCCESS');
    r.trigger('ERROR');
    expect(r.playing?.name).toBe('SUCCESS');
    expect(r.queue).toEqual(['ERROR']);
  });

  it('orders the queue by priority and caps it at 3', () => {
    const r = mk();
    r.trigger('SUCCESS');
    r.trigger('NOTIFICATION');
    r.trigger('REMINDER');
    r.trigger('ERROR');
    expect(r.queue).toEqual(['ERROR', 'REMINDER', 'NOTIFICATION']);
    r.trigger('WAKE');
    expect(r.queue).toEqual(['WAKE', 'ERROR', 'REMINDER']);
  });

  it('drops duplicates of a playing or queued event', () => {
    const r = mk();
    r.trigger('NOTIFICATION');
    r.trigger('NOTIFICATION');
    expect(r.queue).toEqual([]);
    expect(r.log.some((l) => l.includes('drop NOTIFICATION (duplicate)'))).toBe(true);
  });

  it('suspends the activity while asleep and plays WAKE when leaving SLEEP', () => {
    const r = mk();
    r.setActivity('THINKING');
    r.setBase('SLEEP');
    expect(r.effectiveActivity).toBeNull();
    r.setBase('IDLE');
    expect(r.effectiveActivity).toBe('THINKING');
    expect(r.playing?.name).toBe('WAKE');
  });

  it('defers SLEEP until running events finish', () => {
    const r = mk();
    r.trigger('SUCCESS');
    r.setBase('SLEEP');
    expect(r.base).toBe('IDLE');
    run(r, 600);
    expect(r.base).toBe('SLEEP');
  });

  it('leaving SLEEP while awake for events cancels the return to sleep', () => {
    const r = mk();
    r.setBase('SLEEP');
    r.trigger('NOTIFICATION');
    r.setBase('IDLE');
    expect(r.awakeHold).toBe(false);
    run(r, 3000);
    expect(r.effectiveBase).toBe('IDLE');
    expect(r.log.some((l) => l.includes('back to SLEEP'))).toBe(false);
  });

  it('WAKE while asleep wakes briefly and sleeps again', () => {
    const r = mk();
    r.setBase('SLEEP');
    r.trigger('WAKE');
    expect(r.playing?.name).toBe('WAKE');
    expect(r.queue).toEqual([]);
    run(r, 1200);
    expect(r.effectiveBase).toBe('SLEEP');
  });

  it('timed emotions expire; sticky ones stay and win', () => {
    const r = mk();
    r.setEmotion('SAD', 1000);
    expect(r.emotion).toBe('SAD');
    run(r, 1100);
    expect(r.emotion).toBeNull();
    r.setEmotion('HAPPY');
    r.trigger('ERROR'); // attaches a timed CONCERNED
    expect(r.emotion).toBe('HAPPY');
    run(r, 5000);
    expect(r.emotion).toBe('HAPPY');
  });

  it('event emotions last for the clip plus emotionAfterEventMs', () => {
    const r = mk();
    r.trigger('SUCCESS');
    expect(r.emotion).toBe('HAPPY');
    run(r, 2400);
    expect(r.emotion).toBe('HAPPY');
    run(r, 200);
    expect(r.emotion).toBeNull();
  });

  it('an interrupt drops the interrupted event\'s emotion; a queued hand-off keeps it', () => {
    const r = mk();
    r.trigger('NOTIFICATION');
    run(r, 100);
    expect(r.emotion).toBe('CURIOUS');
    r.trigger('WAKE'); // interrupts NOTIFICATION, and has no emotion of its own
    expect(r.emotion).toBeNull();
    const q = mk();
    q.trigger('ERROR');
    q.trigger('IDEA'); // queues behind ERROR, no emotion of its own
    run(q, 600);
    expect(q.playing?.name).toBe('IDEA');
    expect(q.emotion).toBe('CONCERNED');
  });

  it('a later setBase cancels a deferred SLEEP', () => {
    const r = mk();
    r.trigger('SUCCESS');
    r.setBase('SLEEP');
    r.setBase('IDLE');
    run(r, 600);
    expect(r.base).toBe('IDLE');
    const at = r.log.findIndex((l) => l.includes('SLEEP deferred'));
    expect(at).toBeGreaterThanOrEqual(0);
    expect(r.log.slice(at + 1).some((l) => l.includes('base SLEEP'))).toBe(false);
  });
});
