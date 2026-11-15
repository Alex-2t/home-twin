// The turntable of an example's card (D-114): over its still render, the home from 72 angles round it (every 5°), by day and
// at night with a couple of rooms lit, each light in three interleaved sprite sheets (turntable-math.ts the layout,
// tools/render-examples.ts --turntable the sheets). Sheet a (every 15°) loads first and the home turns at once; b and c follow
// and fill in between. The frames on either side of the angle are drawn, the next one over it at the share of the way to it,
// so the turn reads continuous with whatever is loaded. A card starts in the light its home looks best in (its still render
// is that light's frame 0); the lamp button switches to the other. The sheets are files beside the page; where the first one
// cannot be had the card stays its still picture.
//   mouse: hovering the card turns the home slowly (a turn in 8 s), a horizontal drag turns it by hand and lets it coast,
//          leaving brings it back to frame 0; a click opens the home as before
//   touch: a tap on the picture starts or stops the turning (it does not open the home: the name under it does), a
//          horizontal swipe turns it, a vertical one scrolls the page
//   reduced motion: nothing turns by itself, there is no coast or ease; a drag still turns it
// One requestAnimationFrame loop serves every card, and only while one of them moves; a frame is a background position.
import {t} from '../i18n/i18n.ts';
import {icon} from './icons.ts';
import {el} from './ui.ts';
import {
  TURNTABLE_COLUMNS,
  TURNTABLE_ROWS,
  TURNTABLE_SHEETS,
  TURNTABLE_STEPS,
  blendAt,
  cellOfStep,
  coast,
  framesForDrag,
  nearestLoaded,
  sheetPosition,
  spinSpeed,
  wayToStart,
  wrapFrame,
} from './turntable-math.ts';

type Light = 'day' | 'night';

/** A card's turntable: the light it starts in, and per light its sheets a, b and c (null: not there; empty: no such light). */
export interface TurntableSheets {
  start: Light;
  day: ReadonlyArray<string | null>;
  night: ReadonlyArray<string | null>;
}

/** What a card's turntable is doing: at rest, turning by itself, dragged, coasting after a drag, easing to a frame. */
type Motion = 'still' | 'spin' | 'drag' | 'coast' | 'settle';

/** A card's turntable, as the shared loop moves it: one step of `seconds`; false once it is at rest. */
interface Mover {
  step(seconds: number): boolean;
}

// A press that moves less than this is a click or a tap; a move mostly sideways past it is a drag.
const DRAG_START_PIXELS = 6;
// A coast slower than this (steps a second) has stopped.
const COAST_STOP_SPEED = 1.5;
// Easing to a frame: the share of the way left covered each second (a soft ease out), and where it counts as there.
const SETTLE_EASE_PER_SECOND = 7;
const SETTLE_CLOSE_ENOUGH = 0.02;
// The longest step the loop takes, seconds (a tab that slept does not jump the home round).
const LONGEST_STEP = 0.05;
// The next frame is drawn over only when it shows this much.
const SHOWN_WEIGHT = 0.002;

const moving = new Set<Mover>();
let loop = 0;
let lastTime = 0;

function tick(now: number): void {
  const seconds = Math.min(LONGEST_STEP, (now - lastTime) / 1000);
  lastTime = now;
  for (const mover of moving) {
    if (!mover.step(seconds)) moving.delete(mover);
  }
  loop = moving.size ? requestAnimationFrame(tick) : 0;
}

/** A turntable starts moving: the loop runs while any does. */
function wake(mover: Mover): void {
  moving.add(mover);
  if (loop) return;
  lastTime = performance.now();
  loop = requestAnimationFrame(tick);
}

const reducedMotion = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A sheet's image, loaded once per address for the whole page; false where it cannot be had. */
const loadedSheets = new Map<string, Promise<boolean>>();
function loadSheet(address: string): Promise<boolean> {
  let loading = loadedSheets.get(address);
  if (!loading) {
    const image = new Image();
    image.src = address;
    loading = image.decode().then(
      () => true,
      () => false,
    );
    loadedSheets.set(address, loading);
  }
  return loading;
}

/** One of the two stacked frames: what it shows now, so a frame that did not change writes nothing. */
interface Layer {
  element: HTMLElement;
  sheet: string;
  cell: number;
  opacity: number;
}

/** A light's sheets as the card loads them: which are loaded, and sheet a's loading (false: it cannot be had). */
interface LightState {
  loaded: boolean[];
  first: Promise<boolean> | null;
}

/**
 * The card with its turntable: a box holding the card and, beside it (a button cannot be in a button), the lamp button over
 * the picture's corner when the home has both lights. `picture` is the card's picture box, which the frames are drawn over.
 */
