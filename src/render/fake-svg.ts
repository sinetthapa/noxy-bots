/**
 * Test helper: a fake <svg> root backed by a rig string. `querySelector('#x')` finds an element only if the
 * string has `id="x"`, so a renderer drawing onto it fails exactly when a real rig would be missing the id.
 * `attrs` keeps the last value set per "id attribute": the first draw sets every attribute, so after any draw it
 * is the whole frame. `writes` counts setAttribute calls.
 */
export function fakeSvg(rig: string): { svg: SVGSVGElement; attrs: Record<string, string>; writes: number } {
  const out = { svg: null as unknown as SVGSVGElement, attrs: {} as Record<string, string>, writes: 0 };
  const el = (id: string) => ({
    setAttribute: (name: string, value: string) => {
      out.writes++;
      out.attrs[`${id} ${name}`] = value;
    },
  });
  out.svg = { querySelector: (sel: string) => (rig.includes(`id="${sel.slice(1)}"`) ? el(sel.slice(1)) : null) } as unknown as SVGSVGElement;
  return out;
}
