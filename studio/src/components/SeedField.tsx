// The seed field (M3 spec §5.4): '' is random; the seed changes on Enter or blur, so typing doesn't restart the bot per digit.
import { useEffect, useState } from 'react';
import { seedFrom } from '../state.ts';
import { Button } from './ui/button.tsx';

const show = (seed: number | null) => (seed === null ? '' : String(seed));

export function SeedField({ seed, onSeed }: { seed: number | null; onSeed: (v: number | null) => void }) {
  const [text, setText] = useState(show(seed));
  useEffect(() => setText(show(seed)), [seed]); // New seed, Randomize or a link
  const commit = () => {
    const v = seedFrom(text);
    if (v === undefined || v === seed) setText(show(seed)); // junk or no change: show the seed in use
    else onSeed(v);
  };
  return (
    <div className="flex flex-wrap items-center gap-2 text-[13px]">
      <label htmlFor="seed" className="w-[96px]">
        Seed
      </label>
      <input
        id="seed"
        inputMode="numeric"
        placeholder="random"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        className="pressable h-8 w-36 rounded-lg bg-card px-2 font-mono text-[13px]"
      />
      <Button size="sm" onClick={() => onSeed(Math.floor(Math.random() * 2 ** 32))}>
        New seed
      </Button>
    </div>
  );
}
