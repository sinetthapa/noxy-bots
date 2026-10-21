import { describe, expect, it } from 'vitest';
import { importPart, parseSvg } from './import.ts';

const FRAME: [number, number, number, number] = [0, 0, 100, 100];
const imp = (file: string, text: string) => importPart(file, text, FRAME);
const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100" fill="none">${body}</svg>`;
const PIVOT = '<circle id="pivot" cx="10" cy="20" r="3" fill="#FF00FF"/>';
const side = (body: string) => imp('bolts-test.svg', svg(body + PIVOT));
const MARKERS = ['axis', 'eye-l', 'ear-l', 'bolt-l', 'mouth', 'tilt', 'squash', 'symbols', 'badge', 'zzz-from', 'zzz-to']
  .map((id, i) => `<circle id="${id}" cx="${i}" cy="${i * 2}" r="4" fill="#FF00FF"/>`)
  .join('');
const BODY =
  '<defs><linearGradient id="grad-shell" x1="1" y1="2" x2="3" y2="4" gradientUnits="userSpaceOnUse"><stop stop-color="#FFFFFF"/><stop offset="1" stop-color="#92A7AD"/></linearGradient></defs>' +
  '<ellipse id="shadow" cx="50" cy="90" rx="30" ry="4" fill="#000000" opacity="0.22"/>' +
  '<g id="shell"><rect id="head-shell" x="10" y="10" width="80" height="70" rx="20" fill="url(#grad-shell)"/></g>' +
  '<g id="screen"><rect x="20" y="20" width="60" height="50" fill="#95A9AF"/></g>';

describe('parseSvg', () => {
  it('reads elements, attributes and nesting, skipping comments and the prolog', () => {
    const el = parseSvg('<?xml version="1.0"?><!-- hi <g> --><svg a="1"><g id="x"><path d="M0 0"/></g></svg>');
    expect(el).toEqual({ tag: 'svg', attrs: { a: '1' }, children: [{ tag: 'g', attrs: { id: 'x' }, children: [{ tag: 'path', attrs: { d: 'M0 0' }, children: [] }] }] });
  });
});