export function withTurntable(card: HTMLElement, picture: HTMLElement, sheets: TurntableSheets): HTMLElement {
  const steps = TURNTABLE_STEPS;
  const views = el(
    '<span class="tt-views" aria-hidden="true"><span class="tt-frame"></span><span class="tt-frame"></span></span>',
  );
  const badge = el('<span class="tt-badge" aria-hidden="true">360°</span>');
  picture.append(views, badge);
  picture.classList.add('tt-pic');
  picture.title = t('Drag to turn it round');
  const layers: Layer[] = [...views.children].map(element => {
    const frame = element as HTMLElement;
    frame.style.backgroundSize = `${TURNTABLE_COLUMNS * 100}% ${TURNTABLE_ROWS * 100}%`;
    return {element: frame, sheet: '', cell: -1, opacity: -1};
  });
  const box = el('<div class="tt-wrap"></div>');
  box.append(card);
  const other: Light = sheets.start === 'day' ? 'night' : 'day';
  const lamp = el<HTMLButtonElement>('<button type="button" class="tt-lamp" aria-pressed="false"></button>');
  lamp.title = t('Day / night');
  lamp.setAttribute('aria-label', t('Day / night'));
  if (sheets[other][0]) box.append(lamp);

  const states: Record<Light, LightState> = {
    day: {loaded: Array.from({length: TURNTABLE_SHEETS}, () => false), first: null},
    night: {loaded: Array.from({length: TURNTABLE_SHEETS}, () => false), first: null},
  };
  let light: Light = sheets.start;
  let position = 0;
  let velocity = 0;
  let target = 0;
  let motion: Motion = 'still';
  let hovered = false;
  // turning after a tap (touch), as hovering turns it with a mouse
  let touchTurning = false;
  // the last drag was a mouse's
  let draggedByMouse = false;

  const syncLamp = (): void => {
    lamp.setAttribute('aria-pressed', String(light !== sheets.start));
    // the icon says what the lamp switches to
    lamp.innerHTML = icon(light === 'day' ? 'moon' : 'sun', 14);
  };
  syncLamp();
  const loadedNow = (): boolean[] => states[light].loaded;
  const paint = (layer: Layer, step: number, opacity: number): void => {
    const {sheet, cell} = cellOfStep(step);
    const address = sheets[light][sheet] || '';
    if (layer.sheet !== address) {
      layer.sheet = address;
      layer.element.style.backgroundImage = `url("${address}")`;
    }
    if (layer.cell !== cell) {
      layer.cell = cell;
      const {x, y} = sheetPosition(cell);
      layer.element.style.backgroundPosition = `${x}% ${y}%`;
    }
    if (layer.opacity !== opacity) {
      layer.opacity = opacity;
      layer.element.style.opacity = String(opacity);
    }
  };
  const draw = (): void => {
    if (!loadedNow()[0]) return;
    const blend = blendAt(position, loadedNow());
    paint(layers[0], blend.from, 1);
    const showNext = blend.weight > SHOWN_WEIGHT && blend.to !== blend.from;
    paint(layers[1], showNext ? blend.to : blend.from, showNext ? blend.weight : 0);
  };
  // a light's sheet a first, then b and c behind it; false: sheet a cannot be had
  const load = (which: Light): Promise<boolean> => {
    const state = states[which];
    state.first ??= loadSheet(sheets[which][0] || '').then(ok => {
      if (!ok) return false;
      state.loaded[0] = true;
      sheets[which].forEach((address, sheet) => {
        if (sheet === 0 || !address) return;
        loadSheet(address).then(more => {
          state.loaded[sheet] = more;
          if (more && which === light) draw();
        });
      });
      return true;
    });
    return state.first;
  };
  // the frames of the light chosen, over the still picture; false: they cannot be had
  const show = async (): Promise<boolean> => {
    const wanted = light;
    const ok = await load(wanted);
    if (!ok) {
      if (wanted === sheets.start) box.classList.add('tt-failed');
      return false;
    }
    if (wanted !== light) return true;
    draw();
    views.classList.add('on');
    return true;
  };
  const rest = (): void => {
    motion = 'still';
    velocity = 0;
    // at frame 0 in the light it starts in the still picture is the same: the frames are taken away
    const atStart = wrapFrame(position, steps) === 0 && light === sheets.start;
    if (atStart) views.classList.remove('on');
  };
  // ease to a step: 0 when the mouse leaves, the nearest loaded one when the turning stops
  const settleTo = (step: number): void => {
    target = step;
    if (reducedMotion()) {
      position = step;
      draw();
      rest();
      return;
    }
    motion = 'settle';
    wake(mover);
  };
  const mover: Mover = {
    step(seconds) {
      if (motion === 'spin') position += spinSpeed(steps) * seconds;
      else if (motion === 'coast') {
        velocity = coast(velocity, seconds);
        position += velocity * seconds;
        if (Math.abs(velocity) < COAST_STOP_SPEED) {
          const turnOn = (hovered || touchTurning) && !reducedMotion();
          // a mouse that let go outside the card: back to frame 0, as when it leaves
          const mouseGone = draggedByMouse && !hovered;
          if (turnOn) motion = 'spin';
          else {
            motion = 'settle';
            target = mouseGone ? 0 : nearestLoaded(position, loadedNow());
          }
        }
      } else if (motion === 'settle') {
        // the short way from where it is to the step it eases to
        const way = wayToStart(position - target, steps);
        if (Math.abs(way) < SETTLE_CLOSE_ENOUGH) {
          position = target;
          draw();
          rest();
          return false;
        }
        position += way * Math.min(1, SETTLE_EASE_PER_SECOND * seconds);
      }
      draw();
      return motion === 'spin' || motion === 'coast' || motion === 'settle';
    },
  };
  const spin = async (): Promise<void> => {
    if (!(await show())) return;
    if (motion === 'drag') return;
    if (reducedMotion()) return;
    if (!hovered && !touchTurning) return;
    motion = 'spin';
    wake(mover);
  };

  // ---------- the pointer ----------
  let press: {id: number; x: number; y: number; from: number; lastTime: number; touch: boolean} | null = null;
  let dragged = false;
  let swallowClick = false;
  // hovering anywhere on the card (its lamp too) turns it; pressing and dragging is on the picture
  box.addEventListener('pointerenter', e => {
    if (e.pointerType !== 'mouse') return;
    hovered = true;
    spin();
  });
  box.addEventListener('pointerleave', e => {
    if (e.pointerType !== 'mouse') return;
    hovered = false;
    if (motion !== 'drag') settleTo(0);
  });
  picture.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    press = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      from: position,
      lastTime: e.timeStamp,
      touch: e.pointerType !== 'mouse',
    };
    dragged = false;
  });
  picture.addEventListener('pointermove', e => {
    if (!press || e.pointerId !== press.id) return;
    const dx = e.clientX - press.x;
    const dy = e.clientY - press.y;
    if (!dragged) {
      const sideways = Math.abs(dx) > DRAG_START_PIXELS && Math.abs(dx) > Math.abs(dy);
      if (!sideways) {
        // a touch going up or down is the page's scroll
        if (press.touch && Math.abs(dy) > DRAG_START_PIXELS) press = null;
        return;
      }
      dragged = true;
      motion = 'drag';
      moving.delete(mover);
      velocity = 0;
      picture.setPointerCapture(e.pointerId);
      show();
    }
    const before = position;
    position = press.from + framesForDrag(dx, picture.clientWidth, steps);
    const seconds = Math.max(0.001, (e.timeStamp - press.lastTime) / 1000);
    // the speed of the last moves, smoothed: what the coast starts from
    velocity = velocity * 0.6 + ((position - before) / seconds) * 0.4;
    press.lastTime = e.timeStamp;
    draw();
  });
  const release = (e: PointerEvent): void => {
    if (!press || e.pointerId !== press.id) return;
    const wasTouch = press.touch;
    draggedByMouse = dragged && !wasTouch;
    press = null;
    if (dragged) {
      swallowClick = true;
      if (reducedMotion()) {
        settleTo(nearestLoaded(position, loadedNow()));
        return;
      }
      motion = 'coast';
      wake(mover);
      return;
    }
    if (e.type === 'pointercancel' || !wasTouch) return;
    // a tap on the picture: the turning starts or stops; the home opens from the name under it
    swallowClick = true;
    touchTurning = !(motion === 'spin' || motion === 'coast');
    if (touchTurning) spin();
    else settleTo(nearestLoaded(position, loadedNow()));
  };
  picture.addEventListener('pointerup', release);
  picture.addEventListener('pointercancel', release);
  // a drag, or a tap that turns, is not a click on the card
  picture.addEventListener('click', e => {
    if (!swallowClick) return;
    swallowClick = false;
    e.preventDefault();
    e.stopPropagation();
  });

  // ---------- the lamp: the other light ----------
  lamp.onclick = async () => {
    const before = light;
    light = light === 'day' ? 'night' : 'day';
    syncLamp();
    box.classList.add('tt-loading');
    const ok = await show();
    box.classList.remove('tt-loading');
    if (!ok) {
      // the other light cannot be had: the card stays in the one it showed
      light = before;
      syncLamp();
      return;
    }
    if (motion === 'still') rest();
  };
  return box;
}
