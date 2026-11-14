// Windows and doors in the “Plan” mode. Placed by clicking a wall: its menu has “Door” and “Window” — the opening lands at the click point.
// The selected opening moves along its wall and stretches by its edges (5 cm step, Shift — no step), never leaves the wall
// and does not overlap its neighbours. Menu: type, width (click to type it), “Rotate” the leaf, “⋯” → “No door”, trash.
import {t} from '../../i18n/i18n.ts';
import {axisCursor} from '../drag-gesture.ts';
import {
  roomById,
  wallInfo,
  wallAt,
  addOpening,
  openingGap,
  setOpeningWidth,
  turnDoor,
  swingOf,
  MIN_OPENING,
  OPENING,
} from '../../core/plan.ts';
import {openingCoords, WALL} from '../../core/geometry.ts';
import {dimLabel, outward, pal} from '../draw.ts';
import {el} from '../ui.ts';
import {icon} from '../icons.ts';
import type {Opening, OpeningKind, Plan, Point, Room, Vector, WallStretch} from '../../core/types.ts';
import type {PlanView2d} from '../view2d.ts';
import type {Editor, PlanBox, RoomTool, Selection} from '../editor-types.ts';

/** What the pointer is over: an opening; on the selected one's ends, the end that stretches (0: its start, 1: its end). */
export interface OpeningHit {
  kind: 'opening';
  o: Opening;
  end?: 0 | 1;
}

/** Windows and doors in the rooms mode (openingsTool): the rooms mode hands them its pointer, keys, drawing and panel. */
export interface OpeningsTool {
  /** The opening at p (the selected one first, with its ends); in "Select" a door's leaf counts too. */
  hit(p: Point, tool: RoomTool): OpeningHit | null;
  /** The cursor over an opening, or while dragging it: along its wall. */
  cursor(h: {o: Opening}): string;
  dragCursor(): string | null;
  cancelDrag(): void;
  /** The opening under the pointer (null: none); true: it changed. */
  hover(id: string | null): boolean;
  select(o: Opening): void;
  /** A press on an opening: it is selected and its drag starts. */
  down(h: OpeningHit, p: Point): void;
  /** Drags the opening (free: no 5 cm step); false: no drag of an opening is on. */
  move(p: Point, free: boolean): boolean;
  /** Ends the drag; false: there was none. */
  up(): boolean;
  /** An opening of this kind fits on the wall piece. */
  can(W: WallStretch, k: OpeningKind): boolean;
  /** Puts one on the wall piece where its menu was opened, and selects it. */
  add(W: WallStretch, k: OpeningKind): void;
  /** The windows and doors step: the band of a future opening at tt (0–1 along the room side); q: the pulse's phase 0–1. */
  ghost(W: WallStretch, tt: number, q?: number | null): void;
  /** Removes the selected opening; false: none is selected. */
  del(): boolean;
  draw(): void;
  /** The panel of the selected opening; null: none is selected. */
  ctx(): HTMLElement[] | null;
  anchor(): PlanBox | null;
  selected(): Opening | null;
}

/** Where an opening is on the plan: ends, length, along (u), outward (n), the wall band from its inner face (d0) to the outer one (d1). */
interface OpeningGeometry {
  o: Opening;
  r: Room;
  a: Point;
  b: Point;
  L: number;
  u: Vector;
  n: Vector;
  d0: number;
  d1: number;
}

/** An opening being dragged: by its end (none: the whole of it), from s along its room side, within the free stretch g. */
interface OpeningDrag {
  o: Opening;
  end?: 0 | 1;
  s: number;
  s0: number;
  s1: number;
  g: [number, number];
  moved: boolean;
}

