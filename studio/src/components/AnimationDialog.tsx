// The animation export (M4 spec §7): a seamless loop of the board's state, or one event, as an MP4 or a Lottie with every
// setting. Recording and encoding yield as they go, so Cancel and the progress bar always answer; closing the dialog cancels.
// Reworked 2026-10-19 (the user): the clip is the stage's state, or an event from a dropdown, with a live preview; the format
// comes first, and one Download button follows it.
import { DEFAULT_LOOK, NAMES, PERSONALITIES, type Bot, type EventName } from 'noxy-bots';
import { NoxyBot } from 'noxy-bots/react';
import { ChevronDown } from 'lucide-react';
import { Popover } from 'radix-ui';
import { useEffect, useRef, useState } from 'react';
import { HexColorInput, HexColorPicker } from 'react-colorful';
import { toast } from 'sonner';
import { exportLottie } from '../animation/lottie.ts';
import { canMakeMp4, exportMp4, type Mp4Request } from '../animation/mp4.ts';
import { download } from '../export.ts';
import { botProps, lookOf, type Gaze, type StudioState } from '../state.ts';
import { track } from '../track.ts';
import { Button, button } from './ui/button.tsx';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from './ui/dialog.tsx';
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group.tsx';
import { Tooltip } from './ui/tooltip.tsx';

const SIZES = [512, 1080];
const REPLAY = 3000; // the preview replays an event on this beat: longer than the longest one (dizzy, 2.4 s)
const NO_MP4 = "This browser can't make MP4 files. Try Chrome, Edge, Safari 16.4+ or Firefox 130+ on a computer.";

/** What the dialog calls; tests pass a fake. */
export interface Engine {
  canMakeMp4(size: number): Promise<boolean>;
  exportMp4(req: Mp4Request, signal: AbortSignal, onProgress: (done: number) => void): Promise<Blob>;
  exportLottie(req: Mp4Request, signal: AbortSignal, onProgress: (done: number) => void): Promise<Blob>;
  save(blob: Blob, name: string): void;
}
const ENGINE: Engine = { canMakeMp4, exportMp4: (req, signal, onProgress) => exportMp4(req, signal, onProgress), exportLottie, save: download };

/** What the export records: the studio's settings now, and a fresh seed if none is set (0 is a real seed). */
export function requestFor(s: StudioState, gaze: Gaze, event: EventName | null, size: number, background: string): Mp4Request {
  return {
    look: { ...DEFAULT_LOOK, ...lookOf(s), sizes: { ...DEFAULT_LOOK.sizes, ...s.sizes } },
    dials: { ...PERSONALITIES[s.personality], ...s.dials },
    speed: s.speed,
    seed: s.seed ?? (Math.random() * 2 ** 32) >>> 0,
    state: s.state,
    event,
    gaze,
    size,
    background,
  };
}

/** The clip as it will export: the stage's state, or the event replaying. Decorative: the controls say what it shows. */
function Preview({ s, gaze, event, background }: { s: StudioState; gaze: Gaze; event: EventName | null; background?: string }) {
  const bot = useRef<Bot | null>(null);
  useEffect(() => {
    const b = bot.current;
    if (gaze) b?.lookAt(gaze.x, gaze.y);
    if (!b || !event) return;
    b.state(event);
    const t = setInterval(() => b.state(event), REPLAY);
    return () => clearInterval(t);
  }, [gaze, event]);
  return (
    <div data-preview aria-hidden="true" className="grid h-44 place-items-center rounded-[12px] border border-border" style={{ background }}>
      {/* Keyed like the stage: a new seed, state or clip starts a fresh bot in the state (NoxyBot reads both on mount). */}
      <NoxyBot key={`${s.seed}-${s.state}-${event}`} ref={bot} {...botProps(s)} state={s.state} style={{ width: 150 }} />
    </div>
  );
}

