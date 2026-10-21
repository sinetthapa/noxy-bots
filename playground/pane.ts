import { Pane, type ButtonApi, type FolderApi } from 'tweakpane';
import type { Nox } from '../src/brain/nox';
import { PARAMS, PARAM_KEYS, type ParamKey } from '../src/brain/params';
import { neutralPose, type Pose } from '../src/brain/pose';
import type { Character, Look, ThemeBase } from '../src/character/types';

export interface Transport {
  fps: number;
  timeScale: number;
  paused: boolean;
  manual: boolean;
}

type Container = Pick<Pane, 'addBinding' | 'addFolder'>;

const POSE_GROUPS: [string, (k: ParamKey) => boolean][] = [
  ['Body', (k) => ['floatY', 'squash', 'tilt', 'lean', 'yaw'].includes(k)],
  ['Look', (k) => k === 'lookX' || k === 'lookY' || k === 'eyeBrightness'],
  ['Eye L', (k) => k.startsWith('eyeL.')],
  ['Eye R', (k) => k.startsWith('eyeR.')],
  ['Ears', (k) => k.startsWith('ear')],
  ['Mouth, accents & loader', (k) => k.startsWith('mouth') || k === 'accentGlow' || k.startsWith('loader')],
  ['Eye shapes', (k) => k.startsWith('glyph')],
  ['Symbols & badge', (k) => k.startsWith('sym') || k === 'bulbLit' || k === 'zPhase' || k === 'badge'],
];

/** Binds every number in a nested tuning object, one folder per sub-object. */
function bindNumbers(folder: Container, obj: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'number') {
      const min = value < 0 ? value * 3 : value > 0 ? value * 0.05 : 0;
      const max = value < 0 ? 0 : Math.max(1, value * 3);
      folder.addBinding(obj, key, { min, max });
    } else if (value && typeof value === 'object') {
      bindNumbers(folder.addFolder({ title: key, expanded: false }), value as Record<string, unknown>);
    }
  }
}

/** Only the params that differ from neutral, rounded: ready to paste into a preset. */
function poseDiff(p: Pose): Partial<Pose> {
  const n = neutralPose();
  const out: Partial<Pose> = {};
  for (const k of PARAM_KEYS) if (Math.abs(p[k] - n[k]) > 1e-3) out[k] = Math.round(p[k] * 1000) / 1000;
  return out;
}

/** Copies JSON on click and flashes the result in the button's title. clipboard is undefined on non-secure origins. */
function copyOnClick(btn: ButtonApi, get: () => unknown): void {
  const title = btn.title;
  btn.on('click', async () => {
    try {
      if (!navigator.clipboard) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(JSON.stringify(get(), null, 2));
      btn.title = 'Copied ✓';
    } catch {
      btn.title = 'Copy failed';
    }
    setTimeout(() => (btn.title = title), 1200);
  });
}

export interface LookOptions {
  character: Character;
  look: Look;
  onChange: (look: Look) => void;
  svg: () => SVGSVGElement;
}

