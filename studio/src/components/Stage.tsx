// The canvas: the live Nox on the page's gradient and the state dock with Randomize and Pause/Play (M3 spec §5.4, layout 2026-10-15). Follow-pointer aims the gaze from here.
import { type Bot, type EventName, type StateName } from 'noxy-bots';
import { NoxyBot } from 'noxy-bots/react';
import { Dices, Pause, Play } from 'lucide-react';
import { memo, useEffect, useMemo, useRef } from 'react';
import { botProps, type Gaze, type StudioState } from '../state.ts';
import { StateBoard } from './StateBoard.tsx';
import { Button } from './ui/button.tsx';
import { Tooltip } from './ui/tooltip.tsx';

const clamp = (v: number) => Math.max(-1, Math.min(1, v));

export const Stage = memo(function Stage(p: {
  s: StudioState;
  attach: (b: Bot | null) => void;
  paused: boolean;
  onPause: (paused: boolean) => void;
  follow: boolean;
  onGaze: (g: Gaze) => void;
  onPick: (n: StateName) => void;
  onPlay: (n: EventName) => void;
  badge: boolean;
  onBadge: (on: boolean) => void;
  onRandomize: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const { follow, onGaze } = p;
  // NoxyBot reads seed and the starting state on mount. A seed change remounts it (key), starting in the current state.
  const mountState = useMemo(() => p.s.state, [p.s.seed]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!follow) return;
    const move = (e: PointerEvent) => {
      const r = box.current!.getBoundingClientRect();
      onGaze({ x: clamp((e.clientX - (r.left + r.width / 2)) / 320), y: clamp((e.clientY - (r.top + r.height / 2)) / 320) });
    };
    addEventListener('pointermove', move);
    return () => removeEventListener('pointermove', move);
  }, [follow, onGaze]);
  return (
    <section aria-label="Preview" className="flex min-w-0 flex-col items-center gap-4">
      {/* Nox grows with the canvas, up to 560px (DESIGN.md The stage). The filter softens its shadow (.stage-bot in styles.css). */}
      <svg aria-hidden="true" className="absolute size-0">
        <filter id="stage-shadow" y="-150%" height="400%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
      </svg>
      <div className="flex w-full flex-1 items-center justify-center py-8">
        <div ref={box} className="stage-bot w-[clamp(200px,50vh,560px)] max-w-[80%]">
          <NoxyBot key={p.s.seed ?? 'random'} ref={p.attach} label="Nox preview" state={mountState} {...botProps(p.s)} style={{ width: '100%' }} />
        </div>
      </div>
      <StateBoard
        value={p.s.state}
        onPick={p.onPick}
        onPlay={p.onPlay}
        badge={p.badge}
        onBadge={p.onBadge}
        action={
          <>
            <Tooltip label="Randomize">
              <Button size="icon" aria-label="Randomize" onClick={p.onRandomize}>
                <Dices />
              </Button>
            </Tooltip>
            <Tooltip label={p.paused ? 'Play' : 'Pause'}>
              <Button size="icon" aria-label={p.paused ? 'Play' : 'Pause'} onClick={() => p.onPause(!p.paused)}>
                {p.paused ? <Play /> : <Pause />}
              </Button>
            </Tooltip>
          </>
        }
      />
    </section>
  );
});