export function AnimationDialog({ s, gaze, engine = ENGINE }: { s: StudioState; gaze: Gaze; engine?: Engine }) {
  const [open, setOpen] = useState(false);
  const [clip, setClip] = useState<'loop' | 'event'>('loop');
  const [event, setEvent] = useState<EventName>(NAMES.event[0]);
  const [format, setFormat] = useState<'mp4' | 'json'>('mp4');
  const [size, setSize] = useState(1080);
  const [background, setBackground] = useState('#ffffff');
  const [ok, setOk] = useState<boolean | null>(null); // null while asking the browser
  const [progress, setProgress] = useState<number | null>(null); // null = not exporting
  const job = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    setOk(null);
    engine.canMakeMp4(size).then(
      (v) => live && setOk(v),
      () => live && setOk(false),
    );
    return () => void (live = false);
  }, [open, size, engine]);

  const played = clip === 'event' ? event : null;
  const cancel = () => job.current?.abort();
  const run = async (kind: 'mp4' | 'json') => {
    if ((kind === 'mp4' && !ok) || job.current) return; // aria-disabled, or already exporting
    const ac = new AbortController();
    job.current = ac;
    setProgress(0);
    try {
      const req = requestFor(s, gaze, played, size, background); // the Lottie ignores size and background
      const blob = await (kind === 'mp4' ? engine.exportMp4 : engine.exportLottie)(req, ac.signal, setProgress);
      if (ac.signal.aborted) return;
      engine.save(blob, `noxy-${played ?? s.state}.${kind}`);
      track('export', kind === 'mp4' ? { format: 'mp4', size } : { format: 'lottie' });
    } catch (e) {
      if (!ac.signal.aborted) {
        console.error(e);
        toast(kind === 'mp4' ? "Couldn't make the MP4" : "Couldn't make the Lottie");
      }
    } finally {
      job.current = null;
      setProgress(null);
    }
  };

  // Download sits outside the locked fieldset and is only aria-disabled while exporting, so keyboard focus stays on it; run() waits.
  const busy = progress !== null;
  const dim = 'aria-disabled:cursor-not-allowed aria-disabled:opacity-50';
  const mp4 = (
    <Button variant="primary" aria-disabled={ok && !busy ? undefined : true} onClick={() => run('mp4')} className={dim}>
      Download MP4
    </Button>
  );
  // Each row: its label in a fixed column, its controls wrapping beside it (so a wrapped control lines up under the first).
  const row = 'grid grid-cols-[4rem_minmax(0,1fr)] items-center gap-2';
  const label = 'text-xs text-muted-foreground';
  const controls = 'flex flex-wrap items-center gap-2';
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) cancel();
        setOpen(o);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">Animation…</Button>
      </DialogTrigger>
      <DialogContent>
        <div className="grid gap-1 pr-8">
          <DialogTitle>Export animation</DialogTitle>
          <DialogDescription>A seamless loop of what Nox is doing, or one event, with every setting.</DialogDescription>
        </div>
        <Preview s={s} gaze={gaze} event={played} background={format === 'mp4' ? background : undefined} />
        <div className="grid min-w-0 gap-3">
          <fieldset disabled={busy} className="grid min-w-0 gap-3">
            <div className={row}>
              <span id="anim-clip" className={label}>
                Clip
              </span>
              <div className={controls}>
                <ToggleGroup type="single" aria-labelledby="anim-clip" value={clip} onValueChange={(v) => v && setClip(v as 'loop' | 'event')}>
                  <ToggleGroupItem value="loop">{s.state} loop</ToggleGroupItem>
                  <ToggleGroupItem value="event">Event</ToggleGroupItem>
                </ToggleGroup>
                {clip === 'event' && (
                  <span className="relative">
                    <select aria-label="Event" value={event} onChange={(e) => setEvent(e.target.value as EventName)} className={button({ size: 'sm' }) + ' peer appearance-none pr-8'}>
                      {NAMES.event.map((e) => (
                        <option key={e}>{e}</option>
                      ))}
                    </select>
                    <ChevronDown aria-hidden="true" className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 peer-disabled:opacity-50" />
                  </span>
                )}
              </div>
            </div>
            <div className={row}>
              <span id="anim-format" className={label}>
                Format
              </span>
              <ToggleGroup type="single" aria-labelledby="anim-format" value={format} onValueChange={(v) => v && setFormat(v as 'mp4' | 'json')}>
                <ToggleGroupItem value="mp4">MP4</ToggleGroupItem>
                <ToggleGroupItem value="json">Lottie</ToggleGroupItem>
              </ToggleGroup>
            </div>
            {format === 'mp4' && (
              <div className={row}>
                <span id="anim-size" className={label}>
                  Size
                </span>
                <div className={controls}>
                  <ToggleGroup type="single" aria-labelledby="anim-size" value={String(size)} onValueChange={(v) => v && setSize(Number(v))}>
                    {SIZES.map((n) => (
                      <ToggleGroupItem key={n} value={String(n)}>
                        {n}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                  {/* The studio's picker, not a native input: its trigger opens and closes it (the user, 2026-10-19). */}
                  <Popover.Root>
                    <Popover.Trigger aria-label={`Background colour, ${background}`} className="group flex min-h-8 cursor-pointer items-center gap-2 rounded-lg text-[13px] disabled:pointer-events-none disabled:opacity-50 pointer-coarse:min-h-11">
                      <span className="size-7 rounded-full border-2 border-border group-hover:border-muted-foreground group-data-[state=open]:border-muted-foreground" style={{ background }} />
                      Background
                    </Popover.Trigger>
                    <Popover.Portal>
                      <Popover.Content aria-label="Background colour" side="top" sideOffset={6} collisionPadding={12} className="card z-50 grid w-48 gap-3 p-3">
                        <HexColorPicker color={background} onChange={setBackground} className="picker" />
                        {/* Only full #rrggbb values reach the export, as in the colour slots. */}
                        <HexColorInput aria-label="Background hex" color={background} onChange={(v) => v.length === 7 && setBackground(v.toLowerCase())} prefixed className="h-8 w-0 min-w-full rounded-lg border-2 border-border bg-card px-2 font-mono text-xs" />
                      </Popover.Content>
                    </Popover.Portal>
                  </Popover.Root>
                </div>
              </div>
            )}
          </fieldset>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {format === 'json' ? (
              <Button variant="primary" aria-disabled={busy || undefined} onClick={() => run('json')} className={dim}>
                Download Lottie
              </Button>
            ) : ok === false ? (
              <Tooltip label={NO_MP4}>{mp4}</Tooltip>
            ) : (
              mp4
            )}
          </div>
        </div>
        {progress !== null && (
          <div className="flex items-center gap-2">
            <progress className="progress min-w-0 flex-1" max={1} value={progress} aria-label="Export progress" />
            <span aria-live="polite" className="w-28 text-xs text-muted-foreground">
              Recording… {Math.floor(progress * 10) * 10}%
            </span>
            <Button size="sm" onClick={cancel}>
              Cancel
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
