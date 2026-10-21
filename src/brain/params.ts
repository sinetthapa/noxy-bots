export type Rule = 'add' | 'mul' | 'min' | 'max';

export interface ParamDef {
  def: number;
  min: number;
  max: number;
  rule: Rule;
}

// One flat list of everything the renderer can draw. Signs:
// floatY + = up · squash + = squashed, − = stretched · lookX/lookY + = right/down
// eye lid angle: upper + = inner side down (angry), lower + = inner side up · lid bend + = toward eye center
// ear angle + = outward/down (droop), − = up/forward (alert)
// chevron 0 = capsule eye, 1 = rounded ^ (happy) · loader 0..1 = eyes morph into 3 loading dots
// glyph* 0..1 = eye shape pops in (squeeze = > <), glyphSpin in turns · sym* 0..1 = symbol above the head · badge = notification pending
const eye = (rule: Rule, def: number, min: number, max: number): ParamDef => ({ def, min, max, rule });

export const PARAMS = {
  floatY: { def: 0, min: -30, max: 30, rule: 'add' },
  squash: { def: 0, min: -0.4, max: 0.4, rule: 'add' },
  tilt: { def: 0, min: -25, max: 25, rule: 'add' },
  lean: { def: 0, min: -40, max: 40, rule: 'add' },
  yaw: { def: 0, min: -1, max: 1, rule: 'add' },
  lookX: { def: 0, min: -1, max: 1, rule: 'add' },
  lookY: { def: 0, min: -1, max: 1, rule: 'add' },
  eyeBrightness: { def: 1, min: 0, max: 1.6, rule: 'mul' },
  'eyeL.open': eye('min', 1, 0, 1),
  'eyeL.scaleX': eye('mul', 1, 0.5, 1.6),
  'eyeL.scaleY': eye('mul', 1, 0.5, 1.6),
  'eyeL.upperLidY': eye('max', 0, 0, 1),
  'eyeL.upperLidAngle': eye('add', 0, -35, 35),
  'eyeL.upperLidBend': eye('add', 0, -1, 1),
  'eyeL.lowerLidY': eye('max', 0, 0, 1),
  'eyeL.lowerLidAngle': eye('add', 0, -35, 35),
  'eyeL.lowerLidBend': eye('add', 0, -1, 1),
  'eyeL.chevron': eye('max', 0, 0, 1),
  'eyeR.open': eye('min', 1, 0, 1),
  'eyeR.scaleX': eye('mul', 1, 0.5, 1.6),
  'eyeR.scaleY': eye('mul', 1, 0.5, 1.6),
  'eyeR.upperLidY': eye('max', 0, 0, 1),
  'eyeR.upperLidAngle': eye('add', 0, -35, 35),
  'eyeR.upperLidBend': eye('add', 0, -1, 1),
  'eyeR.lowerLidY': eye('max', 0, 0, 1),
  'eyeR.lowerLidAngle': eye('add', 0, -35, 35),
  'eyeR.lowerLidBend': eye('add', 0, -1, 1),
  'eyeR.chevron': eye('max', 0, 0, 1),
  'earL.angle': { def: 0, min: -40, max: 100, rule: 'add' },
  'earL.scaleY': { def: 1, min: 0.6, max: 1.3, rule: 'mul' },
  'earR.angle': { def: 0, min: -40, max: 100, rule: 'add' },
  'earR.scaleY': { def: 1, min: 0.6, max: 1.3, rule: 'mul' },
  mouthOpen: { def: 0, min: 0, max: 1, rule: 'max' },
  mouthCurve: { def: 0.6, min: -1, max: 1, rule: 'add' },
  mouthWidth: { def: 1, min: 0.5, max: 1.6, rule: 'mul' },
  mouthAlpha: { def: 0, min: 0, max: 1, rule: 'max' },
  accentGlow: { def: 0, min: 0, max: 1, rule: 'max' },
  loader: { def: 0, min: 0, max: 1, rule: 'max' },
  loaderPhase: { def: 0, min: 0, max: 1, rule: 'max' },
  glyphSqueeze: { def: 0, min: 0, max: 1, rule: 'max' },
  glyphHeart: { def: 0, min: 0, max: 1, rule: 'max' },
  glyphStar: { def: 0, min: 0, max: 1, rule: 'max' },
  glyphRing: { def: 0, min: 0, max: 1, rule: 'max' },
  glyphSwirl: { def: 0, min: 0, max: 1, rule: 'max' },
  glyphSpin: { def: 0, min: 0, max: 100, rule: 'max' },
  symBang: { def: 0, min: 0, max: 1, rule: 'max' },
  symAsk: { def: 0, min: 0, max: 1, rule: 'max' },
  symBulb: { def: 0, min: 0, max: 1, rule: 'max' },
  bulbLit: { def: 0, min: 0, max: 1, rule: 'max' },
  symZ: { def: 0, min: 0, max: 1, rule: 'max' },
  zPhase: { def: 0, min: 0, max: 1, rule: 'max' },
  badge: { def: 0, min: 0, max: 1, rule: 'max' },
} satisfies Record<string, ParamDef>;

export type ParamKey = keyof typeof PARAMS;
export const PARAM_KEYS = Object.keys(PARAMS) as ParamKey[];
