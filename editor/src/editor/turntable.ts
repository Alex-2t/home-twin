// The turntable of an example's card (D-114): over its still render, the home from 24 angles round it, one sprite sheet by day
// and one at night with its lights on (turntable-math.ts the layout, tools/render-examples.ts --turntable the sheets). The
// sheets are files beside the page, loaded on first use; where one cannot be had the card stays its still picture.
//   mouse: hovering the card turns the home slowly (a turn in 8 s), a horizontal drag turns it by hand and lets it coast, leaving
//          brings it back to frame 0; a click opens the home as before
//   touch: a tap on the picture starts or stops the turning (it does not open the home: the name under it does), a
//          horizontal swipe turns it, a vertical one scrolls the page
//   the lamp button: day or night; reduced motion: nothing turns by itself, a drag still does
// One requestAnimationFrame loop serves every card, and only while one of them moves; a frame is a background position.
import {t} from '../i18n/i18n.ts';
import {icon} from './icons.ts';
import {el} from './ui.ts';
import {
  TURNTABLE_COLUMNS,
  TURNTABLE_FRAMES,
  TURNTABLE_ROWS,
  coast,
  frameIndex,
  framesForDrag,
  sheetPosition,
  spinSpeed,
  wayToStart,
} from './turntable-math.ts';

/** A card's two sheets: their addresses beside the page. */
export interface TurntableSheets {
  day: string;
  night: string;
}

type Light = keyof TurntableSheets;

/** What a card's turntable is doing: at rest, turning by itself, dragged, coasting after a drag, going back to frame 0. */
type Motion = 'still' | 'spin' | 'drag' | 'coast' | 'home';

/** A card's turntable, as the shared loop moves it: one step of `seconds`; false once it is at rest. */
interface Mover {
  step(seconds: number): boolean;
}

// A press that moves less than this is a click or a tap; a move mostly sideways past it is a drag.
const DRAG_START_PIXELS = 6;
// A coast slower than this (frames a second) has stopped.
const COAST_STOP_SPEED = 0.6;
// Going back to frame 0: the share of the way left covered each second (a soft ease out), and where it counts as there.
const HOME_EASE_PER_SECOND = 7;
const HOME_CLOSE_ENOUGH = 0.04;
// The longest step the loop takes, seconds (a tab that slept does not jump the home round).
const LONGEST_STEP = 0.05;

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

/**
 * The card with its turntable: a box holding the card and, beside it (a button cannot be in a button), the lamp button over
 * the picture's corner. `picture` is the card's picture box, which the frames are drawn over.
 */
export function withTurntable(card: HTMLElement, picture: HTMLElement, sheets: TurntableSheets): HTMLElement {
  const frames = TURNTABLE_FRAMES;
  const view = el('<span class="tt-view" aria-hidden="true"></span>');
  view.style.backgroundSize = `${TURNTABLE_COLUMNS * 100}% ${TURNTABLE_ROWS * 100}%`;
  const badge = el('<span class="tt-badge" aria-hidden="true">360°</span>');
  picture.append(view, badge);
  picture.classList.add('tt-pic');
  picture.title = t('Drag to turn it round');
  const lamp = el<HTMLButtonElement>(
    `<button type="button" class="tt-lamp" aria-pressed="false">${icon('moon', 14)}</button>`,
  );
  lamp.title = t('Day / night');
  lamp.setAttribute('aria-label', t('Day / night'));
  const box = el('<div class="tt-wrap"></div>');
  box.append(card, lamp);

  let position = 0;
  let velocity = 0;
  let motion: Motion = 'still';
  let light: Light = 'day';
  let shownFrame = -1;
  let shownSheet = '';
  let hovered = false;
  // turning after a tap (touch), as hovering turns it with a mouse
  let touchTurning = false;
  // the last drag was a mouse's
  let draggedByMouse = false;

  const draw = (): void => {
    const frame = frameIndex(position, frames);
    if (frame === shownFrame) return;
    shownFrame = frame;
    const {x, y} = sheetPosition(frame);
    view.style.backgroundPosition = `${x}% ${y}%`;
  };
  // the sheet of the light chosen, once it is loaded; false: it cannot be had (the card stays still)
  const showSheet = async (): Promise<boolean> => {
    const wanted = light;
    const ok = await loadSheet(sheets[wanted]);
    if (!ok) {
      box.classList.add('tt-failed');
      return false;
    }
    if (wanted !== light) return true;
    if (shownSheet !== sheets[wanted]) {
      shownSheet = sheets[wanted];
      view.style.backgroundImage = `url("${sheets[wanted]}")`;
    }
    draw();
    view.classList.add('on');
    return true;
  };
  // at frame 0 by day the still picture is the same: the frames are taken away
  const rest = (): void => {
    motion = 'still';
    velocity = 0;
    if (light === 'day' && frameIndex(position, frames) === 0) view.classList.remove('on');
  };
  const mover: Mover = {
    step(seconds) {
      if (motion === 'spin') position += spinSpeed(frames) * seconds;
      else if (motion === 'coast') {
        velocity = coast(velocity, seconds);
        position += velocity * seconds;
        if (Math.abs(velocity) < COAST_STOP_SPEED) {
          const turnOn = (hovered || touchTurning) && !reducedMotion();
          // a mouse that let go outside the picture: back to frame 0, as when it leaves
          const mouseGone = draggedByMouse && !hovered;
          if (turnOn) motion = 'spin';
          else if (mouseGone) motion = 'home';
          else rest();
        }
      } else if (motion === 'home') {
        const left = wayToStart(position, frames);
        if (Math.abs(left) < HOME_CLOSE_ENOUGH) {
          position = 0;
          draw();
          rest();
          return false;
        }
        position += left * Math.min(1, HOME_EASE_PER_SECOND * seconds);
      }
      draw();
      return motion === 'spin' || motion === 'coast' || motion === 'home';
    },
  };
  const spin = async (): Promise<void> => {
    if (!(await showSheet())) return;
    if (motion === 'drag') return;
    if (reducedMotion()) return;
    if (!hovered && !touchTurning) return;
    motion = 'spin';
    wake(mover);
  };
  const goHome = (): void => {
    if (motion === 'still' && frameIndex(position, frames) === 0) {
      rest();
      return;
    }
    if (reducedMotion()) {
      position = 0;
      draw();
      rest();
      return;
    }
    motion = 'home';
    wake(mover);
  };

  // ---------- the pointer on the picture ----------
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
    if (motion !== 'drag') goHome();
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
      showSheet();
    }
    const width = picture.clientWidth;
    const before = position;
    position = press.from + framesForDrag(dx, width, frames);
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
        motion = 'still';
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
    else {
      motion = 'still';
      moving.delete(mover);
    }
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

  // ---------- the lamp: day or night ----------
  lamp.onclick = async () => {
    light = light === 'day' ? 'night' : 'day';
    lamp.setAttribute('aria-pressed', String(light === 'night'));
    lamp.innerHTML = icon(light === 'night' ? 'sun' : 'moon', 14);
    box.classList.add('tt-loading');
    const ok = await showSheet();
    box.classList.remove('tt-loading');
    if (!ok) return;
    if (light === 'day' && motion === 'still') rest();
  };
  return box;
}
