// The state dock under Nox (spec 2026-10-15): one tab per layer, so 29 names fit one short card. Base, activity and emotion
// tabs are radio groups; events are plain buttons, except notification: it toggles the badge (notify, then seen), like the playground's Notify/Seen. Any other event clears it (the user, 2026-10-16). It opens on the current state's tab and follows it when the state changes.
// Every panel stays mounted in one grid cell, inactive ones invisible: the dock is as tall as its tallest tab, so Nox never shifts.
// `action` (Randomize, Pause/Play) sits at the end of the tab row: the dock is the bot's playback bar.
import { NAMES, type EventName, type StateName } from 'noxy-bots';
import { useState, type ReactNode } from 'react';
import { Button } from './ui/button.tsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs.tsx';
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group.tsx';

const PICKABLE = [['base', 'Base'], ['activity', 'Activity'], ['emotion', 'Emotion']] as const;
type Layer = (typeof PICKABLE)[number][0];
const STACKED = '[grid-area:1/1] data-[state=inactive]:invisible';

export const layerOf = (n: StateName): Layer => PICKABLE.find(([l]) => (NAMES[l] as readonly string[]).includes(n))![0];

export function StateBoard(p: {
  value: StateName;
  onPick: (n: StateName) => void;
  onPlay: (n: EventName) => void;
  badge?: boolean;
  onBadge?: (on: boolean) => void;
  action?: ReactNode;
}) {
  const { value, onPick, onPlay, badge = false, action } = p;
  const here = layerOf(value);
  const [tab, setTab] = useState<string>(here);
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    // a new state from outside (Randomize, a link): show its tab
    setSeen(value);
    setTab(here);
  }
  return (
    <Tabs value={tab} onValueChange={setTab} className="card grid w-full max-w-[720px] gap-2.5 p-3">
      <h2 className="sr-only">States</h2>
      <div className="flex items-center gap-2">
        <TabsList aria-label="State layer">
          {[...PICKABLE, ['event', 'Event'] as const].map(([l, label]) => (
            <TabsTrigger key={l} value={l} className="inline-flex items-center gap-1.5">
              {label}
              {l === here && <i aria-hidden="true" className="size-1.5 rounded-full bg-primary" />}
            </TabsTrigger>
          ))}
        </TabsList>
        <div className="ml-auto flex gap-2">{action}</div>
      </div>
      <div className="grid">
        {PICKABLE.map(([l, label]) => (
          <TabsContent key={l} value={l} forceMount className={STACKED}>
            <ToggleGroup type="single" aria-label={`${label} states`} value={l === here ? value : ''} onValueChange={(v) => v && onPick(v as StateName)}>
              {NAMES[l].map((n) => (
                <ToggleGroupItem key={n} value={n}>
                  {n}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </TabsContent>
        ))}
        <TabsContent value="event" forceMount className={`flex flex-wrap content-start gap-1.5 ${STACKED}`}>
          {NAMES.event.map((n) =>
            n === 'notification' ? (
              <Button key={n} size="sm" variant={badge ? 'primary' : 'event'} aria-pressed={badge} onClick={() => p.onBadge?.(!badge)}>
                {n}
              </Button>
            ) : (
              <Button
                key={n}
                size="sm"
                variant="event"
                onClick={() => {
                  onPlay(n);
                  if (badge) p.onBadge?.(false);
                }}
              >
                {n}
              </Button>
            ),
          )}
        </TabsContent>
      </div>
    </Tabs>
  );
}
