import { EASE } from '../brain/clips.ts';
import type { Pose } from '../brain/pose.ts';
import { DEFAULT_TUNING, type Tuning } from '../brain/tuning.ts';
import { mix } from '../character/colors.ts';
import type { Colors, Layout } from '../character/types.ts';

const SIDES = ['L', 'R'] as const;

const GLYPHS = ['squeeze', 'heart', 'star', 'ring', 'swirl'] as const;
const BULB_UP = 32; // lifts the bulb so its base clears the head

const f = (v: number) => Math.round(v * 100) / 100;

/**
 * The eye as one round-capped, round-joined stroke through 3 points, centred on 0,0. At chevron 0 it's a capsule
 * (a line along the long side, stroked as wide as the short side); at 1 its legs have spread into a rounded `^`.
 */
export function eyeStroke(w: number, h: number, chevron: number, r: Tuning['render'] = DEFAULT_TUNING.render): { d: string; width: number } {
  const c = Math.max(0.01, Math.abs(h - w) / 2); // keep a length so the round caps always draw a dot
  const pill: [number, number][] = h >= w ? [[0, c], [0, -c], [0, c]] : [[-c, 0], [0, 0], [c, 0]];
  const x = r.happyHalfW * w;
  const end = (r.happyApexY + r.happyRise) * h;
  const hat = [[-x, end], [0, r.happyApexY * h], [x, end]];
  const d = pill.map(([px, py], i) => `${i ? 'L' : 'M'}${f(px + (hat[i][0] - px) * chevron)} ${f(py + (hat[i][1] - py) * chevron)}`).join('');
  const short = Math.min(w, h);
  return { d, width: f(short + (r.happyStroke * w - short) * chevron) };
}

/** Lid baselines at x = 0. If the lids overlap (sum > 1) they're normalised to meet in one line. */
export function lidBaselines(
  h: number,
  upperY: number,
  lowerY: number,
  r: Tuning['render'] = DEFAULT_TUNING.render,
): { yu: number; yl: number } {
  const sum = upperY + lowerY;
  const u = sum > 1 ? upperY / sum : upperY;
  const l = sum > 1 ? lowerY / sum : lowerY;
  const edge = h / 2 + r.lidMargin;
  const span = h + 2 * r.lidMargin;
  return { yu: -edge + u * span, yl: edge - l * span };
}

export interface Lids {
  upperY: number;
  upperAngle: number;
  upperBend: number;
  lowerY: number;
  lowerAngle: number;
  lowerBend: number;
}

const LID_SEGMENTS = 16;

/**
 * The visible region between the lids as a polygon (eye-local coords; side = +1 when the eye's inner side is +x).
 * Each edge is a quadratic Bézier sampled at even x; the lower edge is clamped to the upper per column, so
 * crossed lids give zero height instead of an inverted band. Returns upper points left to right, then lower points right to left.
 */
export function lidPolygon(
  w: number,
  h: number,
  lids: Lids,
  side: 1 | -1,
  r: Tuning['render'] = DEFAULT_TUNING.render,
): [number, number][] {
  const { yu, yl } = lidBaselines(h, lids.upperY, lids.lowerY, r);
  const X = w / 2 + 12;
  const su = Math.tan((lids.upperAngle * Math.PI) / 180) * side; // + angle: inner side down
  const sl = Math.tan((lids.lowerAngle * Math.PI) / 180) * side; // + angle: inner side up
  const cu = yu + lids.upperBend * h * r.lidBend; // + bend: toward the eye centre
  const cl = yl - lids.lowerBend * h * r.lidBend;
  const quad = (p0: number, p1: number, p2: number, t: number) => (1 - t) * (1 - t) * p0 + 2 * t * (1 - t) * p1 + t * t * p2;
  const up: [number, number][] = [];
  const lo: [number, number][] = [];
  for (let i = 0; i <= LID_SEGMENTS; i++) {
    const t = i / LID_SEGMENTS;
    const x = X * (2 * t - 1);
    const u = quad(yu - su * X, cu, yu + su * X, t);
    up.push([x, u]);
    lo.push([x, Math.max(u, quad(yl + sl * X, cl, yl - sl * X, t))]);
  }
  return [...up, ...lo.reverse()];
}

export function lidClipPath(w: number, h: number, lids: Lids, side: 1 | -1, r: Tuning['render'] = DEFAULT_TUNING.render): string {
  return lidPolygon(w, h, lids, side, r).map(([x, y], i) => `${i ? 'L' : 'M'}${f(x)} ${f(y)}`).join('') + 'Z';
}

