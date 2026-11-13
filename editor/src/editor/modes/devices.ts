// The “Devices” mode (D-048): air conditioners, curtains and blinds, door/window sensors from Home Assistant — in the model, like lights.
// On the left — devices by area: in the model or not, what is happening now (heating 25°, open). “Place automatically” —
// everything not yet in the model (core/devices.js: autoPlace). A device is dragged from the list onto the plan, like furniture from the catalog (or a click,
// then a place): a curtain — onto a window, a sensor — onto a window or a door, an air conditioner — onto a wall (its model appears). On the plan each has
// an icon: for the air conditioner and the curtain — on their object, for the sensor — at the opening. The icon is dragged (the owner: “why not a regular drag”):
// the air conditioner slides along walls, the curtain and the sensor jump to the window or door under the pointer; dropped elsewhere — they stay where they were.
// A click on the icon selects it: “Remove from model” (and Delete).
// Wizard step: after “Lights” a question (wizard-path.js: askDevices) → begin: place them automatically and check.
import {t} from '../../i18n/i18n.ts';
import {segDist, pointIn, openingCoords} from '../../core/geometry.ts';
import {roomOfArea} from '../../core/sensors.ts';
import {
  deviceKind,
  PLACEABLE,
  coverModel,
  autoPlace as autoPlaceUntyped,
  placeOn,
  moveTo,
  unplace,
  recOf,
  acView,
  coverView,
  contactView,
  windowsOf,
} from '../../core/devices.ts';
import {$, el, esc} from '../ui.ts';
import {icon, iconD} from '../icons.ts';
import {pal, section} from './typed-helpers.ts';
import type {
  HaDevice,
  HaLayer,
  HassEntityState,
  Opening,
  PlacedOpening,
  Plan,
  PlanDevice,
  Point,
} from '../../core/types.ts';
import type {CanvasPoint, DevicesMode, Editor, PlanPointer, PlanView2d, Selection} from '../editor-types.ts';

/** What a device is in the model (devices.ts deviceKind): a heater has no model, only the others are placed. */
type DeviceKind = 'ac' | 'heat' | 'cover' | 'contact';

/** Where a device goes (devices.ts placeOn, moveTo): an air conditioner on a room side, the others on an opening. */
type DeviceTarget = {room: string; edge: number; t: number} | {opening: string};

/** A room side under the pointer (wallAt): its room and edge, how far along it (metres), its ends, and the distance to it. */
interface WallSide {
  d: number;
  room: string;
  edge: number;
  t: number;
  a: Point;
  b: Point;
}

/** An opening under the pointer (openingAt): the opening, its ends now, and the distance in pixels. */
interface OpeningSpot {
  o: Opening;
  c: PlacedOpening;
  dist: number;
}

/** What the pointer is over while a device is placed or dragged: a room side or an opening, and where the device would go. */
interface DeviceHover {
  wall?: WallSide | null;
  o?: Opening;
  c?: PlacedOpening;
  dist?: number;
  t?: DeviceTarget;
}

/** A device's icon on the plan: its entity and where the icon is, canvas pixels. */
interface DeviceBadge {
  e: string;
  X: number;
  Y: number;
}

/** A device's icon dragged on the plan: from where (canvas pixels), and where the pointer is now. */
interface DeviceDrag {
  d: HaDevice;
  start: CanvasPoint;
  moved: boolean;
  at?: CanvasPoint;
}

/** A row of the list dragged onto the plan: where the press was (client pixels); at: the pointer over the plan, null: not over it. */
interface ListDrag {
  d: HaDevice;
  x: number;
  y: number;
  dragging?: boolean;
  at?: CanvasPoint | null;
}

// core/devices.ts is not typed yet: its autoPlace reads as taking an entity lookup without an argument; this is how it is called
const autoPlace = autoPlaceUntyped as (
  plan: Plan,
  devices: HaDevice[],
  entityOf?: (entity: string) => HassEntityState | null | undefined,
) => number;

const ICON: Partial<Record<string, string>> = {ac: 'airVent', contact: 'doorOpen'};
export const deviceIcon = (d: HaDevice): string =>
  deviceKind(d, undefined) === 'cover'
    ? coverModel(d) === 'blind'
      ? 'blinds'
      : 'curtain'
    : deviceKind(d, undefined) === 'contact' && d.cls === 'window'
      ? 'window'
      : ICON[deviceKind(d, undefined) as string] || 'zap'; // null (not for the model) finds no icon

