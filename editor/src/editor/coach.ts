// The step hint sits by what to do now (D-037). On a new step the card stands next to its area (the step's room,
// the catalog, the 3D window…), everything else is dimmed for a second and a half — so it is noticed and read; then only a frame
// stays around the area. The card stays next to it until the step's action itself is done (the first plan edit — acted()) or Esc is pressed;
// panning and zooming the plan do not move it away. Then the frame fades, the card moves down above the toolbar and does not cover
// the plan. No area, or it covers almost the whole screen — the card goes straight to the bottom (with a short flash, so it is noticed).
//   show(key, aim) — key: which step this is (at an area — once per step), aim: ()=>a rectangle on screen ({left,top,right,bottom}) or null
//   env = {free, home, avoid} — set by the screen layout: the free part, the place at the bottom, what not to cover
import type {Aim, CoachEnv, ScreenRect, StepOptions} from './editor-types.ts';

/** The step hint by its area (D-037). */
export interface Coach {
  env: CoachEnv | null;
  /** The hint has calmed down (its action done or Esc). */
  onCalm?: () => void;
  /** A plan edit: the step's action has started. */
  acted(): void;
  /** Puts the card and the frame round its area. */
  place(): void;
  /** The step's action was done already. */
  done(key: string): boolean;
  /** No area (null or none): the card goes to the bottom. */
  show(key: string, aim: Aim | null | undefined, o?: StepOptions): void;
  hide(): void;
  /** The card is at the bottom (not by an area). */
  bottom(): boolean;
}

/** An area in px from the work area's top-left: left, top, right, bottom. */
interface Box {
  l: number;
  t: number;
  r: number;
  b: number;
}

/** Where the card stands: by a side of its area, or at the bottom. */
type CardSide = 'right' | 'left' | 'below' | 'above' | 'bottom';