/** Vertical lift (px, up) of loader dot i (0 = left eye, 1 = middle, 2 = right eye) at phase 0..1. */
export function loaderLift(phase: number, i: number, r: Tuning['render'] = DEFAULT_TUNING.render): number {
  const x = phase - i * r.loaderStagger;
  const u = x - Math.floor(x);
  return u < r.loaderBump ? r.loaderBouncePx * Math.sin((Math.PI * u) / r.loaderBump) : 0;
}

/** Scale for a shape popping in: 0 → 1 with a small overshoot (outBack) on the way. */
export const popScale = (v: number): number => (v <= 0 ? 0 : EASE.outBack(Math.min(1, v)));

/** Upper edge curve plus a lower edge that drops with `open`; at open 0 it's a single stroked curve. */
export function mouthPath(width: number, curve: number, open: number, r: Tuning['render'] = DEFAULT_TUNING.render): string {
  const hw = f(r.mouthHalfWidth * width);
  const cu = f(r.mouthCurvePx * curve);
  const cl = f(r.mouthCurvePx * curve + r.mouthOpenPx * open);
  return `M${-hw} 0Q0 ${cu} ${hw} 0Q0 ${cl} ${-hw} 0Z`;
}

export const eyeColor = (b: number, c: Colors): string =>
  b <= 1 ? mix(c.eyeDim, c.eye, b) : mix(c.eye, c.eyeBright, (b - 1) / 0.6);
export const accentColor = (g: number, c: Colors): string => mix(c.accent, c.accentLit, g);

/**
 * Draws a Pose onto a rig from buildRig by setting attributes; `layout` (resolveLook) supplies the geometry and
 * colours. Throws if the rig is missing an id. It doesn't draw on creation: until the first draw() the right
 * ear and bolt sit on top of the left ones, so whoever mounts the rig draws before the next paint. `prefix` must
 * match the one the rig was built with.
 */
