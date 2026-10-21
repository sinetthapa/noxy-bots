// A labelled slider with its value in mono (sizes, speed, dials).
import { Slider } from './ui/slider.tsx';

export function SliderRow({ label, min, max, step, value, onChange }: { label: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void }) {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)_40px] items-center gap-2.5 text-[13px]">
      <span>{label}</span>
      <Slider label={label} min={min} max={max} step={step} value={[value]} onValueChange={([v]) => onChange(v)} />
      <output className="text-right font-mono text-xs text-muted-foreground tabular-nums">{value.toFixed(2)}</output>
    </div>
  );
}
