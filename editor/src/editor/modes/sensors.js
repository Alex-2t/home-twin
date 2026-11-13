// The “Sensors” mode (D-033): which Home Assistant sensors to show on the walls and where — like with lights, each has its own place.
// On the left — sensors by area: climate (temperature, humidity, CO₂, PM2.5) right away, the other numeric ones — under “All sensors”.
// A click on a row puts it on a wall (in the room of its area, the place is automatic — next to the room's other sensors) or removes it.
// No room on the plan — the question “Which room is it in?” with room buttons (the room is also the HA area, if the sensor had none);
// a click on the plan does not answer the question (otherwise a random click would place the sensor), the place can be dragged later.
// In the wizard step we ask in turn about climate sensors without a room; “Don't show” — never asked again (plan.sensorSkip). On the plan, at the wall, a marker and a badge with numbers: drag along
// the walls of any room (the sensor moves into it and stays where it was put) or onto another one's number — it lands below it in a column (S.under);
// a click selects it: own label, number color, size, “Auto position”, remove.
// Wizard step: the “Sensors on walls” item in “Finishing touches” (begin, D-039) — the suggested ones are placed automatically.
import {t} from '../../i18n/i18n.js';
import {segDist, pointIn, WALL} from '../../core/geometry.js';
import {
  METRICS,
  isClimate,
  metricOf,
  recommend,
  roomOfArea,
  whyNot,
  orphans,
  SIZES,
  INKS,
} from '../../core/sensors.js';
import {$, el, esc, section} from '../ui.js';
import {icon} from '../icons.js';
import {pal, FONT} from '../draw.js';
import {separatePlates} from '../sensor-plates.js';

