/** f = frequency (Hz), z = damping ratio, r = initial response (<0 anticipates, >1 overshoots). */
export interface SpringCfg {
  f: number;
  z: number;
  r: number;
}

/**
 * Second-order dynamics (t3ssel8r, "Giving Personality to Procedural Animations").
 * Follows a moving target with spring-like lag; k2 is clamped so large time steps stay stable.
 */
export class Spring {
  y: number;
  yd = 0;
  private xp: number;

  constructor(x0: number) {
    this.y = x0;
    this.xp = x0;
  }

  step(x: number, dt: number, c: SpringCfg): number {
    const f = Math.max(c.f, 0.01); // f = 0 (e.g. a slider at its minimum) would divide by zero
    const w = 2 * Math.PI * f;
    const k1 = c.z / (Math.PI * f);
    const k2 = 1 / (w * w);
    const k3 = (c.r * c.z) / w;
    const xd = (x - this.xp) / dt;
    this.xp = x;
    const k2s = Math.max(k2, (dt * dt) / 2 + (dt * k1) / 2, dt * k1);
    this.y += dt * this.yd;
    this.yd += (dt * (x + k3 * xd - this.y - k1 * this.yd)) / k2s;
    return this.y;
  }
}
