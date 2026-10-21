// The controls, at the top of the sidebar (M3 spec §5.4, layout 2026-10-15). Simple: theme, parts, personality; Advanced adds the rest.
import { DIALS, nox, PERSONALITIES, type Personality } from 'noxy-bots';
import { NoxyBot } from 'noxy-bots/react';
import { Popover } from 'radix-ui';
import { HexColorInput, HexColorPicker } from 'react-colorful';
import { cn } from '@/lib/utils.ts';
import { GazePad } from './GazePad.tsx';
import { SliderRow } from './SliderRow.tsx';
import { Button } from './ui/button.tsx';
import { useState, type Dispatch, type ReactNode } from 'react';
import { botProps, PARTS, SIZE_KEYS, SLOTS, themeBase, type Action, type Gaze, type Slot, type StudioState } from '../state.ts';
import { Row } from './Row.tsx';
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group.tsx';

const PART_LABELS = { body: 'Body', ears: 'Ears', eyes: 'Eyes', bolts: 'Bolts' } as const;
const SIZE_LABELS = { eye: 'Eye size', eyeSpacing: 'Eye spacing', ear: 'Ear size', bolt: 'Bolt size' } as const;

export const title = (w: string) => w[0].toUpperCase() + w.slice(1);

// Presets per slot (user, 2026-10-15): the themes' own colours first, then a few more that read on Nox. Lowercase, as the state keeps them.
const PRESETS: Record<Slot, string[]> = {
  shell: ['#92a7ad', '#5b6b85', '#9fd8c8', '#f4a9c8', '#23272d', '#e8ecef', '#c9b8f0', '#7aa2c8'],
  screen: ['#313e4f', '#0b0f17', '#1e3b38', '#3a1f3d', '#0f1318', '#1d2b4a', '#2a2140', '#3b2a1e'],
  eye: ['#2ec7e6', '#8ab4ff', '#7cffcb', '#ffe066', '#ff6b9a', '#b18cff', '#ff9a3c', '#ffffff'],
  accent: ['#fa6c2e', '#ffb547', '#ff7a59', '#ff4f9a', '#2ec7e6', '#7c5cff', '#22c55e', '#e11d48'],
  mouth: ['#efefef', '#e6ecf5', '#f2fff9', '#fff0f6', '#ffe066', '#7cffcb', '#2ec7e6', '#ff8fb1'],
};

