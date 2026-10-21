// The gaze pad (spec Q19): drag or arrow keys aim the eyes; Home or Escape centres. aria-valuetext gives both axes (DESIGN.md).
import type { KeyboardEvent, PointerEvent } from 'react';
import { useRef } from 'react';
import type { Gaze } from '../state.ts';
import { Button } from './ui/button.tsx';
import { Checkbox } from './ui/checkbox.tsx';

const clamp = (v: number) => Math.round(Math.max(-1, Math.min(1, v)) * 100) / 100;
const MOVES: Record<string, [number, number]> = { ArrowLeft: [-0.1, 0], ArrowRight: [0.1, 0], ArrowUp: [0, -0.1], ArrowDown: [0, 0.1] };

export function GazePad({ gaze, onGaze, follow, onFollow }: { gaze: Gaze; onGaze: (g: Gaze) => void; follow: boolean; onFollow: (f: boolean) => void }) {
  const pad = useRef<HTMLDivElement>(null);
  const g = gaze ?? { x: 0, y: 0 };
  const at = (e: PointerEvent) => {
    const r = pad.current!.getBoundingClientRect();
    onGaze({ x: clamp(((e.clientX - r.left) / r.width) * 2 - 1), y: clamp(((e.clientY - r.top) / r.height) * 2 - 1) });
  };
  const key = (e: KeyboardEvent) => {
    if (e.key === 'Home' || e.key === 'Escape') return e.preventDefault(), onGaze(null);
    const m = MOVES[e.key];
    if (!m) return;
    e.preventDefault();
    onGaze({ x: clamp(g.x + m[0]), y: clamp(g.y + m[1]) });
  };
  return (
    <div className="flex flex-wrap items-start gap-3.5">
      <div
        ref={pad}
        role="slider"
        tabIndex={0}
        aria-label="Gaze"
        aria-valuenow={g.x}
        aria-valuemin={-1}
        aria-valuemax={1}
        aria-valuetext={gaze ? `x ${g.x.toFixed(1)}, y ${g.y.toFixed(1)}` : 'centre'}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          at(e);
        }}
        onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && at(e)}
        onKeyDown={key}
        className="relative aspect-square w-[140px] cursor-crosshair touch-none rounded-[12px] border border-border bg-muted"
      >
        <i className="absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary" style={{ left: `${(g.x + 1) * 50}%`, top: `${(g.y + 1) * 50}%` }} />
      </div>
      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-[13px]">
          <Checkbox checked={follow} onCheckedChange={(v) => onFollow(v === true)} />
          Follow pointer
        </label>
        <Button size="sm" onClick={() => onGaze(null)}>
          Centre
        </Button>
      </div>
    </div>
  );
}