/** The Look folder (spec §9): part and theme pickers, 5 custom colours, size sliders, copy JSON, download SVG. */
function addLookFolder(pane: Pane, { character: ch, look: initial, onChange, svg }: LookOptions): FolderApi {
  const names = (list: { id: string; name: string }[]) => Object.fromEntries(list.map((p) => [p.name, p.id]));
  const state = {
    body: initial.body,
    ears: initial.ears,
    eyes: initial.eyes,
    bolts: initial.bolts,
    theme: typeof initial.theme === 'string' ? initial.theme : 'custom',
    ...initial.sizes,
  };
  // Classic's base colours: picking "Custom" starts from them.
  const base: ThemeBase = { shell: '#92A7AD', screen: '#313E4F', eye: '#2EC7E6', accent: '#FA6C2E', mouth: '#EFEFEF' };
  const look = (): Look => ({
    body: state.body,
    ears: state.ears,
    eyes: state.eyes,
    bolts: state.bolts,
    sizes: { eye: state.eye, eyeSpacing: state.eyeSpacing, ear: state.ear, bolt: state.bolt },
    theme: state.theme === 'custom' ? { base: { ...base } } : state.theme,
  });

  const f = pane.addFolder({ title: 'Look' });
  f.addBinding(state, 'body', { options: names(ch.parts.body) });
  f.addBinding(state, 'ears', { options: names(ch.parts.ears) });
  f.addBinding(state, 'eyes', { options: names(ch.parts.eyes) });
  f.addBinding(state, 'bolts', { options: names(ch.parts.bolts) });
  f.addBinding(state, 'theme', { options: { ...names(ch.themes), Custom: 'custom' } });
  const colours = (Object.keys(base) as (keyof ThemeBase)[]).map((k) => f.addBinding(base, k, { label: `${k} colour` }));
  const syncColours = () => {
    for (const c of colours) c.disabled = state.theme !== 'custom';
  };
  syncColours();
  for (const [k, label] of [['eye', 'eye size'], ['eyeSpacing', 'eye spacing'], ['ear', 'ear size'], ['bolt', 'bolt size']] as const) {
    f.addBinding(state, k, { label, min: 0.7, max: 1.3, step: 0.01 });
  }
  f.on('change', () => {
    syncColours();
    onChange(look());
  });
  copyOnClick(f.addButton({ title: 'Copy look JSON' }), look);
  f.addButton({ title: 'Download SVG' }).on('click', () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([svg().outerHTML], { type: 'image/svg+xml' }));
    a.download = `nox-${state.body}-${state.ears}-${state.eyes}-${state.bolts}.svg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  return f;
}

export function createPane(container: HTMLElement, nox: Nox, transport: Transport, manualPose: Pose, step: () => void, lookOptions: LookOptions): Pane {
  const pane = new Pane({ container, title: 'Nox' });
  const lookFolder = addLookFolder(pane, lookOptions);
  // The Look folder changes only from its own widgets. Refreshing it re-reads a dragged colour as rgb, which fires a change and resets the picker's hue.
  pane.refresh = () => {
    for (const c of pane.children) if (c !== lookFolder) (c as Partial<FolderApi>).refresh?.();
  };

  const t = pane.addFolder({ title: 'Transport' });
  t.addBinding(transport, 'fps', { options: { '30 fps': 30, '60 fps': 60 } });
  t.addBinding(transport, 'timeScale', { min: 0.1, max: 2, step: 0.05 });
  t.addBinding(transport, 'paused');
  t.addButton({ title: 'Step 1 frame' }).on('click', step);
  const manual = t.addBinding(transport, 'manual', { label: 'manual pose' });

  const poseFolder = pane.addFolder({ title: 'Pose (enable manual pose to drag)' });
  const poseBindings: { disabled: boolean }[] = [];
  for (const [title, match] of POSE_GROUPS) {
    const f = poseFolder.addFolder({ title, expanded: false });
    for (const k of PARAM_KEYS) if (match(k)) poseBindings.push(f.addBinding(manualPose, k, { min: PARAMS[k].min, max: PARAMS[k].max }));
  }
  // Disable the bindings, not the folder: a disabled folder also blocks expanding its sub-folders.
  const setPoseDisabled = (disabled: boolean) => {
    for (const b of poseBindings) b.disabled = disabled;
  };
  setPoseDisabled(!transport.manual);
  manual.on('change', (ev) => {
    if (ev.value) {
      Object.assign(manualPose, nox.pose); // start from the brain's current pose, not the ~10 Hz mirror
      pane.refresh();
    }
    setPoseDisabled(!ev.value);
  });

  bindNumbers(pane.addFolder({ title: 'Tuning', expanded: false }), nox.tuning);

  copyOnClick(pane.addButton({ title: 'Copy pose JSON (non-default)' }), () => poseDiff(transport.manual ? manualPose : nox.pose));
  copyOnClick(pane.addButton({ title: 'Copy tuning JSON' }), () => nox.tuning);
  return pane;
}