/** One colour slot: its swatch opens a popover above it with the slot's presets, and Custom opens and closes a picker for any other colour. */
function ColorSlot({ slot, value, onChange }: { slot: Slot; value: string; onChange: (v: string) => void }) {
  const name = title(slot);
  const custom = !PRESETS[slot].includes(value);
  const [picking, setPicking] = useState(false);
  return (
    <Popover.Root>
      <Popover.Trigger aria-label={`${name} colour, ${value}`} className="group grid cursor-pointer justify-items-center gap-1 rounded-lg py-1 text-xs text-muted-foreground hover:text-foreground data-[state=open]:text-foreground">
        <span className="size-[34px] rounded-full border-2 border-border group-hover:border-muted-foreground group-data-[state=open]:border-muted-foreground pointer-coarse:size-11" style={{ background: value }} />
        {name}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="top" sideOffset={6} collisionPadding={12} className="card z-40 grid max-h-(--radix-popover-content-available-height) gap-3 overflow-y-auto overscroll-contain p-3">
          <h4 className="text-sm font-semibold">{name}</h4>
          <ToggleGroup type="single" aria-label={`${name} presets`} value={value} onValueChange={(v) => v && onChange(v)} className="grid grid-cols-4 gap-2">
            {PRESETS[slot].map((c) => (
              <ToggleGroupItem key={c} value={c} variant="swatch" aria-label={c} style={{ background: c }} />
            ))}
          </ToggleGroup>
          {/* The rainbow ring marks Custom; it takes the selection ring when the colour is no preset. */}
          <button type="button" aria-expanded={picking} onClick={() => setPicking(!picking)} className="group flex cursor-pointer items-center gap-2 border-t border-border pt-3 text-[13px]">
            <span className={cn('grid size-[34px] rounded-full bg-[conic-gradient(#f43f5e,#facc15,#22c55e,#22d3ee,#6366f1,#d946ef,#f43f5e)] p-[3px] pointer-coarse:size-11', custom && 'outline-2 outline-offset-2 outline-primary')}>
              <i className="rounded-full border-2 border-card" style={{ background: value }} />
            </span>
            Custom
            <span className="ml-auto font-mono text-xs text-muted-foreground group-hover:text-foreground">{value}</span>
          </button>
          {picking && (
            <>
              <HexColorPicker color={value} onChange={onChange} className="picker" />
              {/* Only full #rrggbb values reach the state, as the URL and snippets expect. */}
              <HexColorInput aria-label={`${name} hex`} color={value} onChange={(v) => v.length === 7 && onChange(v.toLowerCase())} prefixed className="h-8 w-0 min-w-full rounded-lg border-2 border-border bg-card px-2 font-mono text-xs" />
            </>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function Group({ title: heading, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{heading}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

export function Controls(p: {
  s: StudioState;
  dispatch: Dispatch<Action>;
  advanced: boolean;
  gaze: Gaze;
  onGaze: (g: Gaze) => void;
  follow: boolean;
  onFollow: (f: boolean) => void;
}) {
  const { s, dispatch } = p;
  return (
    <section aria-label="Controls" className="grid content-start gap-[18px] p-4">
      <Group title="Theme">
        <ToggleGroup type="single" aria-label="Theme" value={s.colors ? '' : s.theme} onValueChange={(id) => id && dispatch({ type: 'theme', id })} className="gap-2">
          {nox.themes.map((t) => (
            <ToggleGroupItem
              key={t.id}
              value={t.id}
              variant="swatch"
              aria-label={t.name}
              title={t.name}
              style={{ background: `linear-gradient(135deg, ${t.colors.shell[0]} 0 48%, ${t.colors.screen[0]} 52% 100%)` }}
            >
              <i className="absolute inset-[11px] rounded-full" style={{ background: t.colors.eye }} />
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Group>
      <Group title="Parts">
        {PARTS.map((part) => (
          <Row key={part} label={PART_LABELS[part]}>
            <ToggleGroup type="single" aria-label={PART_LABELS[part]} value={s.parts[part]} onValueChange={(id) => id && dispatch({ type: 'part', part, id })}>
              {nox.parts[part].map((v) => (
                <ToggleGroupItem key={v.id} value={v.id}>
                  {v.name}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Row>
        ))}
      </Group>
      <Group title="Personality">
        <ToggleGroup type="single" aria-label="Personality" value={s.personality} onValueChange={(name) => name && dispatch({ type: 'personality', name: name as Personality })}>
          {(Object.keys(PERSONALITIES) as Personality[]).map((name) => (
            <ToggleGroupItem key={name} value={name}>
              {title(name)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Group>
      {p.advanced && (
        <>
          {/* First in Advanced, so the pad sits beside the stage without scrolling (the user, 2026-10-07). */}
          <Group title="Gaze">
            <GazePad gaze={p.gaze} onGaze={p.onGaze} follow={p.follow} onFollow={p.onFollow} />
          </Group>
          <Group title="Custom colours">
            <div className="grid grid-cols-5 gap-1">
              {SLOTS.map((k) => (
                <ColorSlot key={k} slot={k} value={(s.colors ?? themeBase(s.theme))[k]} onChange={(value) => dispatch({ type: 'color', slot: k, value })} />
              ))}
            </div>
          </Group>
          <Group title="Sizes">
            {SIZE_KEYS.map((k) => (
              <SliderRow key={k} label={SIZE_LABELS[k]} min={0.7} max={1.3} step={0.01} value={s.sizes[k]} onChange={(value) => dispatch({ type: 'size', key: k, value })} />
            ))}
          </Group>
          <Group title="Motion">
            <SliderRow label="Speed" min={0.1} max={4} step={0.05} value={s.speed} onChange={(value) => dispatch({ type: 'speed', value })} />
            {/* Seed hidden for now (user, 2026-10-15); SeedField.tsx is kept to bring it back. A ?seed= link still applies. */}
          </Group>
          <Group
            title="Personality dials"
            action={
              <Button size="sm" variant="ghost" onClick={() => dispatch({ type: 'resetDials' })}>
                Reset dials
              </Button>
            }
          >
            {DIALS.map((k) => (
              <SliderRow key={k} label={title(k)} min={0} max={2} step={0.05} value={s.dials[k] ?? PERSONALITIES[s.personality][k]} onChange={(value) => dispatch({ type: 'dial', name: k, value })} />
            ))}
          </Group>
          <Group title="Size preview">
            <div className="flex items-end gap-4" aria-hidden="true">
              {/* Keyed on the state: a remount starts exactly in it, like the stage (showState); NoxyBot reads `state` on mount. */}
              {[32, 64, 128].map((px) => (
                <NoxyBot key={`${px}-${s.state}`} {...botProps({ ...s, seed: null })} state={s.state} style={{ width: px }} />
              ))}
            </div>
          </Group>
        </>
      )}
    </section>
  );
}