const STEP = 0.05;
export function openingsTool(ed: Editor): OpeningsTool {
  const v = (): PlanView2d => ed.v;
  const plan = (): Plan => ed.plan;
  const sel = (): Selection => ed.sel;
  const cm = (x: number): number => Math.round(x * 100);
  let drag: OpeningDrag | null = null;
  let hover: string | null = null;
  let more = false;
  // no id ('', null or undefined) comes back as it is
  const byId = (id: string | null | undefined): Opening | '' | null | undefined =>
    id && plan().openings.find(o => o.id === id);
  const selected = (): Opening | null => {
    const o = byId(sel().opening);
    if (!o && sel().opening) sel().opening = null;
    return o || null;
  };
  // Where the opening is on the plan: ends, along (u), outward (n), the wall band from its inner face (d0) to the outer one (d1).
  function geo(o: Opening): OpeningGeometry | null {
    const c = openingCoords(plan().rooms, o);
    const r = roomById(plan(), o.at.room);
    if (!c || !r) return null;
    const L = Math.hypot(c.b[0] - c.a[0], c.b[1] - c.a[1]);
    const u: Vector = [(c.b[0] - c.a[0]) / L, (c.b[1] - c.a[1]) / L];
    const n = outward(plan().rooms, c);
    const W = wallInfo(plan(), r, o.at.edge);
    const d1 = W.interior ? W.gap + WALL.inner : W.t - WALL.inner;
    return {o, r, a: c.a, b: c.b, L, u, n, d0: -WALL.inner, d1};
  }
  const at = (g: OpeningGeometry, s: number, d: number): Point => [
    g.a[0] + g.u[0] * s + g.n[0] * d,
    g.a[1] + g.u[1] * s + g.n[1] * d,
  ];
  // s along the room side the opening is attached to
  const along = (o: Opening, p: Point): number => {
    const r = roomById(plan(), o.at.room)!; // the opening was hit or is dragged: its room is there
    const P = r.polygon;
    const a = P[o.at.edge % P.length];
    const b = P[(o.at.edge + 1) % P.length];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / l;
  };
  const T = {} as OpeningsTool; // its members are set below, before the rooms mode calls any

  // Hit test: the edges of the selected one — width; the opening band — move; in “Select” also the door arc.
  T.hit = (p, tool) => {
    const tol = v().tol();
    const cur = selected();
    const list = cur ? [cur, ...plan().openings.filter(o => o !== cur)] : plan().openings;
    for (const o of list) {
      const g = geo(o);
      if (!g) continue;
      const q = [p[0] - g.a[0], p[1] - g.a[1]];
      const s = q[0] * g.u[0] + q[1] * g.u[1];
      const d = q[0] * g.n[0] + q[1] * g.n[1];
      if (d < g.d0 - tol * 0.6 || d > g.d1 + tol * 0.6) continue;
      if (o === cur) {
        if (Math.abs(s) < tol) return {kind: 'opening', o, end: 0};
        if (Math.abs(s - g.L) < tol) return {kind: 'opening', o, end: 1};
      }
      if (s >= 0 && s <= g.L) return {kind: 'opening', o};
    }
    if (tool === 'select')
      for (const o of list) {
        if (o.kind !== 'door' || o.leaf === false) continue;
        const g = geo(o);
        if (!g) continue;
        const sw = swingOf(o);
        const h = sw.hinge ? g.b : g.a;
        const uu = sw.hinge ? [-g.u[0], -g.u[1]] : g.u;
        const dir = sw.out ? g.n : [-g.n[0], -g.n[1]];
        const q = [p[0] - h[0], p[1] - h[1]];
        if (Math.hypot(...q) < g.L && q[0] * dir[0] + q[1] * dir[1] > 0 && q[0] * uu[0] + q[1] * uu[1] > 0)
          return {kind: 'opening', o};
      }
    return null;
  };
  T.cursor = h => {
    const g = geo(h.o);
    return g ? axisCursor(g.u) : 'move';
  };
  T.dragCursor = () => (drag ? T.cursor(drag) : null);
  T.cancelDrag = () => {
    drag = null;
  };
  T.hover = id => {
    if (hover === id) return false;
    hover = id;
    return true;
  };

  T.select = o => {
    Object.assign(sel(), {opening: o.id, room: null, wall: null, vertex: null});
    more = false;
    ed.view.select(null);
  };
  T.down = (h, p) => {
    T.select(h.o);
    const o = h.o;
    drag = {
      o,
      end: h.end,
      s: along(o, p),
      s0: o.at.s0,
      s1: o.at.s1,
      g: openingGap(plan(), o) || [o.at.s0, o.at.s1],
      moved: false,
    };
    ed.drag = drag;
    ed.mode.refresh?.();
    ed.draw();
  };
  T.move = (p, free) => {
    if (!drag) return false;
    const ds = along(drag.o, p) - drag.s;
    if (!drag.moved && Math.abs(ds) * v().sc < 3) return true;
    drag.moved = true;
    const snap = (x: number): number => (free ? x : Math.round(x / STEP) * STEP);
    const [g0, g1] = drag.g;
    const o = drag.o;
    let s0 = drag.s0;
    let s1 = drag.s1;
    if (drag.end == null) {
      const w = s1 - s0;
      s0 = Math.max(g0, Math.min(g1 - w, snap(drag.s0 + ds)));
      s1 = s0 + w;
    } else if (drag.end === 0) s0 = Math.max(g0, Math.min(s1 - MIN_OPENING, snap(drag.s0 + ds)));
    else s1 = Math.min(g1, Math.max(s0 + MIN_OPENING, snap(drag.s1 + ds)));
    o.at = {...o.at, s0: +s0.toFixed(3), s1: +s1.toFixed(3)};
    ed.update();
    return true;
  };
  T.up = () => {
    if (!drag) return false;
    const moved = drag.moved;
    drag = null;
    ed.drag = null;
    if (moved) ed.commit();
    else {
      ed.mode.refresh?.();
      ed.draw();
    }
    return true;
  };

  // Place from the wall menu: W — the selected wall piece, k — 'door' | 'window'. try — only check whether it fits.
  const place = (W: WallStretch, k: OpeningKind, dry: boolean): Opening | null => {
    const r = W.room;
    const P = r.polygon;
    const a = P[W.i];
    const b = P[(W.i + 1) % P.length];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const o = addOpening(plan(), r, W.i, (sel().wall?.t ?? 0.5) * l, k, {
      lo: W.seg[0],
      hi: W.seg[1],
      outer: !W.interior,
    });
    if (o && dry) plan().openings.pop();
    return o;
  };
  T.can = (W, k) => !!place(W, k, true);
  T.add = (W, k) => {
    const o = place(W, k, false);
    if (!o) return;
    T.select(o);
    ed.commit();
  };
  // The “Windows & doors” step (D-044): the band of the future opening where the pointer is. W — the wall piece, tt — a point on the room side 0…1.
  // A door width (80 cm) on any wall — a place marker, not a window; offsets from corners and neighbours — the same addOpening.
  // q — pulse phase 0…1: a ring spreads from the band and fades, like on buttons (@keyframes pulse in styles.css); null — no pulse.
  T.ghost = (W, tt, q = null) => {
    const r = W.room;
    const P = r.polygon;
    const a = P[W.i];
    const b = P[(W.i + 1) % P.length];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const o = addOpening(plan(), r, W.i, tt * l, 'door', {lo: W.seg[0], hi: W.seg[1]});
    if (!o) return;
    plan().openings.pop();
    const g = geo(o);
    if (!g) return;
    const {ctx} = v();
    const S = [at(g, 0, g.d0), at(g, g.L, g.d0), at(g, g.L, g.d1), at(g, 0, g.d1)].map(x => v().S(x));
    const quad = (): void => {
      ctx.moveTo(...S[0]);
      for (const x of S.slice(1)) ctx.lineTo(...x);
      ctx.closePath();
    };
    ctx.save();
    if (q != null) {
      const e = 1 - (1 - q) ** 2;
      ctx.save();
      ctx.beginPath();
      ctx.rect(-1e5, -1e5, 2e5, 2e5);
      quad();
      ctx.clip('evenodd'); // the ring up to 16 px — only outside the band
      ctx.beginPath();
      quad();
      ctx.lineJoin = 'round';
      ctx.strokeStyle = pal.acc;
      ctx.globalAlpha = 0.85 * (1 - e);
      ctx.lineWidth = 32 * e;
      ctx.stroke();
      ctx.restore();
    }
    ctx.beginPath();
    quad();
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = pal.acc;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = pal.acc;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  };
  T.del = () => {
    const o = selected();
    if (!o) return false;
    plan().openings = plan().openings.filter(x => x !== o);
    sel().opening = null;
    ed.commit();
    return true;
  };

  T.draw = () => {
    const {ctx} = v();
    const band = (g: OpeningGeometry, fill: string, stroke?: string): void => {
      v().path([at(g, 0, g.d0), at(g, g.L, g.d0), at(g, g.L, g.d1), at(g, 0, g.d1)], true);
      ctx.fillStyle = fill;
      ctx.fill();
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    };
    const hv = byId(hover);
    const cur = selected();
    if (hv && hv !== cur) {
      const g = geo(hv);
      if (g) band(g, pal.acc2);
    }
    if (!cur) return;
    const g = geo(cur);
    if (!g) return;
    band(g, pal.acc2, pal.acc);
    const mid = (g.d0 + g.d1) / 2;
    for (const s of [0, g.L]) v().dot(at(g, s, mid), 5, '#fff', pal.acc, 2);
    const [X, Y] = v().S(at(g, g.L / 2, g.d1 + 16 / v().sc));
    dimLabel(v(), X, Y, t('{0} cm', cm(g.L)));
    // while dragging — distances to the wall corners
    if (drag?.moved) {
      const r = g.r;
      const o = cur;
      const P = r.polygon;
      const l = Math.hypot(
        P[(o.at.edge + 1) % P.length][0] - P[o.at.edge % P.length][0],
        P[(o.at.edge + 1) % P.length][1] - P[o.at.edge % P.length][1],
      );
      const [lo, hi] = wallAt(plan(), r, o.at.edge, (o.at.s0 + o.at.s1) / 2 / l).seg;
      const gaps = [
        [lo, o.at.s0],
        [o.at.s1, hi],
      ];
      for (const [x0, x1] of gaps) {
        if (x1 - x0 < 0.05) continue;
        const sm = (x0 + x1) / 2 - o.at.s0;
        const [gx, gy] = v().S(at(g, sm, g.d1 + 16 / v().sc));
        dimLabel(v(), gx, gy, t('{0} cm', cm(x1 - x0)));
      }
    }
  };

  // Panel of the selected opening
  T.ctx = () => {
    const o = selected();
    if (!o) return null;
    const g = geo(o);
    if (!g) return null;
    const door = o.kind === 'door';
    const leaf = door && o.leaf !== false;
    const line = el(
      `<div class="line"><b>${door ? (o.glass ? t('Glass door') : leaf ? t('Door') : t('Opening')) : t('Window')}</b></div>`,
    );
    const lines = [line];
    const w = el(`<button class="soft" title="${t('Enter width')}">${t('{0} cm', cm(g.L))}</button>`);
    w.onclick = () => {
      const [X, Y] = v().S(at(g, g.L / 2, (g.d0 + g.d1) / 2));
      ed.ask(X, Y, t('Width, cm'), cm(g.L), {
        type: 'len',
        ok: m => {
          setOpeningWidth(plan(), o, m);
          ed.commit();
        },
      });
    };
    line.append(w);
    if (leaf) {
      const turn = el(
        `<button class="soft" title="${t('Change door swing')}">${icon('rotate', 15)}${t('Rotate')}</button>`,
      );
      turn.onclick = () => {
        turnDoor(o);
        ed.commit();
      };
      line.append(turn);
    }
    if (door) {
      const mb = el(
        `<button class="ib ${more ? 'on' : ''}" title="${t('More')}">${icon('more', 15)}</button>`,
      );
      mb.onclick = () => {
        more = !more;
        ed.mode.refresh?.();
      };
      line.append(mb);
    }
    const del = el(`<button class="ib bad" title="${t('Remove (Delete)')}">${icon('trash', 15)}</button>`);
    del.onclick = () => T.del();
    line.append(del);
    if (!door) lines.push(windowLine(o));
    if (door && more) {
      const ml =
        el(`<div class="line more"><label class="tg"><span>${t('No door')}</span><input type="checkbox" data-k="leaf" ${leaf ? '' : 'checked'}><i></i></label>
        <label class="tg" title="${t('A balcony or terrace door: glass in 3D')}"><span>${t('Glass')}</span><input type="checkbox" data-k="glass" ${o.glass ? 'checked' : ''}><i></i></label></div>`);
      // both inputs are in the markup above
      ml.querySelector<HTMLInputElement>('[data-k=leaf]')!.onchange = e => {
        if ((e.target as HTMLInputElement).checked) o.leaf = false;
        else delete o.leaf;
        if (o.swing == null) o.swing = 0;
        ed.commit();
      };
      ml.querySelector<HTMLInputElement>('[data-k=glass]')!.onchange = e => {
        if ((e.target as HTMLInputElement).checked) o.glass = true;
        else delete o.glass;
        ed.commit();
      };
      lines.push(ml);
    }
    return lines;
  };
  // Window: regular (85 cm sill) or panoramic — from the floor almost to the ceiling; height above the floor and window height — as numbers.
  // Panoramic is one that starts at the floor (up to 10 cm): this way the switch tells the truth even after a manual edit.
  const PANO = {bottom: 0, top: WALL.height - 0.1};
  const isPano = (o: Opening): boolean => (o.bottom ?? OPENING.window.bottom) <= 0.1;
  function windowLine(o: Opening): HTMLElement {
    const ln = el(`<div class="line opts"></div>`);
    const pano = isPano(o);
    const b0 = o.bottom ?? OPENING.window.bottom;
    const t0 = o.top ?? OPENING.window.top;
    for (const [k, name] of [
      [false, t('Standard')],
      [true, t('Floor-to-ceiling')],
    ]) {
      const b = el(`<button class="chip ${pano === k ? 'on' : ''}">${name}</button>`);
      b.onclick = () => {
        if (pano === k) return;
        Object.assign(o, k ? PANO : {bottom: OPENING.window.bottom, top: OPENING.window.top});
        ed.commit();
      };
      ln.append(b);
    }
    const num = (label: string, tip: string, val: number, set: (metres: number) => void): HTMLElement => {
      const lab = el(
        `<label class="num" title="${tip}">${label}<input inputmode="decimal" value="${cm(val)}"><small>${t('cm')}</small></label>`,
      );
      const inp = lab.querySelector('input')!; // in the markup above
      inp.onfocus = () => inp.select();
      inp.onkeydown = e => {
        e.stopPropagation();
        if (e.key === 'Enter') inp.blur();
        if (e.key === 'Escape') {
          inp.value = String(cm(val));
          inp.blur();
        }
      };
      inp.onchange = () => {
        const v = parseFloat(inp.value.trim().replace(',', '.'));
        if (!(v >= 0)) {
          inp.value = String(cm(val));
          return;
        }
        set(v / 100);
        ed.commit();
      };
      return lab;
    };
    // the sill moves, the window top (lintel) stays; the top is not above the wall, the window is not lower than 30 cm
    ln.append(
      num(t('Sill'), t('Sill height from the floor'), b0, v => {
        o.bottom = +Math.max(0, Math.min(WALL.height - 0.3, v)).toFixed(2);
        o.top = +Math.min(WALL.height, Math.max(t0, o.bottom + 0.3)).toFixed(2);
      }),
      num(t('Height'), t('Window height'), t0 - b0, v => {
        o.bottom = b0;
        o.top = +Math.min(WALL.height, b0 + Math.max(0.3, v)).toFixed(2);
      }),
    );
    return ln;
  }
  T.anchor = () => {
    const o = selected();
    const g = o && geo(o);
    if (!g) return null;
    const q = [at(g, 0, g.d0), at(g, g.L, g.d0), at(g, g.L, g.d1), at(g, 0, g.d1)];
    const xs = q.map(p => p[0]);
    const ys = q.map(p => p[1]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  };
  T.selected = selected;
  return T;
}
