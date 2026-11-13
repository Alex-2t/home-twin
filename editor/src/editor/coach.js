// The step hint sits by what to do now (D-037). On a new step the card stands next to its area (the step's room,
// the catalog, the 3D window…), everything else is dimmed for a second and a half — so it is noticed and read; then only a frame
// stays around the area. The card stays next to it until the step's action itself is done (the first plan edit — acted()) or Esc is pressed;
// panning and zooming the plan do not move it away. Then the frame fades, the card moves down above the toolbar and does not cover
// the plan. No area, or it covers almost the whole screen — the card goes straight to the bottom (with a short flash, so it is noticed).
//   show(key, aim) — key: which step this is (at an area — once per step), aim: ()=>a rectangle on screen ({left,top,right,bottom}) or null
//   env = {free, home, avoid} — set by the screen layout: the free part, the place at the bottom, what not to cover
export function createCoach(work, b) {
  const spot = document.createElement('div');
  spot.className = 'spot';
  work.appendChild(spot);
  // pending — steps whose action is not done yet: a temporary hint on top and back — the card is next to the area again
  const seen = new Set(),
    pending = new Set();
  let aim = null,
    raf = 0,
    side = null,
    last = null,
    glideT = 0,
    shown = false,
    active = false,
    key0 = null,
    fixed = false;
  const c = {env: null};
  const clamp = (v, a, z) => Math.max(a, Math.min(z, v));
  const hit = (a, q) => a.l < q.r && q.l < a.r && a.t < q.b && q.t < a.b;
  const glide = () => {
    b.classList.add('glide');
    spot.classList.add('glide');
    clearTimeout(glideT);
    glideT = setTimeout(() => {
      b.classList.remove('glide');
      spot.classList.remove('glide');
    }, 500);
  };
  let shownAt = 0,
    dimT = 0;
  const calm = () => {
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
  function target(o) {
    let r = null;
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
    const o = work.getBoundingClientRect(),
      w = b.offsetWidth,
      h = b.offsetHeight,
      T = active ? target(o) : null;
    let at = null,
      s = 'bottom';
    // fixed — the card is always at the bottom above the toolbar (the area only gets the highlight)
    if (T && !fixed) {
      const F = env.free(),
        g = 16,
        cx = (T.l + T.r) / 2,
        cy = (T.t + T.b) / 2,
        P = {l: T.l - 8, t: T.t - 8, r: T.r + 8, b: T.b + 8};
      const obs = env
        .avoid()
        .filter(Boolean)
        .map(r => ({l: r.left - o.left, t: r.top - o.top, r: r.right - o.left, b: r.bottom - o.top}));
      // to the right, left, below, above the area; along the edge — centered, then aligned to its start and end
      const ys = [cy - h / 2, T.t, T.b - h],
        xs = [cx - w / 2, T.l, T.r - w];
      const opts = [
        ...ys.map(y => ['right', T.r + g, y]),
        ...ys.map(y => ['left', T.l - g - w, y]),
        ...xs.map(x => ['below', x, T.b + g]),
        ...xs.map(x => ['above', x, T.t - g - h]),
      ];
      for (const [sd, x0, y0] of opts) {
        const across = sd === 'right' || sd === 'left',
          x = across ? x0 : clamp(x0, F.l, F.r - w),
          y = across ? clamp(y0, F.t, F.b - h) : y0,
          r = {l: x, t: y, r: x + w, b: y + h};
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
  const loop = () => {
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
