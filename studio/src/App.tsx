// The studio (M3 spec §5): one reducer state; the URL, snippets and bot props derive from it. Events, gaze, pause and export use the ref.
// Layout (2026-10-15): a full-height app on the page's gradient. The canvas left, one sidebar right (mode and Copy link, controls,
// then code, then Privacy) that scrolls inside; 860px and below is one scrolling column.
import { type Bot, type EventName, type StateName } from 'noxy-bots';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { copy, copyKeys } from './clipboard.ts';
import { track } from './track.ts';
import { CodePanel } from './components/CodePanel.tsx';
import { Controls } from './components/Controls.tsx';
import { Stage } from './components/Stage.tsx';
import { SchemeButton, TopBar } from './components/TopBar.tsx';
import { Toaster } from './components/ui/sonner.tsx';
import { load, MODES, save, useScheme, type Mode } from './prefs.ts';
import { randomize, reduce, showState, type Gaze } from './state.ts';
import { link, parse, serialize, writeUrl } from './url.ts';

export function App() {
  const [first] = useState(() => parse(location.search));
  const [s, dispatch] = useReducer(reduce, first.state);
  const [mode, setMode] = useState<Mode>(() => load('noxy-studio-mode', MODES, 'simple'));
  const [, setScheme, dark] = useScheme();
  const [slot] = useState(() => document.getElementById('studio-bar')); // the site header's scheme slot; none in the standalone studio
  const [paused, setPaused] = useState(false);
  const [gaze, setGaze] = useState<Gaze>(null);
  const [badge, setBadge] = useState(false); // the notification badge: notify() plays the clip and holds it until seen()
  const [follow, setFollow] = useState(false);
  const bot = useRef<Bot | null>(null);
  const [attached, setAttached] = useState(0);
  const query = serialize(s);

  // A seed change remounts the stage's bot: re-apply what lives only on the bot (spec §5.2).
  const attach = useCallback((b: Bot | null) => {
    bot.current = b;
    if (b) setAttached((n) => n + 1);
  }, []);
  useEffect(() => {
    const b = bot.current;
    if (b) (paused ? b.pause() : b.resume());
  }, [paused, attached]);
  useEffect(() => {
    const b = bot.current;
    if (b) (gaze ? b.lookAt(gaze.x, gaze.y) : b.lookAt(null));
  }, [gaze, attached]);
  useEffect(() => {
    const b = bot.current;
    if (b) (badge ? b.notify() : b.seen());
  }, [badge, attached]);

  useEffect(() => {
    const n = first.ignored.length;
    if (n) toast(`Ignored ${n} ${n === 1 ? 'setting' : 'settings'} from the link: ${first.ignored.join(', ')}`, { id: 'ignored' }); // id: StrictMode runs this twice
  }, [first]);
  useEffect(() => {
    const t = setTimeout(() => writeUrl(query), 250); // one write per pause in a slider drag (Safari throttles bursts)
    return () => clearTimeout(t);
  }, [query]);
  useEffect(() => save('noxy-studio-mode', mode), [mode]);

  const pick = useCallback((name: StateName) => {
    dispatch({ type: 'state', name });
    if (bot.current) showState(bot.current, name);
  }, []);
  const play = useCallback((name: EventName) => bot.current?.state(name), []);
  const shuffle = useCallback(() => dispatch({ type: 'replace', state: randomize(s) }), [s]); // stable across gaze updates, so Stage's memo holds
  // Resolves true once copied: the button shows that itself.
  const copyLink = async () => {
    const url = link(query);
    track('link_copied');
    if (await copy(url)) return true;
    // No clipboard (a plain-http page, or permission denied): show the link itself; one click selects all of it.
    toast(`Couldn't copy. Select the link and press ${copyKeys()}.`, {
      description: <span className="font-mono text-xs break-all select-all">{url}</span>,
      duration: 15_000,
    });
    return false;
  };
  const aim = (g: Gaze) => {
    setFollow(false);
    setGaze(g);
  };
  const followPointer = (f: boolean) => {
    setFollow(f);
    if (!f) setGaze(null);
  };

  const bar = (
    <>
      <h1 className="sr-only">Studio</h1>
      <SchemeButton dark={dark} onScheme={() => setScheme(dark ? 'light' : 'dark')} />
    </>
  );
  return (
    <>
      {slot ? createPortal(bar, slot) : <header className="flex h-14 items-center justify-end gap-2 px-4">{bar}</header>}
      <div className="grid grid-cols-1 gap-4 px-4 pt-2 pb-4 min-[861px]:h-[calc(100dvh-3.5rem)] min-[861px]:grid-cols-[minmax(0,1fr)_360px] min-[861px]:grid-rows-[minmax(0,1fr)] min-[1600px]:grid-cols-[minmax(0,1fr)_400px]">
        <Stage s={s} attach={attach} paused={paused} onPause={setPaused} follow={follow} onGaze={setGaze} onPick={pick} onPlay={play} badge={badge} onBadge={setBadge} onRandomize={shuffle} />
        <div className="card scroll-shadows grid content-start min-[861px]:max-h-full min-[861px]:self-start min-[861px]:overflow-y-auto min-[861px]:overscroll-contain">
          <TopBar mode={mode} onMode={setMode} onCopyLink={copyLink} />
          <Controls s={s} dispatch={dispatch} advanced={mode === 'advanced'} gaze={gaze} onGaze={aim} follow={follow} onFollow={followPointer} />
          {/* follow-pointer isn't recorded (Q9); with it on this stays null, so the memo holds */}
          <CodePanel s={s} bot={bot} gaze={follow ? null : gaze} />
          {/* Privacy above 860px, where /studio has no footer (the user, 2026-10-18) */}
          <p className="hidden border-t border-border px-4 py-3 text-xs text-muted-foreground min-[861px]:block">
            <a href="/privacy" className="hover:text-foreground">
              Privacy
            </a>
          </p>
        </div>
      </div>
      <Toaster theme={dark ? 'dark' : 'light'} />
    </>
  );
}