describe('importPart', () => {
  it('reads a side: coordinates as drawn, colours as tokens (any case), pivot, bounds', () => {
    const { kind, part } = side('<rect x="0" y="10" width="20" height="40" rx="5" fill="#fa6c2e"/><path d="M30 5L40 60H45V2Z" fill="#95A9AF"/>');
    expect(kind).toBe('bolts');
    expect(part).toMatchObject({
      id: 'test',
      name: 'Test',
      pivot: [10, 20],
      bounds: [0, 2, 45, 60],
      shapes: [
        { tag: 'rect', attrs: { x: '0', y: '10', width: '20', height: '40', rx: '5' }, fill: 'accent' },
        { tag: 'path', attrs: { d: 'M30 5L40 60H45V2Z' }, fill: 'trim' },
      ],
    });
  });

  it('reads compact path numbers for bounds', () => {
    expect(side('<path d="M-.5.5L1e1 2.5.5Z" fill="#95A9AF"/>').part).toMatchObject({ bounds: [-0.5, 0.5, 10, 2.5] });
  });

  it('shifts a Figma-style export (viewBox at 0 0) onto the frame', () => {
    const figma = '<svg viewBox="0 0 100 100"><defs><linearGradient id="g" x1="10" y1="20" x2="30" y2="40" gradientUnits="userSpaceOnUse"><stop stop-color="#FFFFFF"/><stop offset="1" stop-color="#D9E0E3"/></linearGradient></defs>' +
      '<path d="M60 70L80 90H70V65Z" fill="url(#g)"/><rect x="50" y="50" width="5" height="5" fill="#FA6C2E"/><circle id="pivot" cx="60" cy="70" r="3" fill="#FF00FF"/></svg>';
    const { part } = importPart('ears-fig.svg', figma, [-50, -20, 100, 100]);
    expect(part).toMatchObject({
      pivot: [10, 50],
      bounds: [0, 30, 30, 70],
      gradients: [{ attrs: { x1: '-40', y1: '0', x2: '-20', y2: '20' } }],
      shapes: [{ attrs: { d: 'M10 50L30 70H20V45Z' } }, { attrs: { x: '0', y: '30', width: '5', height: '5' } }],
    });
  });

  it('shifts a Figma radial gradient once: gradientTransform takes the shift, cx/cy/r stay', () => {
    const figma = '<svg viewBox="0 0 100 100"><defs><radialGradient id="g" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(60 70) rotate(45) scale(10 20)"><stop stop-color="#FFFFFF"/><stop offset="1" stop-color="#D9E0E3"/></radialGradient></defs>' +
      '<rect x="50" y="50" width="5" height="5" fill="url(#g)"/><circle id="pivot" cx="60" cy="70" r="3" fill="#FF00FF"/></svg>';
    const { part } = importPart('ears-fig.svg', figma, [-50, -20, 100, 100]);
    expect(part).toMatchObject({
      gradients: [{ kind: 'radial', attrs: { cx: '0', cy: '0', r: '1', gradientTransform: 'translate(-50 -20) translate(60 70) rotate(45) scale(10 20)' } }],
    });
  });

  it('maps a gradient to its token by its stops', () => {
    const { part } = imp(
      'ears-test.svg',
      svg('<defs><linearGradient id="grad-ear" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#FFFFFF"/><stop offset="1" stop-color="#D9E0E3"/></linearGradient></defs><path d="M0 0L9 9Z" fill="url(#grad-ear)"/>' + PIVOT),
    );
    expect(part).toMatchObject({ gradients: [{ id: 'grad-ear', kind: 'linear', token: 'earShell', attrs: { x1: '0', y1: '0', x2: '1', y2: '1' } }], shapes: [{ fill: { gradient: 'grad-ear' } }] });
  });

  it('reads a body: markers become anchors and are removed; shell, screen, shadow, highlight', () => {
    const { kind, part } = imp('body-test.svg', svg(BODY + MARKERS));
    expect(kind).toBe('body');
    expect(part).toMatchObject({
      id: 'test',
      axisX: 0,
      eye: [1, 2],
      zzz: { from: [9, 18], to: [10, 20] },
      shadowC: [50, 90],
      highlight: [1, 3],
      shadow: { tag: 'ellipse', id: 'shadow', fill: '#000000' },
      shell: [{ tag: 'rect', id: 'head-shell', fill: { gradient: 'grad-shell' } }],
      screen: [{ tag: 'rect', fill: 'trim' }],
    });
  });

  it("reads Figma's white and black by name", () => {
    const { part } = imp('body-test.svg', svg(BODY.replace('stop-color="#FFFFFF"', 'stop-color="white"').replace('fill="#000000"', 'fill="black"') + MARKERS));
    expect(part).toMatchObject({ shadow: { fill: '#000000' }, gradients: [{ id: 'grad-shell', token: 'shell' }] });
  });

  it('drops ids on side shapes and groups (Figma names every layer), still reading the pivot', () => {
    const { part } = side('<g id="Group 1"><rect id="Rectangle 1" x="0" y="0" width="1" height="1" fill="#FA6C2E"/></g>');
    expect(part).toMatchObject({ pivot: [10, 20], shapes: [{ tag: 'g', children: [{ tag: 'rect' }] }] });
    const [g] = (part as { shapes: { id?: string; children: { id?: string }[] }[] }).shapes;
    expect(g).not.toHaveProperty('id');
    expect(g.children[0]).not.toHaveProperty('id');
  });

  it('keeps shared art ids and groups', () => {
    const { kind, part } = imp('shared.svg', svg('<g id="badge" opacity="0"><circle id="badge-ripple" r="34" fill="#FA6C2E"/><g id="badge-glow"/></g>'));
    expect(kind).toBe('shared');
    expect(part).toEqual([{ tag: 'g', id: 'badge', attrs: { opacity: '0' }, children: [{ tag: 'circle', id: 'badge-ripple', attrs: { r: '34' }, fill: 'accent' }, { tag: 'g', id: 'badge-glow', attrs: {}, children: [] }] }]);
  });

  it.each([
    ['a transform', () => side('<rect x="0" y="0" width="1" height="1" transform="rotate(5)" fill="#FA6C2E"/>'), /bolts-test\.svg: <rect> has transform=/],
    ['a colour outside the palette', () => side('<rect x="0" y="0" width="1" height="1" fill="#123456"/>'), /#123456, which is not in the palette: #95A9AF/],
    ['a named colour', () => side('<rect x="0" y="0" width="1" height="1" fill="red"/>'), /red, which is not in the palette/],
    ['black outside the shadow', () => side('<rect x="0" y="0" width="1" height="1" fill="#000000"/>'), /#000000 is for <ellipse id="shadow"> only/],
    ['a missing pivot', () => imp('ears-test.svg', svg('<rect x="0" y="0" width="1" height="1" fill="#FA6C2E"/>')), /missing <circle id="pivot">/],
    ['a missing marker', () => imp('body-test.svg', svg(BODY + MARKERS.replace(/<circle id="tilt"[^>]*\/>/, ''))), /missing marker <circle id="tilt">/],
    ['a body without grad-shell', () => imp('body-test.svg', svg(BODY.replaceAll('grad-shell', 'grad-other') + MARKERS)), /missing <linearGradient id="grad-shell">/],
    ['body art outside shell, screen and shadow', () => imp('body-test.svg', svg(BODY + '<rect x="0" y="0" width="1" height="1" fill="#95A9AF"/>' + MARKERS)), /<rect> is outside <g id="shell">/],
    ['a relative path command', () => side('<path d="M0 0l5 5z" fill="#FA6C2E"/>'), /only absolute M L H V C Q Z/],
    ['a viewBox of another size', () => imp('ears-test.svg', '<svg viewBox="0 0 50 50">' + PIVOT + '</svg>'), /the viewBox must be 100 × 100/],
    ['an unsupported element', () => side('<text>hi</text>'), /<text> is not supported/],
    ['an unsupported attribute', () => side('<rect x="0" y="0" width="1" height="1" style="fill:red"/>'), /<rect> has style=/],
    ['a clip-path wrapper', () => side('<g clip-path="url(#c)"><rect x="0" y="0" width="1" height="1" fill="#FA6C2E"/></g>'), /<g> has clip-path=.*turn off "Clip content"/],
    ['fill on a group', () => side('<g fill="#FA6C2E"><rect x="0" y="0" width="1" height="1"/></g>'), /put fill and stroke on the shapes/],
    ['a gradient with other stops', () => side('<defs><linearGradient id="g"><stop stop-color="#FFFFFF"/><stop offset="1" stop-color="#000001"/></linearGradient></defs>'), /gradient g needs 2 stops/],
    ['a badly named file', () => imp('Ears.svg', svg('')), /Ears\.svg: name art files/],
    ['broken markup', () => imp('shared.svg', '<svg><g></svg>'), /shared\.svg: unexpected <\/svg>/],
    ['a fill pointing at no gradient', () => side('<rect x="0" y="0" width="1" height="1" fill="url(#missing)"/>'), /<rect> uses url\(#missing\), but the file has no gradient with that id/],
    ['a grad-shell without numeric x1/x2', () => imp('body-test.svg', svg(BODY.replace('x1="1"', 'x1="10%"') + MARKERS)), /grad-shell"> needs numeric x1 and x2/],
    ['a viewBox with a non-numeric origin', () => imp('ears-test.svg', '<svg viewBox="a 0 100 100">' + PIVOT + '</svg>'), /the viewBox must be 100 × 100/],
    ['a quote in an attribute value', () => side(`<rect x="0" y="0" width="1" height="1" opacity='1" data-x="y' fill="#FA6C2E"/>`), /<rect> has opacity= with " ' < > or &/],
    ['an id that is not a name', () => imp('shared.svg', svg(`<g id='a" data-x="y'/>`)), /<g id="a" data-x="y"> needs an id of letters, digits, _ and -, starting with a letter/],
    ['a gradient id that is not a name', () => side('<defs><linearGradient id="1g"><stop stop-color="#FFFFFF"/><stop offset="1" stop-color="#D9E0E3"/></linearGradient></defs>'), /<linearGradient id="1g"> needs an id of letters/],
  ])('rejects %s, naming the file', (_, run, message) => {
    expect(run).toThrow(message);
  });
});