export function createSvgRenderer(svg: SVGSVGElement, layout: Layout, tuning: Tuning, { prefix = '' }: { prefix?: string } = {}) {
  const $ = (id: string): SVGElement => {
    const el = svg.querySelector<SVGElement>(`#${prefix}${id}`);
    if (!el) throw new Error(`nox rig is missing #${prefix}${id}`);
    return el;
  };
  const root = $('nox');
  const body = $('body');
  const shadow = $('shadow');
  const face = $('face');
  const grad = $('grad-shell');
  const mouth = $('mouth');
  const mouthShape = $('mouth-shape');
  const loaderDot = $('loader-dot');
  const ear = { L: $('ear-l'), R: $('ear-r') };
  const bolt = { L: $('bolt-l'), R: $('bolt-r') };
  const eye = { L: $('eye-l'), R: $('eye-r') };
  const eyeShape = { L: $('eye-l-shape'), R: $('eye-r-shape') };
  const glyphs = (s: 'l' | 'r') =>
    Object.fromEntries(GLYPHS.map((n) => [n, $(`eye-${s}-${n}`)])) as Record<(typeof GLYPHS)[number], SVGElement>;
  const glyph = { L: glyphs('l'), R: glyphs('r') };
  const sym = { bang: $('sym-bang'), ask: $('sym-ask'), bulb: $('sym-bulb') };
  const bulbRays = $('sym-bulb-rays');
  const bulbGlow = $('sym-bulb-glow');
  const zs = [$('sym-z1'), $('sym-z2'), $('sym-z3')];
  const badge = $('badge');
  const badgeGlow = $('badge-glow');
  const badgeRipple = $('badge-ripple');
  const boltHalo = { L: $('bolt-l-halo'), R: $('bolt-r-halo') };
  $('symbols'); // contract check only: the group itself is never transformed
  const lidClip = { L: $('clip-eye-l-path'), R: $('clip-eye-r-path') };
  // Skips a write equal to the last one: an idle bot changes about a quarter of its attributes per frame, a still one almost none.
  const written = new Map<Element, Record<string, string>>();
  const set = (el: Element, name: string, value: string | number) => {
    const v = String(value);
    let w = written.get(el);
    if (!w) written.set(el, (w = {}));
    if (w[name] === v) return;
    w[name] = v;
    el.setAttribute(name, v);
  };

  const { colors: C, tilt: TILT, squash: SQUASH, shadow: SHADOW, mouth: MOUTH, loader: LOADER, symbols: SYM, badge: BADGE, zzz: Z } = layout;

  function draw(p: Pose): void {
    const R = tuning.render;
    const yaw = p.yaw;
    const ay = Math.abs(yaw);

    // Body: float/lean on the root, tilt about the head centre, squash about the base (sx = 1/√sy).
    const sy = 1 - p.squash;
    const sx = 1 / Math.sqrt(sy);
    set(root, 'transform', `translate(${p.lean} ${-p.floatY})`);
    set(
      body,
      'transform',
      `rotate(${p.tilt} ${TILT[0]} ${TILT[1]}) ` +
        `translate(${SQUASH[0]} ${SQUASH[1]}) scale(${sx} ${sy}) translate(${-SQUASH[0]} ${-SQUASH[1]})`,
    );
    const k = Math.max(0.5, 1 - R.shadowScale * p.floatY);
    set(shadow, 'transform', `translate(${p.lean} 0) translate(${SHADOW[0]} ${SHADOW[1]}) scale(${k}) translate(${-SHADOW[0]} ${-SHADOW[1]})`);
    set(shadow, 'opacity', R.shadowOpacity * Math.min(1, Math.max(0, 1 - R.shadowFade * p.floatY)));

    // 2.5D yaw: the face slides, the far ear foreshortens, the bolt turning toward the viewer grows,
    // and the shell highlight drifts the opposite way.
    set(face, 'transform', `translate(${yaw * R.yawFacePx} 0)`);
    set(grad, 'x1', layout.highlight[0] - yaw * R.yawHighlightPx);
    set(grad, 'x2', layout.highlight[1] - yaw * R.yawHighlightPx);
    const boltFill = accentColor(p.accentGlow, C);
    for (const s of SIDES) {
      // The right side is the left art mirrored (x scale × −1), its pivot moved onto the right anchor.
      const m = s === 'L' ? 1 : -1;
      const [ex, ey] = layout.ear.anchor[s];
      const [px, py] = layout.ear.pivot;
      const es = layout.ear.size;
      const far = (yaw > 0 && s === 'R') || (yaw < 0 && s === 'L');
      const earSx = far ? 1 - R.yawEarSquash * ay : 1;
      const angle = p[`ear${s}.angle` as const] * (s === 'L' ? -1 : 1); // + = outward on both sides
      set(
        ear[s],
        'transform',
        `translate(${ex + yaw * R.yawEarShiftPx} ${ey}) rotate(${angle}) scale(${m * earSx * es} ${p[`ear${s}.scaleY` as const] * es}) translate(${-px} ${-py})`,
      );

      const grows = (yaw > 0 && s === 'L') || (yaw < 0 && s === 'R');
      const accSx = grows ? 1 + R.yawAccentGrow * ay : 1 - R.yawAccentShrink * ay;
      const [bx, by] = layout.bolt.anchor[s];
      const [qx, qy] = layout.bolt.pivot;
      const bs = layout.bolt.size;
      set(bolt[s], 'transform', `translate(${bx} ${by}) scale(${m * accSx * bs} ${bs}) translate(${-qx} ${-qy})`);
      set(bolt[s], 'fill', boltFill);
      set(boltHalo[s], 'opacity', f(Math.min(1, p.accentGlow * R.accentHalo))); // the glow behind the bolt
    }

    // Eyes: look offsets + Vector-style look-at scaling, a capsule stroke that can morph into ^, lids as a clip region.
    const up = Math.max(0, -p.lookY);
    const down = Math.max(0, p.lookY);
    const lookScale = 1 + R.lookUpScale * up - R.lookDownScale * down;
    const eyeFill = eyeColor(p.eyeBrightness, C);
    const ld = p.loader; // 0..1: eyes morph into loading dots
    const lk = 1 - ld;
    const gv = { squeeze: p.glyphSqueeze, heart: p.glyphHeart, star: p.glyphStar, ring: p.glyphRing, swirl: p.glyphSwirl };
    const g = Math.max(...Object.values(gv)) * lk; // an eye shape replaces the eye; the loader wins over shapes
    for (const s of SIDES) {
      const side = s === 'L' ? 1 : -1; // inner (nose) side direction
      const open = p[`eye${s}.open` as const];
      const lead = 1 - R.lookLeadEye * p.lookX * side; // looking right enlarges the right eye
      let w = layout.eye.w * p[`eye${s}.scaleX` as const] * lookScale * (1 + R.closedWiden * (1 - open));
      let h = Math.max(R.closedMinH, layout.eye.h * p[`eye${s}.scaleY` as const] * lookScale * lead * open);
      w *= 1 - g;
      h *= 1 - g;
      w += (R.loaderDotPx - w) * ld;
      h += (R.loaderDotPx - h) * ld;
      const [cx, cy] = layout.eye.c[s];
      const dx = yaw * R.yawEyesPx + p.lookX * R.lookXPx + side * R.lookConvergePx * down;
      const lift = loaderLift(p.loaderPhase, s === 'L' ? 0 : 2, R) * ld;
      set(eye[s], 'transform', `translate(${cx + dx} ${cy + p.lookY * R.lookYPx - lift})`);
      for (const n of GLYPHS) {
        const v = gv[n] * lk;
        const spin = n === 'ring' || n === 'swirl' ? `rotate(${f(p.glyphSpin * 360)}) ` : '';
        set(glyph[s][n], 'transform', `${spin}scale(${f(popScale(v) * (n === 'heart' ? R.heartScale : 1))})`);
        set(glyph[s][n], 'opacity', Math.min(1, v * 4));
        set(glyph[s][n], n === 'heart' || n === 'star' ? 'fill' : 'stroke', eyeFill);
      }
      const chevron = p[`eye${s}.chevron` as const] * lk;
      const lid = lk * (1 - chevron); // lids open as the eye turns into ^, so they never clip it
      const stroke = eyeStroke(w, h, chevron, R);
      set(eyeShape[s], 'd', stroke.d);
      set(eyeShape[s], 'stroke-width', stroke.width);
      set(eyeShape[s], 'stroke', eyeFill);
      set(
        lidClip[s],
        'd',
        lidClipPath(
          w,
          h,
          {
            upperY: p[`eye${s}.upperLidY` as const] * lid,
            upperAngle: p[`eye${s}.upperLidAngle` as const] * lid,
            upperBend: p[`eye${s}.upperLidBend` as const] * lid,
            lowerY: p[`eye${s}.lowerLidY` as const] * lid,
            lowerAngle: p[`eye${s}.lowerLidAngle` as const] * lid,
            lowerBend: p[`eye${s}.lowerLidBend` as const] * lid,
          },
          side,
          R,
        ),
      );
    }

    // Middle loading dot: pops in over the last 60% of the morph and bounces with the eyes.
    const lift1 = loaderLift(p.loaderPhase, 1, R) * ld;
    set(
      loaderDot,
      'transform',
      `translate(${LOADER[0] + yaw * R.yawEyesPx + p.lookX * R.lookXPx} ${LOADER[1] + p.lookY * R.lookYPx - lift1})`,
    );
    set(loaderDot, 'r', (R.loaderDotPx / 2) * Math.min(1, Math.max(0, (ld - 0.4) / 0.6)));
    set(loaderDot, 'fill', eyeFill);

    // Symbols above the head, the Zzz drift and the notification badge.
    const symX = SYM[0] + yaw * R.yawFacePx;
    for (const [n, v] of [['bang', p.symBang], ['ask', p.symAsk], ['bulb', p.symBulb]] as const) {
      set(sym[n], 'transform', `translate(${f(symX)} ${SYM[1] - (n === 'bulb' ? BULB_UP : 0)}) scale(${f(popScale(v) * R.symbolScale)})`);
      set(sym[n], 'opacity', Math.min(1, v * 4));
    }
    set(bulbRays, 'opacity', p.bulbLit);
    set(bulbRays, 'transform', `scale(${f(0.8 + 0.2 * p.bulbLit)})`); // rays push outward as the bulb lights
    set(bulbGlow, 'opacity', p.bulbLit);
    zs.forEach((z, i) => {
      const x = p.zPhase + i / 3;
      const u = x - Math.floor(x);
      const zx = Z.from[0] + (Z.to[0] - Z.from[0]) * u + Math.sin(u * 2 * Math.PI) * 6 + yaw * R.yawFacePx;
      const zy = Z.from[1] + (Z.to[1] - Z.from[1]) * u;
      set(z, 'transform', `translate(${f(zx)} ${f(zy)}) scale(${f((0.6 + 0.8 * u) * R.zzzScale)})`);
      set(z, 'opacity', p.symZ * Math.sin(Math.PI * u));
    });
    set(badge, 'transform', `translate(${f(BADGE[0] + yaw * R.yawEarShiftPx)} ${BADGE[1]}) scale(${f(popScale(p.badge) * R.badgeScale)})`);
    set(badge, 'opacity', Math.min(1, p.badge * 4));
    // With the pulse, the ripple ring swells and fades a little, and the dot's own glow brightens.
    set(badgeRipple, 'transform', `scale(${f(1 + R.badgeRipple * p.accentGlow)})`);
    set(badgeRipple, 'opacity', f(0.3 - 0.12 * p.accentGlow));
    set(badgeGlow, 'opacity', f(0.5 + 0.5 * p.accentGlow));

    set(mouth, 'transform', `translate(${MOUTH[0] + yaw * R.yawMouthPx} ${MOUTH[1]})`);
    set(mouth, 'opacity', p.mouthAlpha);
    set(mouthShape, 'd', mouthPath(p.mouthWidth, p.mouthCurve, p.mouthOpen, R));
    set(mouthShape, 'fill', p.mouthOpen > R.mouthFillAt ? C.mouth : 'none');
  }

  return { draw };
}
