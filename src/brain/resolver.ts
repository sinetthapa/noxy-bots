import { EVENT_META, isAsleep, type Activity, type Base, type Emotion, type EventName } from './library.ts';

const MAX_QUEUE = 3;
const MAX_LOG = 20;

/**
 * Decides what Nox is doing: base, activity, emotion, and which event plays.
 * Knows nothing about poses; nox.ts turns its state into motion. Rules: spec §8.
 */
export class Resolver {
  base: Base = 'IDLE';
  activity: Activity | null = null;
  sticky: Emotion | null = null;
  awakeHold = false; // base is asleep but Nox is temporarily awake for events
  playing: { name: EventName; t: number; id: number } | null = null;
  queue: EventName[] = [];
  log: string[] = [];
  private durations: Record<EventName, number>;
  private tuning: { emotionAfterEventMs: number };
  /** `by` is the id of the event play that set it, so an interrupt can take it back. */
  private timed: { name: Emotion; left: number; by?: number } | null = null;
  private deferredBase: Base | null = null;
  private nextId = 1;
  private clock = 0;

  constructor(durations: Record<EventName, number>, tuning: { emotionAfterEventMs: number }) {
    this.durations = durations;
    this.tuning = tuning;
  }

  get effectiveBase(): Base {
    return isAsleep(this.base) && this.awakeHold ? 'IDLE' : this.base;
  }

  get effectiveActivity(): Activity | null {
    return isAsleep(this.effectiveBase) ? null : this.activity;
  }

  get emotion(): Emotion | null {
    return this.sticky ?? this.timed?.name ?? null;
  }

  get busy(): boolean {
    return this.playing !== null || this.queue.length > 0;
  }

  setBase(b: Base): void {
    if (isAsleep(b) && !isAsleep(this.base) && this.busy) {
      this.deferredBase = b;
      this.note(`${b} deferred until events finish`);
      return;
    }
    this.deferredBase = null;
    if (b === this.base) return;
    const wasAsleep = isAsleep(this.effectiveBase);
    if (!isAsleep(b)) this.awakeHold = false;
    this.base = b;
    this.note(`base ${b}`);
    if (wasAsleep && !isAsleep(b)) this.trigger('WAKE');
  }

  setActivity(a: Activity | null): void {
    if (a === this.activity) return;
    this.activity = a;
    this.note(`activity ${a ?? 'none'}`);
  }

  /** No holdMs = sticky until changed. With holdMs it clears itself. */
  setEmotion(e: Emotion | null, holdMs?: number): void {
    if (holdMs === undefined) {
      this.sticky = e;
      this.note(`emotion ${e ?? 'none'}`);
      return;
    }
    this.timed = e ? { name: e, left: holdMs } : null;
  }

  trigger(name: EventName): void {
    if (this.playing?.name === name || this.queue.includes(name)) {
      this.note(`drop ${name} (duplicate)`);
      return;
    }
    if (isAsleep(this.base) && !this.awakeHold) {
      this.awakeHold = true;
      this.note(`wake up for ${name}`);
      this.start('WAKE');
      if (name !== 'WAKE') this.enqueue(name);
      return;
    }
    if (!this.playing) {
      this.start(name);
      return;
    }
    const current = EVENT_META[this.playing.name];
    if (EVENT_META[name].priority > current.priority && current.interruptible) {
      this.note(`${name} interrupts ${this.playing.name}`);
      if (this.timed?.by === this.playing.id) this.timed = null; // the interrupted event's emotion goes with it
      this.start(name);
      return;
    }
    this.enqueue(name);
  }

  update(dt: number): void {
    this.clock += dt;
    if (this.timed) {
      this.timed.left -= dt;
      if (this.timed.left <= 0) this.timed = null;
    }
    if (!this.playing) return;
    this.playing.t += dt;
    if (this.playing.t < this.durations[this.playing.name]) return;
    const next = this.queue.shift();
    if (next) {
      this.start(next);
      return;
    }
    this.playing = null;
    if (this.awakeHold) {
      this.awakeHold = false;
      this.note(`back to ${this.base}`);
    }
    if (this.deferredBase) {
      this.base = this.deferredBase;
      this.deferredBase = null;
      this.note(`base ${this.base}`);
    }
  }

  private start(name: EventName): void {
    this.playing = { name, t: 0, id: this.nextId++ };
    const emotion = EVENT_META[name].emotion;
    if (emotion) this.timed = { name: emotion, left: this.durations[name] + this.tuning.emotionAfterEventMs, by: this.playing.id };
    this.note(`play ${name}`);
  }

  private enqueue(name: EventName): void {
    this.queue.push(name);
    this.queue.sort((a, b) => EVENT_META[b].priority - EVENT_META[a].priority); // stable: FIFO within a priority
    this.note(`queue ${name}`);
    if (this.queue.length > MAX_QUEUE) this.note(`drop ${this.queue.pop()} (queue full)`);
  }

  private note(msg: string): void {
    this.log.push(`${(this.clock / 1000).toFixed(1)}s  ${msg}`);
    if (this.log.length > MAX_LOG) this.log.shift();
  }
}
