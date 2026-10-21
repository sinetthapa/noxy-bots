// A character as data (spec §4): parts with variants, anchors and colour tokens. buildRig turns it into an SVG.

export type XY = [number, number];
export type FlatToken = 'trim' | 'accent' | 'accentLit' | 'glow' | 'eye' | 'eyeDim' | 'eyeBright' | 'mouth' | 'symbol';
export type GradientToken = 'shell' | 'earShell' | 'screen'; // two stops each
export type Colors = Record<FlatToken, string> & Record<GradientToken, [string, string]>;
/** `{ gradient }` names a GradientDef id; black is the shadow only. */
export type Paint = FlatToken | { gradient: string } | 'none' | '#000000';

/** The SVG subset the importer accepts (spec §6). */
export interface Shape {
  tag: 'path' | 'rect' | 'circle' | 'ellipse';
  attrs: Record<string, string | number>; // geometry and presentation attributes except colours and transform
  fill?: Paint;
  stroke?: Paint;
  id?: string; // kept where the rig needs it (shadow, head-shell, glyph ids); never in side art
}
export interface Group {
  tag: 'g';
  id?: string;
  attrs: Record<string, string | number>;
  children: Node[];
}
export type Node = Shape | Group;
export interface GradientDef {
  id: string;
  kind: 'linear' | 'radial';
  attrs: Record<string, string | number>;
  token: GradientToken;
}

export interface Body {
  id: string;
  name: string;
  shell: Node[];
  screen: Node[];
  shadow: Shape; // frame coordinates
  gradients: GradientDef[]; // includes grad-shell (the renderer drives its x1/x2)
  axisX: number; // left/right parts mirror about this
  eye: XY; // left eye centre; right = mirror
  ear: XY; // left anchors; right = mirror. A side's own pivot lands here
  bolt: XY;
  mouth: XY;
  tilt: XY;
  squash: XY;
  shadowC: XY; // the shadow ellipse's cx/cy
  symbols: XY;
  badge: XY;
  zzz: { from: XY; to: XY };
  highlight: [number, number]; // grad-shell x1/x2
}
/**
 * The LEFT side's art in frame coordinates, as drawn, hinged at `pivot`. `bounds` is [x1, y1, x2, y2] in the
 * same coordinates (the halo uses it). A side with no shapes is the "none" variant.
 */
export interface Side {
  id: string;
  name: string;
  shapes: Node[];
  gradients: GradientDef[];
  pivot: XY;
  bounds: [number, number, number, number];
}
/** The eye stays procedural (stroke plus lids); a variant is just its size. */
export interface Eye {
  id: string;
  name: string;
  w: number;
  h: number;
}
export interface Theme {
  id: string;
  name: string;
  /** The five colours the theme is drawn from; `shell` is the shell's bottom stop (M3 spec §4.2). */
  base: ThemeBase;
  colors: Colors;
}
export interface Character {
  id: string;
  name: string;
  frame: [number, number, number, number]; // viewBox every combination must fit
  parts: { body: Body[]; ears: Side[]; eyes: Eye[]; bolts: Side[] };
  shared: Node[]; // glyphs, symbols, Zzz and badge art (local coordinates, ids kept)
  themes: Theme[];
  license: { art: 'CC-BY-4.0'; author: string; source: string };
}
export interface ThemeBase {
  shell: string;
  screen: string;
  eye: string;
  accent: string;
  mouth: string;
}
export interface Look {
  body: string;
  ears: string;
  eyes: string;
  bolts: string;
  sizes: { eye: number; eyeSpacing: number; ear: number; bolt: number }; // 0.7–1.3, default 1
  theme: string | { base: ThemeBase };
}
/** resolveLook's output: everything the renderer reads. */
export interface Layout {
  eye: { w: number; h: number; c: { L: XY; R: XY } }; // sizes.eye and sizes.eyeSpacing applied
  ear: { anchor: { L: XY; R: XY }; pivot: XY; size: number }; // pivot = the side art's own hinge
  bolt: { anchor: { L: XY; R: XY }; pivot: XY; size: number };
  loader: XY; // midpoint of the eye centres
  mouth: XY;
  tilt: XY;
  squash: XY;
  shadow: XY;
  symbols: XY;
  badge: XY;
  zzz: { from: XY; to: XY };
  highlight: [number, number];
  colors: Colors;
}