export function devicesMode(ed: Editor): DevicesMode {
  const m = {id: 'devices'} as DevicesMode; // its members are set below, before app.ts calls any
  let placing: HaDevice | null = null;
  let hover: DeviceHover | null = null;
  let hits: DeviceBadge[] = [];
  let stepKey: string | null = null;
  let drag: DeviceDrag | null = null;
  let listDrag: ListDrag | null = null;
  let dropOk = false;
  const plan = (): Plan => ed.plan;
  const sel = (): Selection => ed.sel;
  const v = (): PlanView2d => ed.v;
  const ha = (): HaLayer => ed.ha;
  // into the model — air conditioners, curtains, opening sensors; the thermostat (heating only) — no, it is only in the “Preview” panel
  const kind = (d: HaDevice): DeviceKind | null => deviceKind(d, ha().entity?.(d.entity));
  // a null kind is simply not in the set
  const devs = (): HaDevice[] => (ha().devices?.() || []).filter(d => PLACEABLE.has(kind(d)!));
  const byE = (e: string | null | undefined): HaDevice | undefined => devs().find(d => d.entity === e);
  // what is happening now: “Heat · 25°”, “40% open”, “Open”
  function stateText(d: HaDevice): string {
    const x = ha().entity?.(d.entity);
    const k = kind(d);
    if (k === 'ac') {
      const a = acView(x);
      return !a.ok
        ? t('No connection')
        : !a.on
          ? t('Off')
          : a.temp != null
            ? `${a.name} · ${Math.round(a.temp * 2) / 2}°`
            : a.name;
    }
    if (k === 'cover') {
      const c = coverView(x);
      return !c.ok
        ? t('No connection')
        : c.pos >= 100
          ? t('Open')
          : c.pos <= 0
            ? t('Closed')
            : t('{0}% open', Math.round(c.pos));
    }
    const c = contactView(x);
    return !c.ok ? t('No connection') : c.open ? t('Open') : t('Closed');
  }
  const want = (d: HaDevice): string =>
    kind(d) === 'ac'
      ? t('Click a wall to place the air conditioner')
      : kind(d) === 'cover'
        ? t('Click a window')
        : d.cls === 'window'
          ? t('Click a window')
          : t('Click a door');
  const fits = (d: HaDevice, o: Opening): boolean =>
    kind(d) === 'cover' || d.cls === 'window'
      ? o.kind === 'window'
      : d.cls === 'opening' || o.kind === 'door';

  // ---------- what is under the pointer ----------
  // the opening under the pointer (in screen pixels, up to 14 px) that suits the device
  function openingAt(e: Pick<PlanPointer, 'offsetX' | 'offsetY'>, d: HaDevice | null): OpeningSpot | null {
    let best: OpeningSpot | null = null;
    for (const o of plan().openings) {
      if (d && !fits(d, o)) continue;
      const c = openingCoords(plan().rooms, o);
      if (!c) continue;
      const [ax, ay] = v().S(c.a);
      const [bx, by] = v().S(c.b);
      const [dist] = segDist([e.offsetX, e.offsetY], [ax, ay], [bx, by]);
      if (dist < 14 && (!best || dist < best.dist)) best = {o, c, dist};
    }
    return best;
  }
  // the room side under the pointer: the nearest wall of the room under it, otherwise of the nearest room → {room, edge, t, a, b}
  function wallAt(p: Point): WallSide | null {
    const rooms = plan().rooms.filter(r => !r.solid);
    const inR = rooms.find(r => pointIn(p, r.polygon));
    let best: WallSide | null = null;
    for (const r of inR ? [inR] : rooms) {
      const P = r.polygon;
      for (let i = 0; i < P.length; i++) {
        const a = P[i];
        const b = P[(i + 1) % P.length];
        const [d, tt] = segDist(p, a, b);
        if (!best || d < best.d)
          best = {d, room: r.id, edge: i, t: tt * Math.hypot(b[0] - a[0], b[1] - a[1]), a, b};
      }
    }
    return best && (inR || best.d < 1.2) ? best : null;
  } // inside a room — to its nearest wall, outside — no farther than 1.2 m
  // where the device icon is on the plan: for an object — its middle, for a sensor — the middle of the opening, slightly into the room
  function spotOf(rec: PlanDevice): Point | null {
    if (rec.furn) {
      const f = plan().furniture.find(f => f.id === rec.furn);
      return f ? [f.x, f.y] : null;
    }
    const o = plan().openings.find(o => o.id === rec.opening);
    const c = o && openingCoords(plan().rooms, o);
    return c ? [(c.a[0] + c.b[0]) / 2, (c.a[1] + c.b[1]) / 2] : null;
  }

  // ---------- plan ----------
  function badge(
    g: CanvasRenderingContext2D,
    X: number,
    Y: number,
    name: string,
    on: boolean,
    warm: boolean,
  ): void {
    g.save();
    g.beginPath();
    g.arc(X, Y, 12, 0, 7);
    g.fillStyle = on ? pal.acc : warm ? pal.warn : pal.cv;
    g.fill();
    g.lineWidth = on ? 2 : 1.2;
    g.strokeStyle = on ? pal.acc : warm ? pal.warn : pal.label2;
    g.stroke();
    g.translate(X - 7, Y - 7);
    g.scale(14 / 24, 14 / 24);
    g.lineWidth = 2.1;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = on || warm ? (pal.dark ? '#0b0c10' : '#fff') : pal.label;
    for (const d of iconD(name)) g.stroke(new Path2D(d));
    g.restore();
  }
  // what is being placed or dragged now (to highlight the places)
  const active = (): HaDevice | null =>
    placing || (drag?.moved ? drag.d : null) || (listDrag?.dragging ? listDrag.d : null);
  m.draw = () => {
    const g = v().ctx;
    hits = [];
    // placing or dragging: suitable openings — accented, the one under the pointer — thicker; for an air conditioner — the side under the pointer
    {
      const d = active();
      if (d) {
        if (kind(d) === 'ac') {
          if (hover?.wall) {
            const w = hover.wall;
            g.strokeStyle = pal.acc;
            g.lineWidth = 5;
            g.lineCap = 'round';
            g.beginPath();
            g.moveTo(...v().S(w.a));
            g.lineTo(...v().S(w.b));
            g.stroke();
            g.lineCap = 'butt';
          }
        } else
          for (const o of plan().openings) {
            if (!fits(d, o)) continue;
            const c = openingCoords(plan().rooms, o);
            if (!c) continue;
            const on = hover?.o === o;
            g.strokeStyle = pal.acc;
            g.globalAlpha = on ? 1 : 0.45;
            g.lineWidth = on ? 7 : 4;
            g.lineCap = 'round';
            g.beginPath();
            g.moveTo(...v().S(c.a));
            g.lineTo(...v().S(c.b));
            g.stroke();
            g.globalAlpha = 1;
            g.lineCap = 'butt';
          }
      }
    }
    // a curtain or a sensor is dragged — the icon follows the pointer (the air conditioner moves by itself, together with the object)
    const ghost =
      drag?.moved && kind(drag.d) !== 'ac' ? drag : listDrag?.dragging && listDrag.at ? listDrag : null;
    for (const rec of plan().devices || []) {
      const d = byE(rec.entity);
      if (!d || !recOf(plan(), d.entity) || ghost?.d === d) continue;
      const q = spotOf(rec);
      if (!q) continue;
      const [X, Y] = v().S(q);
      const k = kind(d);
      const warm = k === 'contact' && contactView(ha().entity?.(d.entity)).open;
      badge(g, X, Y, deviceIcon(d), sel().device === d.entity, warm);
      hits.push({e: d.entity, X, Y});
    }
    if (ghost?.at) {
      g.globalAlpha = 0.9;
      badge(g, ghost.at[0], ghost.at[1], deviceIcon(ghost.d), true, false);
      g.globalAlpha = 1;
    }
  };
  // the place under the pointer for device d: for an air conditioner — a room side, for the others — a suitable opening
  const targetAt = (
    e: Pick<PlanPointer, 'offsetX' | 'offsetY'>,
    p: Point,
    d: HaDevice,
  ): DeviceHover | null => {
    if (kind(d) === 'ac') {
      const w = wallAt(p);
      return w ? {wall: w, t: {room: w.room, edge: w.edge, t: w.t}} : null;
    }
    const h = openingAt(e, d);
    return h ? {o: h.o, t: {opening: h.o.id}} : null;
  };
  const hoverKey = (h: DeviceHover | null): string | null =>
    h?.o?.id || (h?.wall && h.wall.room + ':' + h.wall.edge) || null;
  const hitAt = (e: Pick<PlanPointer, 'offsetX' | 'offsetY'>): DeviceBadge | undefined =>
    hits.find(h => Math.hypot(e.offsetX - h.X, e.offsetY - h.Y) <= 13);
  m.down = (e, p) => {
    if (placing) {
      const d = placing;
      let r: PlanDevice | null = null;
      if (kind(d) === 'ac') {
        const w = wallAt(p);
        if (w) r = placeOn(plan(), d, {room: w.room, edge: w.edge, t: w.t});
      } else {
        const h = openingAt(e, d);
        if (h) r = placeOn(plan(), d, {opening: h.o.id});
      }
      if (!r) return true; // missed — keep waiting (Esc to cancel)
      placing = null;
      hover = null;
      sel().device = d.entity;
      ed.commit();
      return true;
    }
    const h = hitAt(e);
    const d = h && byE(h.e);
    if (!d) return false;
    const was = sel().device;
    sel().device = d.entity;
    drag = {d, start: [e.offsetX, e.offsetY], moved: false};
    ed.drag = drag;
    if (was !== d.entity) m.refresh();
    ed.draw();
    return true;
  };
  m.move = (e, p) => {
    if (drag) {
      if (!drag.moved && Math.hypot(e.offsetX - drag.start[0], e.offsetY - drag.start[1]) < 4) return;
      if (!drag.moved) {
        drag.moved = true;
        ed.showCtx(null);
      }
      const nh = targetAt(e, p, drag.d);
      drag.at = [e.offsetX, e.offsetY];
      hover = nh;
      if (kind(drag.d) === 'ac') {
        if (nh && moveTo(plan(), drag.d, nh.t)) ed.update();
        else ed.draw();
      } else ed.draw();
      v().cv.style.cursor = nh ? 'grabbing' : 'no-drop';
      return;
    }
    if (placing) {
      const nh: DeviceHover | null = kind(placing) === 'ac' ? {wall: wallAt(p)} : openingAt(e, placing);
      const k = nh?.o?.id || (nh?.wall && nh.wall.room + ':' + nh.wall.edge) || null;
      if (k !== (hover?.o?.id || (hover?.wall && hover.wall.room + ':' + hover.wall.edge) || null)) {
        hover = nh;
        ed.draw();
      }
      v().cv.style.cursor = nh?.o || nh?.wall ? 'copy' : 'crosshair';
      return;
    }
    v().cv.style.cursor = hitAt(e) ? 'move' : 'grab';
  };
  m.up = () => {
    if (!drag) return;
    const d = drag;
    drag = null;
    ed.drag = null;
    const ac = kind(d.d) === 'ac';
    const ok = d.moved && (ac || (!!hover?.t && moveTo(plan(), d.d, hover.t)));
    hover = null; // missed — it stays where it was
    if (ok) ed.commit();
    else {
      m.refresh();
      ed.draw();
    }
  };
  m.dragCursor = () => 'grabbing';
  m.cancelDrag = () => {
    drag = null;
    hover = null;
  };
  m.deselect = () => {
    if (placing) {
      placing = null;
      hover = null;
      m.refresh();
      ed.draw();
      return;
    }
    if (sel().device) {
      sel().device = null;
      m.refresh();
      ed.draw();
    }
  };
  m.closeHint = () => {
    if (!placing) return false;
    placing = null;
    hover = null;
    m.refresh();
    ed.draw();
    return true;
  }; // Esc
  m.key = e => {
    const rec = (plan().devices || []).find(x => x.entity === sel().device);
    if (rec && (e.key === 'Delete' || e.key === 'Backspace')) {
      unplace(plan(), rec);
      sel().device = null;
      ed.commit();
    }
  };
  m.anchor = () => {
    const rec: PlanDevice | undefined = recOf(plan(), sel().device);
    const q = rec && spotOf(rec);
    return q ? [q[0] - 0.3, q[1] - 0.3, q[0] + 0.3, q[1] + 0.3] : null;
  };
  m.reset = () => {
    placing = null;
    hover = null;
    stepKey = null;
    drag = null;
    listDrag = null;
  };
  m.leave = () => {
    placing = null;
    hover = null;
    listDrag = null;
  };
  m.available = () => devs().some(d => roomOfArea(plan(), d.area));
  m.placing = () => placing; // for tests
  m.counts = () => {
    const c = {ac: 0, cover: 0, contact: 0};
    for (const d of devs()) c[kind(d) as keyof typeof c]++; // devs() holds only the kinds the model places
    return c;
  }; // for the wizard question

  // ---------- panel above the selection ----------
  function ctxPanel(): void {
    const d = byE(sel().device);
    const rec = d && recOf(plan(), d.entity);
    if (!d || !rec) {
      ed.showCtx(null);
      return;
    }
    const line = el(
      `<div class="line"><span class="dev-ic">${icon(deviceIcon(d), 15)}</span><b>${esc(d.name)}</b><small>${esc(stateText(d))}</small></div>`,
    );
    const del = el(
      `<button class="ib bad" title="${esc(t('Remove from model (Delete)'))}">${icon('trash', 15)}</button>`,
    );
    del.onclick = () => {
      unplace(plan(), rec);
      sel().device = null;
      ed.commit();
    };
    line.append(el('<span class="sep"></span>'), del);
    ed.showCtx([line]);
  }

  // ---------- top row and list ----------
  m.refresh = () => {
    if (ed.mode !== m) return;
    const tools = $('tools');
    tools.innerHTML = '';
    tools.appendChild(ed.selectButton());
    const D = devs();
    const todo = D.filter(d => !recOf(plan(), d.entity) && roomOfArea(plan(), d.area));
    if (placing) {
      tools.appendChild(el(`<span class="hint">${esc(want(placing))}</span>`));
      const c = el(`<button class="soft">${t('Cancel')}</button>`);
      c.onclick = () => m.closeHint();
      tools.appendChild(c);
    } else if (todo.length) {
      const b = el(
        `<button class="primary" title="${esc(t('Air conditioners go on a free wall, curtains on windows, sensors on their room’s windows and doors'))}">${icon('sparkles', 15)}${t('Place automatically')}</button>`,
      );
      b.onclick = () => {
        ed.versions.mark('before', 'autoDevices');
        autoPlace(plan(), D, e => ha().entity?.(e));
        ed.commit();
      };
      tools.appendChild(b);
    }
    const side = $('side-body');
    side.innerHTML = '';
    const on = D.filter(d => recOf(plan(), d.entity)).length;
    ed.sideHead(t('Devices'), D.length ? t('{0} in the model', on) : '');
    if (!D.length) {
      side.appendChild(
        el(
          `<p class="empty">${t('Home Assistant has no air conditioners, curtains or door/window sensors.')}</p>`,
        ),
      );
      stepBanner();
      ctxPanel();
      return;
    }
    for (const ar of ed.sortAreas(new Set(D.map(d => d.area || '')))) {
      const ds = D.filter(d => (d.area || '') === ar).sort((a, b) =>
        a.name.localeCompare(b.name, undefined, {numeric: true}),
      );
      const n = ds.filter(d => recOf(plan(), d.entity)).length;
      const room = roomOfArea(plan(), ar);
      const body = section(side, 'dev:' + ar, ar ? ed.areaName(ar) : t('No area'), {
        count: `${n}/${ds.length}`,
        open: !!room || !ar,
      });
      // why it is not in the model: a curtain needs a window in its room
      const why = (d: HaDevice): string =>
        room && kind(d) === 'cover' && !windowsOf(plan(), room).length
          ? t('no window')
          : t('not in the model');
      if (!room)
        body.appendChild(
          el(`<p class="empty">${t('This area isn’t on the plan — click a device, then its spot.')}</p>`),
        );
      for (const d of ds) {
        const placed = !!recOf(plan(), d.entity);
        const cur = placing === d || sel().device === d.entity;
        const row =
          el(`<div class="row device ${placed ? 'on' : ''} ${cur ? 'sel' : ''}" title="${esc(placed ? t('In the model · click to select, drag to move') : t('Drag onto the plan, or click and then pick a spot'))}">
          <span class="dev-ic">${icon(deviceIcon(d), 15)}</span><span class="nm">${esc(d.name)}</span><small>${esc(stateText(d))}</small>${placed ? icon('check', 14) : `<em>${esc(why(d))}</em>`}</div>`);
        row.onpointerdown = e => {
          if (e.button !== 0) return;
          e.preventDefault();
          listDrag = {d, x: e.clientX, y: e.clientY};
        };
        row.onclick = () => {
          if (dropOk) {
            dropOk = false;
            return;
          }
          if (placed) {
            sel().device = d.entity;
            placing = null;
          } else {
            placing = d;
            sel().device = null;
          }
          hover = null;
          m.refresh();
          ed.draw();
        };
        body.appendChild(row);
      }
    }
    stepBanner();
    ctxPanel();
  };
  ed.ha?.onState?.(() => {
    if (ed.mode === m && !drag && !listDrag?.dragging) m.refresh();
  });
  // from the list onto the plan: a row is dragged, over the plan the place under the pointer is highlighted, released there — it lands; not dragged — it is a click
  addEventListener('pointermove', e => {
    if (!listDrag || ed.mode !== m) return;
    if (!listDrag.dragging) {
      if (Math.hypot(e.clientX - listDrag.x, e.clientY - listDrag.y) < 6) return;
      listDrag.dragging = true;
      placing = null;
      sel().device = null;
      ed.showCtx(null);
    }
    const r = v().cv.getBoundingClientRect();
    const X = e.clientX - r.left;
    const Y = e.clientY - r.top;
    const over =
      X >= 0 &&
      Y >= 0 &&
      X <= r.width &&
      Y <= r.height &&
      document.elementFromPoint(e.clientX, e.clientY) === v().cv;
    listDrag.at = over ? [X, Y] : null;
    hover = over ? targetAt({offsetX: X, offsetY: Y}, v().W([X, Y]), listDrag.d) : null;
    ed.draw();
  });
  addEventListener('pointerup', () => {
    if (!listDrag) return;
    const L = listDrag;
    listDrag = null;
    if (!L.dragging) return;
    dropOk = true; // a click on the row after dragging is not a click
    const h = hover;
    hover = null;
    if (h?.t && moveTo(plan(), L.d, h.t)) {
      sel().device = L.d.entity;
      ed.commit();
    } else {
      m.refresh();
      ed.draw();
    }
  });
  addEventListener('pointercancel', () => {
    if (listDrag) {
      listDrag = null;
      hover = null;
      m.refresh();
      ed.draw();
    }
  });

  // ---------- wizard step ----------
  const wizOn = (): boolean => !!ed.wizard?.get(plan().id)?.dev;
  m.wizardOn = wizOn;
  function stepBanner(): void {
    if (!wizOn()) {
      if (stepKey) {
        stepKey = null;
        if (ed.stepNow()?.mode === m) ed.step(null);
      }
      return;
    }
    const n = (plan().devices || []).filter(x => recOf(plan(), x.entity)).length;
    const key = 'on:' + n;
    if (stepKey === key && ed.stepNow()?.mode === m) return;
    stepKey = key;
    ed.step(
      `${t('Check where the devices are: air conditioners, curtains, door and window sensors.')}<small>${t('Wrong spot? Drag it into place. When you’re done, click “Done”.')}</small>`,
      [
        [
          t('Done'),
          () => {
            ed.wizard.set(plan().id, null);
            stepKey = null;
            ed.step(null);
            m.refresh();
            ed.path.after('devices');
          },
          true,
        ],
      ],
      null,
      {id: 'devices', short: t('Devices in the model: {0}. Check their spots.', n)},
    );
  }
  m.begin = () => {
    autoPlace(plan(), devs(), e => ha().entity?.(e));
    ed.wizard.set(plan().id, {dev: true});
    stepKey = null;
    ed.setMode('devices');
    ed.commit();
    ed.view.focus?.(null);
  };
  return m;
}
