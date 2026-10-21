// The studio's actions (M3 spec §5.4). TopBar heads the sidebar (2026-10-15): Simple/Advanced, then Copy link as an icon with a
// tooltip (Randomize is in the state dock). SchemeButton goes in the site header's #studio-bar (App portals it), where other pages have theirs.
import { Check, Link2, Moon, Sun } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { Mode } from '../prefs.ts';
import { Button } from './ui/button.tsx';
import { Tooltip } from './ui/tooltip.tsx';
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group.tsx';

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void }) {
  return (
    <ToggleGroup type="single" aria-label={label} value={value} onValueChange={(v) => v && onChange(v as T)} className="gap-0.5 rounded-lg bg-muted p-0.5">
      {options.map(([v, text]) => (
        <ToggleGroupItem key={v} value={v} variant="segment">
          {text}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

function Action({ label, icon, onClick }: { label: string; icon: ReactNode; onClick: () => void }) {
  return (
    <Tooltip label={label}>
      <Button size="icon" aria-label={label} onClick={onClick}>
        {icon}
      </Button>
    </Tooltip>
  );
}

export function TopBar(p: { mode: Mode; onMode: (m: Mode) => void; onCopyLink: () => Promise<boolean> }) {
  const [copied, setCopied] = useState(false); // the button itself shows the copy for 1.6s (the user, 2026-10-15)
  const copyLink = async () => {
    if (!(await p.onCopyLink())) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  return (
    <div className="flex items-center gap-2 border-b border-border px-4 py-3">
      <Segmented label="Mode" value={p.mode} onChange={p.onMode} options={[['simple', 'Simple'], ['advanced', 'Advanced']]} />
      <div className="ml-auto">
        <Action label={copied ? 'Link copied' : 'Copy link'} icon={copied ? <Check /> : <Link2 />} onClick={copyLink} />
        <span aria-live="polite" className="sr-only">
          {copied && 'Link copied'}
        </span>
      </div>
    </div>
  );
}

export function SchemeButton({ dark, onScheme }: { dark: boolean; onScheme: () => void }) {
  const label = dark ? 'Switch to light' : 'Switch to dark'; // the site header's scheme button, same words
  return (
    <Tooltip label={label}>
      <Button variant="ghost" size="icon" aria-label={label} onClick={onScheme}>
        {dark ? <Moon /> : <Sun />}
      </Button>
    </Tooltip>
  );
}