export function createCoach(work: HTMLElement, b: HTMLElement): Coach {
  const spot = document.createElement('div');
  spot.className = 'spot';
  work.appendChild(spot);
  // pending — steps whose action is not done yet: a temporary hint on top and back — the card is next to the area again
  const seen = new Set<string>();
  const pending = new Set<string | null>();
  let aim: Aim | null = null;
  let raf = 0;
  let side: CardSide | null = null;
  let last: {x: number; y: number} | null = null;
  let glideT: ReturnType<typeof setTimeout> | number = 0;
  let shown = false;
  let active = false;
  let key0: string | null = null;
  let fixed = false;
  // Its members are set below, before it is returned.
  const c = {env: null} as Coach;
  const clamp = (v: number, a: number, z: number): number => Math.max(a, Math.min(z, v));
  const hit = (a: Box, q: Box): boolean => a.l < q.r && q.l < a.r && a.t < q.b && q.t < a.b;
  const glide = (): void => {
    b.classList.add('glide');
    spot.classList.add('glide');
    clearTimeout(glideT);
    glideT = setTimeout(() => {
      b.classList.remove('glide');
      spot.classList.remove('glide');
    }, 500);
  };
  let shownAt = 0;
  let dimT: ReturnType<typeof setTimeout> | number = 0;
  const calm = (): void => {
    clearTimeout(dimT);
    spot.classList.remove('dim');
    pending.delete(key0);
    if (!active) return;
    active = false;
    glide();
    c.place();
    c.onCalm?.();
  };
  addEventListener(
    'keydown',
    e => {
      if (e.key === 'Escape') calm();
    },
    true,
  );
  // a plan edit — the step has been started; edits in the first 0.7 s after showing are the step placing its own things (lamps by guess)
  c.acted = () => {
    if (active && performance.now() - shownAt > 700) calm();
  };
  function target(o: DOMRect): Box | null {
    let r: ScreenRect | null | undefined = null;
    try {
      r = aim?.();
    } catch {
      r = null;
    }
    if (!r) return null;
    const T = {l: r.left - o.left, t: r.top - o.top, r: r.right - o.left, b: r.bottom - o.top};
    if (T.r - T.l < 4 || T.b - T.t < 4 || (T.r - T.l) * (T.b - T.t) > 0.5 * o.width * o.height) return null; // almost the whole screen — this is not an area
    return T;
  }
  c.place = () => {
    const env = c.env;
    if (!env) return;
    if (b.hidden) {
      spot.classList.remove('on');
      side = null;
      return;
    }
    const o = work.getBoundingClientRect();
    const w = b.offsetWidth;
    const h = b.offsetHeight;
    const T = active ? target(o) : null;
    let at: {x: number; y: number} | null = null;
    let s: CardSide = 'bottom';
    // fixed — the card is always at the bottom above the toolbar (the area only gets the highlight)
    if (T && !fixed) {
      const F = env.free();
      const g = 16;
      const cx = (T.l + T.r) / 2;
      const cy = (T.t + T.b) / 2;
      const P = {l: T.l - 8, t: T.t - 8, r: T.r + 8, b: T.b + 8};
      const obs = env
        .avoid()
        .filter((r): r is ScreenRect => Boolean(r))
        .map(r => ({l: r.left - o.left, t: r.top - o.top, r: r.right - o.left, b: r.bottom - o.top}));
      // to the right, left, below, above the area; along the edge — centered, then aligned to its start and end
      const ys = [cy - h / 2, T.t, T.b - h];
      const xs = [cx - w / 2, T.l, T.r - w];
      // A place to try: the side, and the card's left and top.
      type Option = [CardSide, number, number];
      const opts = [
        ...ys.map((y): Option => ['right', T.r + g, y]),
        ...ys.map((y): Option => ['left', T.l - g - w, y]),
        ...xs.map((x): Option => ['below', x, T.b + g]),
        ...xs.map((x): Option => ['above', x, T.t - g - h]),
      ];
      for (const [sd, x0, y0] of opts) {
        const across = sd === 'right' || sd === 'left';
        const x = across ? x0 : clamp(x0, F.l, F.r - w);
        const y = across ? clamp(y0, F.t, F.b - h) : y0;
        const r = {l: x, t: y, r: x + w, b: y + h};
        if (r.l < F.l || r.r > F.r || r.t < F.t || r.b > F.b || hit(r, P) || obs.some(q => hit(r, q)))
          continue;
        at = {x, y};
        s = sd;
        break;
      }
      if (at)
        b.style.setProperty(
          '--a',
          (s === 'right' || s === 'left' ? clamp(cy - at.y, 16, h - 16) : clamp(cx - at.x, 18, w - 18)) +
            'px',
        );
    }
    if (!at) at = env.home(w, h);
    b.dataset.side = s;
    b.classList.toggle('att', s !== 'bottom');
    // a jump (a new step, moved down) — glides smoothly; panning and zooming the plan — follows without delay
    if (last && Math.hypot(at.x - last.x, at.y - last.y) > 40) glide();
    if (!last || at.x !== last.x || at.y !== last.y) {
      b.style.left = at.x + 'px';
      b.style.top = at.y + 'px';
      last = at;
    }
    side = s;
    // the area vanished for a moment (the panel is still opening) — the dimming waits for it
    spot.classList.toggle('on', !!T);
    if (T)
      Object.assign(spot.style, {
        left: T.l - 8 + 'px',
        top: T.t - 8 + 'px',
        width: T.r - T.l + 16 + 'px',
        height: T.b - T.t + 16 + 'px',
      });
  };
  const loop = (): void => {
    raf = 0;
    if (b.hidden || !aim || !active) return;
    c.place();
    raf = requestAnimationFrame(loop);
  };
  c.done = key => seen.has(key) && !pending.has(key); // the step's action has already been done
  c.show = (key, a, o = {}) => {
    aim = a || null;
    fixed = !!o.fixed;
    const fresh = !seen.has(key);
    seen.add(key);
    if (key !== key0 || fresh) shownAt = performance.now();
    key0 = key;
    if (fresh && aim) pending.add(key);
    active = !!aim && pending.has(key); // the same step was redrawn — do not reset the countdown
    if (fresh) {
      b.classList.remove('pop');
      if (!o.compact) {
        void b.offsetWidth;
        b.classList.add('pop');
      }
      if (active) {
        spot.classList.add('dim');
        clearTimeout(dimT);
        dimT = setTimeout(() => spot.classList.remove('dim'), 1500);
      }
    }
    // it was hidden — moves from the old place to the new one: place() reads the sizes first — the browser remembers the old
    // place, and the left/top change goes through a transition
    if (fresh || !shown) glide();
    shown = true;
    c.place();
    if (!raf && aim && active) raf = requestAnimationFrame(loop);
  };
  c.hide = () => {
    aim = null;
    shown = false;
    active = false;
    clearTimeout(dimT);
    spot.classList.remove('on', 'dim');
    side = null;
  };
  c.bottom = () => side === 'bottom' || side == null;
  return c;
}
