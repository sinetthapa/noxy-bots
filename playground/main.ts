import { createNox } from '../src/brain/nox';
import { neutralPose } from '../src/brain/pose';
import { buildRig } from '../src/character/build';
import { resolveLook } from '../src/character/look';
import { DEFAULT_LOOK, nox as character } from '../src/character/nox';
import type { Look } from '../src/character/types';
import { createSvgRenderer } from '../src/render/svg';
import { createBoard } from './board';
import { createPane, type Transport } from './pane';

const stage = document.getElementById('stage')!;

// ?seed=N replays a different (but repeatable) random stream.
const seed = Number(new URLSearchParams(location.search).get('seed') ?? 1);
const nox = createNox({ seed });
if (matchMedia('(prefers-reduced-motion: reduce)').matches) nox.setMotion('calm');
nox.trigger('BOOT'); // power-on on load
const transport: Transport = { fps: 30, timeScale: 1, paused: false, manual: false };
const manualPose = neutralPose();

let renderer: ReturnType<typeof createSvgRenderer>;
/** Builds the rig for a look and draws the current pose at once: until the first draw the right side sits on the left. */
function mount(look: Look): void {
  stage.innerHTML = buildRig(character, look);
  renderer = createSvgRenderer(stage.querySelector('svg')!, resolveLook(character, look), nox.tuning);
  renderer.draw(transport.manual ? manualPose : nox.pose);
}
mount(DEFAULT_LOOK);

const pane = createPane(document.getElementById('pane')!, nox, transport, manualPose, () => nox.tick(1000 / 60), {
  character,
  look: DEFAULT_LOOK,
  onChange: mount,
  svg: () => stage.querySelector('svg')!,
});
const board = createBoard(document.getElementById('board')!, nox);

let last = performance.now();
let sinceDraw = 0;
let sinceUi = 0;

function loop(now: number): void {
  sinceDraw += now - last;
  last = now;
  // ponytail: frame cap by skipping rAF frames; drift is ±1 frame, fine for a tuning tool.
  if (sinceDraw >= 1000 / transport.fps - 1) {
    if (!transport.paused) nox.tick(sinceDraw * transport.timeScale);
    renderer.draw(transport.manual ? manualPose : nox.pose);
    sinceUi += sinceDraw;
    sinceDraw = 0;
    if (sinceUi >= 100) {
      sinceUi = 0;
      if (!transport.manual) {
        Object.assign(manualPose, nox.pose); // sliders mirror the brain at ~10 Hz
        pane.refresh();
      }
      board.update();
    }
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
