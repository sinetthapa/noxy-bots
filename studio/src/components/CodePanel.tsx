// The code panel, in both modes (spec Q17): HTML/React/JS/JSON, Copy code, SVG/PNG export of the current frame, and the animation export (M4).
// It sits under the controls in the sidebar (App).
import type { Bot } from 'noxy-bots';
import { Check, Copy } from 'lucide-react';
import { memo, useRef, useState, type RefObject } from 'react';
import { toast } from 'sonner';
import { copy, copyKeys } from '../clipboard.ts';
import { exportImage } from '../export.ts';
import { FORMATS, highlight, snippet, type Format } from '../snippets.ts';
import { track } from '../track.ts';
import type { Gaze, StudioState } from '../state.ts';
import { AnimationDialog } from './AnimationDialog.tsx';
import { Group } from './Controls.tsx';
import { Button } from './ui/button.tsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs.tsx';

export const CodePanel = memo(function CodePanel({ s, bot, gaze }: { s: StudioState; bot: RefObject<Bot | null>; gaze: Gaze }) {
  const [format, setFormat] = useState<Format>('html');
  const pre = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false); // the button itself shows the copy for 1.6s, like the landing's (the user, 2026-10-15)
  const copyCode = async () => {
    track('code_copied', { format, page: 'studio' });
    if (await copy(snippet(s, format))) {
      setCopied(true);
      return void setTimeout(() => setCopied(false), 1600);
    }
    if (pre.current) getSelection()?.selectAllChildren(pre.current);
    toast(`Selected. Press ${copyKeys()} to copy.`);
  };
  const save = (size: number | 'svg') => {
    const b = bot.current;
    if (!b) return;
    track('export', size === 'svg' ? { format: 'svg' } : { format: 'png', size });
    void exportImage(b.snapshot(), size, (msg) => toast(msg));
  };
  return (
    <section aria-label="Code" className="grid gap-[18px] border-t border-border p-4">
      <Tabs value={format} onValueChange={(v) => setFormat(v as Format)} className="min-w-0">
        <div className="flex flex-wrap items-center gap-1">
          <TabsList aria-label="Code format">
            {FORMATS.map(([f, label]) => (
              <TabsTrigger key={f} value={f}>
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
          <Button variant="primary" size="sm" className="ml-auto h-7 gap-1 px-2 text-xs [&_svg]:size-3.5" onClick={copyCode}>
            {copied ? <Check /> : <Copy />}
            <span aria-live="polite">{copied ? 'Copied' : 'Copy code'}</span>
          </Button>
        </div>
        {FORMATS.map(([f]) => (
          <TabsContent key={f} value={f}>
            {/* dark in both schemes, like the landing's code window; highlight() escapes every character */}
            <pre ref={pre} tabIndex={0} className="dark mt-2.5 min-h-[92px] overflow-x-auto rounded-[18px] bg-background px-3.5 py-3 font-mono text-[12.5px] leading-[1.55] text-foreground">
              <code dangerouslySetInnerHTML={{ __html: highlight(snippet(s, f)) }} />
            </pre>
          </TabsContent>
        ))}
      </Tabs>
      <Group title="Export">
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" onClick={() => save('svg')}>
            SVG
          </Button>
          {[256, 512, 1024].map((n) => (
            <Button key={n} size="sm" onClick={() => save(n)}>
              PNG {n}
            </Button>
          ))}
          <AnimationDialog s={s} gaze={gaze} />
        </div>
      </Group>
    </section>
  );
});