export function sensorsMode(ed) {
  const m = {id: 'sensors'};
  let drag = null,
    placing = null,
    hits = [],
    all = false,
    stepKey = null,
    askFor = null,
    lastMoved = null;
  const plan = () => ed.plan,
    sel = () => ed.sel,
    v = () => ed.v,
    ctx = () => ed.sensorCtx();
  const find = id => (id ? plan().sensors.find(S => S.id === id) : null);
  const shown = e => plan().sensors.find(S => S.entity === e);
  const newId = () => 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const info = S => ctx().sensors.find(s => s.entity === S?.entity);
  const val = s => {
    const x = ctx().state(s.entity);
    return x == null ? '—' : metricOf(s).text(x, s.unit);
  };
  const order = s => {
    const i = METRICS.findIndex(m => m.cls === s.cls);
    return i < 0 ? 99 : i;
  };

  // the nearest wall point: in the room under the pointer, otherwise of the nearest room
  function wallAt(p) {
    const rooms = plan().rooms.filter(r => !r.solid),
      inR = rooms.find(r => pointIn(p, r.polygon));
    let best = null;
    for (const r of inR ? [inR] : rooms) {
      const P = r.polygon;
      for (let i = 0; i < P.length; i++) {
        const a = P[i],
          b = P[(i + 1) % P.length],
          [d, t] = segDist(p, a, b);
        if (!best || d < best.d) {
          const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
          best = {
            d,
            room: r,
            u: [(b[0] - a[0]) / l, (b[1] - a[1]) / l],
            q: [+(a[0] + (b[0] - a[0]) * t).toFixed(3), +(a[1] + (b[1] - a[1]) * t).toFixed(3)],
          };
        }
      }
    }
    return best;
  }
  function put(s, room, at, also = []) {
    let first = null;
    for (const x of [s, ...also]) {
      const S = {id: newId(), entity: x.entity, room: room.id, ...(at && x === s ? {at} : {})};
      plan().sensors.push(S);
      first ??= S;
      plan().sensorSkip = plan().sensorSkip.filter(e => e !== x.entity);
      if (!x.area && room.area && ed.ha.setArea) ed.ha.setArea(x.entity, room.area);
    } // like for a lamp: there was no area — write it to HA too
    sel().sensor = first.id;
    placing = null;
    askFor = null;
    ed.commit();
  }
  // the other readings of the same device without a room (a thermometer with humidity) — ask about the device once
  const kin = s => (s.device ? orphans(plan(), ctx()).filter(x => x !== s && x.device === s.device) : []);
  // A sensor without a room is asked about on selection from the list. First the suggested readings can be calmly reviewed in 3D.
  const asking = () => {
    if (sel().sensor) return null;
    if (askFor && !shown(askFor.entity)) return askFor;
    askFor = null;
    return null;
  };
  function remove(S) {
    for (const x of plan().sensors)
      if (x.under === S.id) {
        if (S.under) x.under = S.under;
        else {
          delete x.under;
          if (S.at && !x.at) x.at = S.at;
        }
      }
    plan().sensors = plan().sensors.filter(x => x !== S);
    if (sel().sensor === S.id) sel().sensor = null;
    ed.commit();
  }
  function toggle(s) {
    const S = shown(s.entity);
    if (S) {
      remove(S);
      return;
    }
    const r = roomOfArea(plan(), s.area);
    if (r) {
      put(s, r);
      return;
    }
    sel().sensor = null;
    askFor = s;
    m.refresh();
    ed.draw();
  }

  // ---------- plan ----------
  // A marker on the wall face — where the label is in 3D; a badge with numbers — for sensors standing together (auto position), one for all.
  // Badges: each sensor has its own, at its own marker on the wall (the same place as the label in 3D). The text is horizontal; on a horizontal
  // wall neighbours overlap — they spread along it; if they still do not fit on the wall — they turn across it (along the wall — 20 px),
  // all at once, so the wall is not a mix. The lower ones in a column are farther from the wall, following the top one.
  // A sensor is dragged — it follows the pointer with its lower ones, a dashed line on the wall shows where it will land. It overlaps another one's badge — it immediately
  // lands below it; the pointer moved away — separate again. If they still overlap (small zoom) — the one just moved gives way.
  const PH = 20,
    VG = 3;
  const pw = (g, sp) => g.measureText(sp.items[0].text).width + 10;
  function plateAt(g, sp, X, Y, ang, L) {
    const on = sp.id === sel().sensor,
      it = sp.items[0];
    g.save();
    g.translate(X, Y);
    g.rotate(ang);
    g.fillStyle = on ? pal.acc2 : pal.cv;
    g.strokeStyle = on ? pal.acc : pal.wall;
    g.lineWidth = on ? 1.5 : 1;
    g.beginPath();
    g.roundRect(-L / 2, -PH / 2, L, PH, 7);
    g.fill();
    g.stroke();
    g.fillStyle = it.lvl === 2 ? pal.bad : it.lvl === 1 ? pal.warn : on ? pal.acc : pal.label;
    g.fillText(it.text, 0, 4);
    g.restore();
    const c = Math.abs(Math.cos(ang)),
      s = Math.abs(Math.sin(ang)),
      hx = (L / 2) * c + (PH / 2) * s,
      hy = (L / 2) * s + (PH / 2) * c;
    hits.unshift({
      id: sp.id,
      X: X,
      Y: Y,
      ang,
      hw: L / 2,
      hh: PH / 2,
      X0: X - hx,
      Y0: Y - hy,
      X1: X + hx,
      Y1: Y + hy,
    });
  }
  function column(g, ss, X, Y, st) {
    ss.forEach((sp, j) => plateAt(g, sp, X + st[0] * j, Y + st[1] * j, 0, pw(g, sp)));
  } // horizontal: dragging
  const floating = () => drag?.moved && !drag.stacked && drag.cur;
  m.draw = () => {
    const g = v().ctx,
      spots = ed.spots || [],
      fl = floating() ? below(drag.S) : null;
    hits = [];
    for (const sp of spots) {
      if (fl?.has(sp.id)) continue;
      const a = [sp.c[0] - (sp.u[0] * sp.w) / 2, sp.c[1] - (sp.u[1] * sp.w) / 2],
        b = [sp.c[0] + (sp.u[0] * sp.w) / 2, sp.c[1] + (sp.u[1] * sp.w) / 2],
        [AX, AY] = v().S(a),
        [BX, BY] = v().S(b);
      g.strokeStyle = pal.acc;
      g.globalAlpha = sp.id === sel().sensor ? 0.95 : 0.6;
      g.lineWidth = 3;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(AX, AY);
      g.lineTo(BX, BY);
      g.stroke();
      g.globalAlpha = 1;
      g.lineCap = 'butt';
      hits.push({id: sp.id, seg: [AX, AY, BX, BY]});
    }
    g.font = `600 10.5px ${FONT}`;
    g.textAlign = 'center';
    const cols = new Map();
    for (const sp of spots) {
      if (fl?.has(sp.id)) continue;
      if (!cols.has(sp.col)) cols.set(sp.col, []);
      cols.get(sp.col).push(sp);
    }
    // overlap — the one just moved gives way (the neighbours stay put), the rest — in plan order
    const order = id =>
        plan().sensors.findIndex(S => S.id === id) +
        (cols.get(id)?.some(sp => sp.id === lastMoved) ? 1e6 : 0),
      blocks = [];
    // each column has two layouts: flat — text horizontal at the marker (the lower ones farther from the wall), turn — across the wall
    const boxOf = its => {
      const ps = its.flatMap(it => {
        const c = Math.abs(Math.cos(it.ang)),
          s = Math.abs(Math.sin(it.ang)),
          hx = (it.L / 2) * c + (PH / 2) * s,
          hy = (it.L / 2) * s + (PH / 2) * c;
        return [
          [it.X - hx, it.Y - hy],
          [it.X + hx, it.Y + hy],
        ];
      });
      return [
        Math.min(...ps.map(q => q[0])),
        Math.min(...ps.map(q => q[1])),
        Math.max(...ps.map(q => q[0])),
        Math.max(...ps.map(q => q[1])),
      ];
    };
    for (const [id, ss] of [...cols].sort((x, y) => order(x[0]) - order(y[0]))) {
      ss.sort((x, y) => y.y - x.y);
      const r = ss[0],
        [CX, CY] = v().S(r.c),
        [NX, NY] = v().S([r.c[0] + r.n[0], r.c[1] + r.n[1]]);
      const nl = Math.hypot(NX - CX, NY - CY) || 1,
        n = [(NX - CX) / nl, (NY - CY) / nl],
        Ls = ss.map(sp => pw(g, sp)),
        W = Math.max(...Ls),
        horiz = Math.abs(n[1]) >= Math.abs(n[0]);
      const e = (Math.abs(n[0]) * W) / 2 + (Math.abs(n[1]) * PH) / 2 + 5,
        st = horiz ? [0, Math.sign(n[1]) * (PH + VG)] : [0, PH + VG];
      const flat = ss.map((sp, j) => ({
        sp,
        L: Ls[j],
        ang: 0,
        X: CX + n[0] * e + st[0] * j,
        Y: CY + n[1] * e + st[1] * j,
      }));
      let ang = Math.atan2(n[1], n[0]);
      if (ang > Math.PI / 2 + 1e-6) ang -= Math.PI;
      else if (ang < -Math.PI / 2 - 1e-6) ang += Math.PI;
      let d = 5;
      const turn = ss.map((sp, j) => {
        const it = {sp, L: Ls[j], ang, X: CX + n[0] * (d + Ls[j] / 2), Y: CY + n[1] * (d + Ls[j] / 2)};
        d += Ls[j] + VG;
        return it;
      });
      // the wall side on screen (along x) — badges on a horizontal wall can be spread within its bounds
      const wa = v().S([r.c[0] - r.u[0] * r.t, r.c[1] - r.u[1] * r.t]),
        wb = v().S([r.c[0] + r.u[0] * (r.L - r.t), r.c[1] + r.u[1] * (r.L - r.t)]);
      blocks.push({
        n,
        horiz,
        flat,
        turn,
        W,
        wall: [wa, wb],
        wx: [Math.min(wa[0], wb[0]), Math.max(wa[0], wb[0])],
        items: flat,
        o: [0, 0],
        box() {
          const b = boxOf(this.items);
          return [b[0] + this.o[0], b[1] + this.o[1], b[2] + this.o[0], b[3] + this.o[1]];
        },
      });
    }
    const ov = (a, b) => a[0] < b[2] + 1 && b[0] < a[2] + 1 && a[1] < b[3] + 1 && b[1] < a[3] + 1;
    // On a horizontal wall neighbouring badges overlap each other — first spread them along the wall (as close as possible to their
    // markers, within the wall); if they still do not fit — the whole group goes across the wall.
    const grp = blocks.map((_, i) => i),
      root = i => (grp[i] === i ? i : (grp[i] = root(grp[i])));
    blocks.forEach((A, i) => {
      if (!A.horiz) return;
      blocks.forEach((B, j) => {
        if (j <= i || !B.horiz) return;
        if (ov(boxOf(A.flat), boxOf(B.flat))) grp[root(j)] = root(i);
      });
    });
    const groups = new Map();
    blocks.forEach((B, i) => {
      if (!B.horiz) return;
      const k = root(i);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(B);
    });
    const GAP = 4;
    for (const G of groups.values()) {
      if (G.length < 2) continue;
      G.sort((a, b) => a.flat[0].X - b.flat[0].X);
      const lo = Math.min(...G.map(B => B.wx[0])) + 2,
        hi = Math.max(...G.map(B => B.wx[1])) - 2,
        need = G.reduce((a, B) => a + B.W, 0) + GAP * (G.length - 1);
      if (need > hi - lo) {
        for (const B of G) B.items = B.turn;
        continue;
      }
      // 1D layout: stacks merge while they overlap; a stack lands at the mean of the desired places, then within the wall bounds
      let cl = G.map(B => ({bs: [B]}));
      const place = c => {
        let off = 0;
        const ls = c.bs.map(B => {
          const l = B.flat[0].X - B.W / 2 - off;
          off += B.W + GAP;
          return l;
        });
        c.W = off - GAP;
        c.l = Math.max(lo, Math.min(hi - c.W, ls.reduce((a, b) => a + b, 0) / ls.length));
      };
      cl.forEach(place);
      for (let i = 0; i + 1 < cl.length;) {
        if (cl[i].l + cl[i].W + GAP > cl[i + 1].l) {
          cl[i].bs.push(...cl[i + 1].bs);
          cl.splice(i + 1, 1);
          place(cl[i]);
          if (i) i--;
        } else i++;
      }
      for (const c of cl) {
        let x = c.l;
        for (const B of c.bs) {
          B.o[0] = x + B.W / 2 - B.flat[0].X;
          x += B.W + GAP;
        }
      }
    }
    separatePlates(blocks);
    for (const B of blocks)
      for (const it of B.items) plateAt(g, it.sp, it.X + B.o[0], it.Y + B.o[1], it.ang, it.L);
    if (fl) {
      const mine = spots.filter(sp => fl.has(sp.id)).sort((x, y) => y.y - x.y),
        j = Math.max(
          0,
          mine.findIndex(sp => sp.id === drag.S.id),
        );
      if (mine.length) {
        const w = drag.wall,
          sp0 = mine[j];
        if (w) {
          const hw = sp0.w / 2,
            a = [w.q[0] - w.u[0] * hw, w.q[1] - w.u[1] * hw],
            b = [w.q[0] + w.u[0] * hw, w.q[1] + w.u[1] * hw]; // where it will land
          g.strokeStyle = pal.acc;
          g.lineWidth = 3;
          g.setLineDash([5, 4]);
          g.beginPath();
          g.moveTo(...v().S(a));
          g.lineTo(...v().S(b));
          g.stroke();
          g.setLineDash([]);
        }
        g.globalAlpha = 0.92;
        column(g, mine, drag.cur[0] - drag.grab[0], drag.cur[1] - drag.grab[1] - j * (PH + VG), [0, PH + VG]);
        g.globalAlpha = 1;
      }
    }
  };
  const inPlate = (h, x, y) => {
    const dx = x - h.X,
      dy = y - h.Y,
      c = Math.cos(h.ang),
      s = Math.sin(h.ang);
    return Math.abs(dx * c + dy * s) <= h.hw && Math.abs(-dx * s + dy * c) <= h.hh;
  };
  const hitAt = e =>
    hits.find(h =>
      h.seg
        ? segDist([e.offsetX, e.offsetY], [h.seg[0], h.seg[1]], [h.seg[2], h.seg[3]])[0] < 7
        : inPlate(h, e.offsetX, e.offsetY),
    );
  m.down = (e, p) => {
    const h = hitAt(e),
      S = h && find(h.id);
    if (!S) return false;
    const was = sel().sensor;
    sel().sensor = S.id;
    drag = {
      S,
      start: [e.offsetX, e.offsetY],
      orig: {room: S.room, at: S.at, under: S.under},
      stacked: false,
      grab: h.seg ? [0, 0] : [e.offsetX - h.X, e.offsetY - h.Y],
    };
    ed.drag = drag;
    if (was !== S.id) m.refresh();
    ed.draw();
    return true;
  };
  // One is moved — the others do not shift: the room's sensors that stand automatically (in a row, without at) are pinned where they are now
  // (at — the point of their place on the wall). Otherwise the row without the moved one would rebuild and land anew.
  const S0 = d => d.S;
  function pin(roomId) {
    let ch = false;
    for (const x of plan().sensors) {
      if (x === drag?.S || x.room !== roomId || x.at || x.under) continue;
      const sp = (ed.spots || []).find(q => q.id === x.id);
      if (!sp) continue;
      x.at = [+(sp.c[0] - sp.n[0] * WALL.inner).toFixed(3), +(sp.c[1] - sp.n[1] * WALL.inner).toFixed(3)];
      if (sp.scale < 0.999) x.sc = +sp.scale.toFixed(3);
      ch = true;
    }
    if (ch) ed.update();
  }
  const restore = (S, o) => {
    S.room = o.room;
    if (o.at) S.at = o.at;
    else delete S.at;
    if (o.under) S.under = o.under;
    else delete S.under;
  };
  m.move = (e, p) => {
    if (!drag) {
      v().cv.style.cursor = hitAt(e) ? 'move' : 'grab';
      return;
    }
    if (!drag.moved && Math.hypot(e.offsetX - drag.start[0], e.offsetY - drag.start[1]) < 3) return;
    if (!drag.moved) {
      ed.showCtx(null);
      pin(S0(drag).room);
    } // while dragging there is no panel; the room neighbours are pinned where they stand
    drag.moved = true;
    const S = drag.S,
      X = e.offsetX,
      Y = e.offsetY;
    drag.cur = [X, Y];
    drag.wall = wallAt(p);
    // it stands below another one — until the pointer moves 36 px away from where it landed; moved away — floats again, the data as before the drag
    if (drag.stacked) {
      if (Math.hypot(X - drag.stackAt[0], Y - drag.stackAt[1]) < 36) return;
      drag.skip = S.under;
      drag.stacked = false;
      restore(S, drag.orig);
      ed.update();
    } else ed.draw();
    const me = rectOf(S.id),
      sub = below(S);
    if (!me) return;
    if (drag.skip) {
      const k = rectOf(drag.skip);
      if (!k || !overlap(me, k)) drag.skip = null;
    } // just detached — it does not stick to the same one until they separate
    const tg = hits.find(h => !h.seg && h.id !== drag.skip && !sub.has(h.id) && overlap(me, h)),
      T = tg && find(tg.id);
    if (T) {
      pin(T.room);
      S.under = T.id;
      S.room = T.room;
      delete S.at;
      delete S.sc;
      drag.stacked = true;
      drag.stackAt = [X, Y];
      ed.update();
    }
  };
  m.dragCursor = () => 'move';
  m.cancelDrag = () => {
    drag = null;
  };
  m.up = () => {
    if (!drag) return;
    const d = drag;
    if (d.moved) lastMoved = d.S.id;
    if (d.moved && !d.stacked && d.wall) {
      pin(d.wall.room.id);
      d.S.room = d.wall.room.id;
      d.S.at = d.wall.q;
      delete d.S.under;
      delete d.S.sc;
      // Save the free place found with neighbours' priority, not the occupied point under the pointer.
      // After release and reload the sensor order can no longer push a neighbour out.
      const sp = ed.sensorSpots().find(s => s.id === d.S.id);
      if (sp) {
        d.S.at = [sp.c[0] - sp.n[0] * WALL.inner, sp.c[1] - sp.n[1] * WALL.inner];
        if (sp.scale < 0.999) d.S.sc = sp.scale;
      }
    }
    drag = null;
    ed.drag = null;
    if (d.moved) ed.commit();
    else {
      m.refresh();
      ed.draw();
    }
  };
  const rectOf = id => hits.find(h => !h.seg && h.id === id);
  const overlap = (a, b) =>
    Math.min(a.X1, b.X1) - Math.max(a.X0, b.X0) > Math.min(a.X1 - a.X0, b.X1 - b.X0) * 0.4 &&
    Math.min(a.Y1, b.Y1) - Math.max(a.Y0, b.Y0) > Math.min(a.Y1 - a.Y0, b.Y1 - b.Y0) * 0.4;
  function below(S) {
    const out = new Set([S.id]);
    let grow = true;
    while (grow) {
      grow = false;
      for (const x of plan().sensors)
        if (x.under && out.has(x.under) && !out.has(x.id)) {
          out.add(x.id);
          grow = true;
        }
    }
    return out;
  }
  m.deselect = () => {
    if (sel().sensor) {
      sel().sensor = null;
      m.refresh();
    } else if (askFor) {
      askFor = null;
      m.refresh();
    }
  };
  m.key = e => {
    const S = find(sel().sensor);
    if (!S) return;
    if (e.key === 'Delete' || e.key === 'Backspace') remove(S);
  };
  m.anchor = () => {
    const sp = (ed.spots || []).find(x => x.id === sel().sensor);
    if (!sp) {
      if (!asking()) return null;
      const ps = plan().rooms.flatMap(r => r.polygon),
        xs = ps.map(q => q[0]),
        ys = ps.map(q => q[1]);
      return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    }
    // the panel is above the sensor's whole room: it does not cover its badges (they are dragged onto neighbours)
    const P = plan().rooms.find(r => r.id === sp.room)?.polygon || [sp.c],
      xs = P.map(q => q[0]),
      ys = P.map(q => q[1]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  };
  m.status = () => '';
  m.hits = () => hits; // for tests
  m.reset = () => {
    drag = null;
    placing = null;
    stepKey = null;
    askFor = null;
  };
  m.leave = () => {
    askFor = null;
  };

  // ---------- panel above the selection ----------
  function askLines(s) {
    const ks = kin(s),
      lines = [
        el(
          `<div class="line"><b>${esc(s.name)}</b><small>${esc([s, ...ks].map(val).join(' · '))}</small></div>`,
        ),
      ];
    lines.push(
      el(
        `<div class="line sub"><small>${t('Sensor has no room. Which room is it in?')}${!s.area && ed.ha.setArea ? ' ' + t("We'll save the area to Home Assistant too.") : ''}</small></div>`,
      ),
    );
    const row = el(`<div class="line names"></div>`);
    for (const r of plan().rooms) {
      if (r.solid) continue;
      const b = el(`<button class="chip">${esc(r.name)}</button>`);
      b.onclick = () => put(s, r, null, ks);
      row.append(b);
    }
    lines.push(row);
    const foot = el(
        `<div class="line foot"><span class="hint">${t('Not in your home, or not needed on a wall?')}</span></div>`,
      ),
      no = el(`<button class="soft">${t("Don't show")}</button>`);
    no.onclick = () => {
      plan().sensorSkip.push(s.entity, ...ks.map(x => x.entity));
      askFor = null;
      ed.commit();
    };
    foot.append(no);
    lines.push(foot);
    return lines;
  }
  // The sensor panel is one row: name and number, number size (− 150% +, each has its own), “Auto position”, remove; below — label and number color.
  function ctxPanel() {
    const S = find(sel().sensor),
      s = info(S);
    if (!S || !s) {
      const a = asking();
      ed.showCtx(a ? askLines(a) : null);
      return;
    }
    const mt = metricOf(s),
      line = el(`<div class="line"><b>${esc(s.name)}</b><small>${esc(val(s))}</small></div>`);
    const k = S.k || 1,
      i = SIZES.indexOf(k),
      setK = x => {
        if (x === 1) delete S.k;
        else S.k = x;
        ed.commit();
      };
    const step = el(
        `<span class="step" title="${t('Number size')}"><button title="${t('Smaller')}" ${i <= 0 ? 'disabled' : ''}>−</button><small>${Math.round(k * 100)}%</small><button title="${t('Larger')}" ${i >= SIZES.length - 1 ? 'disabled' : ''}>+</button></span>`,
      ),
      [dn, up] = step.querySelectorAll('button');
    dn.onclick = () => setK(SIZES[Math.max(0, i - 1)]);
    up.onclick = () => setK(SIZES[Math.min(SIZES.length - 1, i + 1)]);
    line.append(el('<span class="sep"></span>'), step);
    if (S.at) {
      const b = el(
        `<button class="ib" title="${t("Auto position, next to the room's other sensors")}">${icon('undo', 15)}</button>`,
      );
      b.onclick = () => {
        delete S.at;
        delete S.sc;
        const r = roomOfArea(plan(), s.area);
        if (r) S.room = r.id;
        ed.commit();
      };
      line.append(b);
    }
    const del = el(
      `<button class="ib bad" title="${t('Remove from wall (Delete)')}">${icon('trash', 15)}</button>`,
    );
    del.onclick = () => remove(S);
    line.append(del);
    const nm = el(
      `<input class="nm" value="${esc(S.label || '')}" placeholder="${esc((mt.label || s.name).toUpperCase())}" title="${t('Label above the number')}">`,
    );
    nm.onkeydown = e => {
      e.stopPropagation();
      if (e.key === 'Enter') nm.blur();
    };
    nm.onchange = () => {
      const t = nm.value.trim();
      if (t) S.label = t;
      else delete S.label;
      ed.commit();
    };
    const line2 = el(`<div class="line"><small>${t('Label')}</small></div>`);
    line2.append(nm);
    // number color: “Match the wall” (automatic), presets, custom
    const setC = c => {
        if (c) S.c = c;
        else delete S.c;
        ed.commit();
      },
      own = !!S.c && !INKS.includes(S.c);
    const ink = el(
      `<span class="ink" title="${t('Number color. Alert values stay yellow and red')}"></span>`,
    );
    const au = el(`<button class="sw auto ${S.c ? '' : 'on'}" title="${t('Match the wall')}"></button>`);
    au.onclick = () => setC(null);
    ink.append(au);
    for (const h of INKS) {
      const b = el(`<button class="sw ${S.c === h ? 'on' : ''}" style="background:${h}"></button>`);
      b.onclick = () => setC(h);
      ink.append(b);
    }
    const pk = el(
      `<label class="sw own ${own ? 'on' : ''}" title="${t('Custom color')}"${own ? ` style="background:${S.c}"` : ''}><input type="color" value="${S.c || INKS[2]}"></label>`,
    );
    pk.querySelector('input').onchange = e => setC(e.target.value);
    ink.append(pk);
    line2.append(el('<span class="sep"></span>'), ink);
    ed.showCtx([line, line2]);
  }

  // ---------- top row and list ----------
  m.refresh = () => {
    if (ed.mode !== m) return;
    const tools = $('tools');
    tools.innerHTML = '';
    tools.appendChild(ed.selectButton());
    const C = ctx(),
      list = C.sensors.filter(s => !s.cat && !s.hidden && (all || isClimate(s)));
    if (!plan().sensors.length) {
      const rec = recommend(plan(), C);
      if (rec.length) {
        const b = el(
          `<button class="primary" title="${t('Temperature, humidity and CO₂ in every room with sensors')}">${icon('sparkles', 15)}${t('Show recommended')}</button>`,
        );
        b.onclick = () => {
          ed.versions.mark('before', 'sensors');
          for (const x of rec) plan().sensors.push({id: newId(), ...x});
          ed.commit();
        };
        tools.appendChild(b);
      }
    }
    const side = $('side-body');
    side.innerHTML = '';
    ed.sideHead(t('Sensors'), plan().sensors.length ? t('{0} on walls', plan().sensors.length) : '');
    if (!C.sensors.length) {
      side.appendChild(el(`<p class="empty">${t('No numeric sensors in Home Assistant.')}</p>`));
      stepBanner();
      ctxPanel();
      return;
    }
    for (const ar of ed.sortAreas(new Set(list.map(s => s.area || '')))) {
      const ss = list
          .filter(s => (s.area || '') === ar)
          .sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name)),
        on = ss.filter(s => shown(s.entity)).length;
      const room = roomOfArea(plan(), ar),
        body = section(side, 'sens:' + ar, ar ? ed.areaName(ar) : t('No area'), {
          count: `${on}/${ss.length}`,
          open: !!room || !ar,
        });
      if (!room)
        body.appendChild(
          el(
            `<p class="empty">${ar ? t("This area isn't on the plan — click a sensor, then a wall.") : t('Click a sensor, then a wall.')}</p>`,
          ),
        );
      for (const s of ss) {
        const S = shown(s.entity),
          why = isClimate(s) ? whyNot(s) : '';
        const row = el(
          `<div class="row sensor ${S ? 'on' : ''} ${S && S.id === sel().sensor ? 'sel' : ''} ${asking() === s ? 'sel' : ''}" title="${S ? t('On a wall · click to remove') : t('Click to show on a wall')}${why ? ' · ' + why : ''}"><span class="ck">${S ? icon('check', 13) : ''}</span><span class="name">${esc(s.name)}</span><small>${esc(val(s))}</small></div>`,
        );
        row.onclick = () => toggle(s);
        body.appendChild(row);
      }
    }
    const rest = C.sensors.filter(s => !s.cat && !s.hidden && !isClimate(s)).length;
    if (rest || all) {
      const b = el(
        `<button class="soft more-sens">${all ? t('Climate only') : t('All sensors · {0} more', rest)}</button>`,
      );
      b.onclick = () => {
        all = !all;
        m.refresh();
      };
      side.appendChild(b);
    }
    stepBanner();
    ctxPanel();
  };

  // ---------- wizard step ----------
  const wizOn = () => !!ed.wizard?.get(plan().id)?.sens;
  m.wizardOn = wizOn;
  m.needView = () => wizOn() && !plan().view && !ed.wizard.get(plan().id)?.viewSkip; // the step asks to pick the 3D view first
  // First — the home 3D view (D-035): labels land on the walls visible from it; this is how the home will be seen on the card.
  // In the wizard step — as the first tile (“Skip” — straight to the sensors); outside the step — once per project, if there is no view.
  const UNDER = `<small>${t('Wall readings will be placed for this view.')}</small>`,
    viewTip = () => ed.viewTip().full + UNDER;
  const VIEW_AIM = ed.aim.el('pane-3d'); // the view hint is at the 3D window (3D full screen — at the bottom)
  function stepBanner() {
    if (!wizOn()) {
      if (stepKey) {
        stepKey = null;
        if (ed.stepNow()?.mode === m) ed.step(null);
      }
      const key = 'viewAsk:' + plan().id;
      if (!plan().view && plan().sensors.length && ed.hints && ed.hints.count(key) < 1 && !ed.stepNow())
        ed.banner(
          viewTip(),
          [
            [
              t('Later'),
              () => {
                ed.hints.done(key, 1);
                ed.banner();
              },
            ],
            [
              t('Save view'),
              () => {
                ed.hints.done(key, 1);
                ed.saveView();
              },
              true,
            ],
          ],
          VIEW_AIM,
        );
      return;
    }
    const w = ed.wizard.get(plan().id),
      needView = !plan().view && !w?.viewSkip,
      key = needView ? 'view' : 'on:' + plan().sensors.length;
    if (stepKey === key && ed.stepNow()?.mode === m) return;
    stepKey = key;
    if (needView) {
      const tip = ed.viewTip();
      ed.step(
        tip.full + UNDER,
        [
          [
            t('For later'),
            () => {
              ed.wizard.set(plan().id, {...w, viewSkip: true});
              m.refresh();
            },
          ],
          [t('Save view'), () => ed.saveView({quiet: true}), true],
        ],
        VIEW_AIM,
        {id: 'sensors-view', short: tip.short},
      );
    } else
      ed.step(
        `${t('Readings on walls: remove extras, add what you need, drag numbers along walls.')}<small>${t("When you're done, click “Done”.")}</small>`,
        [
          [
            t('Done'),
            () => {
              ed.wizard.set(plan().id, null);
              stepKey = null;
              ed.step(null);
              m.refresh();
              ed.path.after('sensors');
            },
            true,
          ],
        ],
        null,
        {id: 'sensors', short: t('Readings on walls: {0}. Keep the ones you need.', plan().sensors.length)},
      );
  }
  // The “Sensors on walls” item in “Finishing touches” (D-039): the walls are empty — the recommended ones right away, then the wizard step.
  m.available = () =>
    plan().sensors.length > 0 || recommend(plan(), ctx()).length > 0 || orphans(plan(), ctx()).length > 0;
  m.begin = () => {
    if (!plan().sensors.length)
      for (const x of recommend(plan(), ctx())) plan().sensors.push({id: newId(), ...x});
    ed.wizard.set(plan().id, {sens: true});
    stepKey = null;
    ed.setMode('sensors');
    ed.commit();
    ed.view.focus?.(null);
  };
  return m;
}
