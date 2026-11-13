// @ts-nocheck
// The “Version history” window (⌂ menu): versions with thumbnails on the left, the selected one large on the right, plus “Restore this version”.
// The first row is “Now”. Restoring is an edit: ⌘Z brings it back, and the current plan itself becomes a “Before restoring a version” version.
// At the bottom — the “Previous plan” from the backup slot (flows.js), if there is one.
import {t, N, locale, clock} from '../i18n/i18n.ts';
import {el, esc} from './ui.ts';
import {icon} from './icons.ts';
import {pal, FONT} from './draw.ts';
import {MAND, OPT} from './wizard-path.ts';
import {corners} from '../core/layout.ts';

const BEFORE = {
  autoLights: N('Before auto-placing lights'),
  autoDevices: N('Before auto-placing devices'),
  sensors: N('Before recommended sensors'),
  merge: N('Before merging rooms'),
  removeRoom: N('Before deleting a room'),
  rotate: N('Before rotating the plan'),
  file: N('Before opening a file'),
  restore: N('Before restoring a version'),
};
const STEP = Object.fromEntries([...MAND, ...OPT].map(s => [s[0], s[1]]));
export const versionLabel = v =>
  v.kind === 'step'
    ? t('Step “{0}”', t(STEP[v.what] || v.what))
    : v.kind === 'before'
      ? t(BEFORE[v.what] || v.what)
      : t('Autosave');

// when: today — the time, yesterday — “Yesterday, 18:40”, earlier — date and time
function when(at) {
  const d = new Date(at),
    now = new Date(),
    tm = clock(d);
  const day = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime(),
    k = Math.round((day(now) - day(d)) / 864e5);
  if (k === 0) return tm;
  if (k === 1) return t('Yesterday, {0}', tm);
  return (
    new Intl.DateTimeFormat(locale(), {
      day: 'numeric',
      month: 'short',
      ...(d.getFullYear() !== now.getFullYear() ? {year: 'numeric'} : {}),
    }).format(d) +
    ', ' +
    tm
  );
}
const summary = p =>
  [
    t('{0, plural, one {# room} other {# rooms}}', p.rooms.filter(r => !r.solid).length),
    p.furniture?.length ? t('{0, plural, one {# item} other {# items}}', p.furniture.length) : null,
    p.lights?.some(l => l.placed)
      ? t('{0, plural, one {# light} other {# lights}}', p.lights.filter(l => l.placed).length)
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

// Plan to picture: rooms, furniture, lamps; at large size also room names. Colours come from the theme (draw.js).
export function drawPlan(cv, p, {names = false} = {}) {
  const dpr = Math.min(devicePixelRatio || 1, 2),
    w = cv.clientWidth || cv.width,
    h = cv.clientHeight || cv.height;
  cv.width = Math.round(w * dpr);
  cv.height = Math.round(h * dpr);
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const pts = p.rooms.flatMap(r => r.polygon);
  if (!pts.length) {
    ctx.fillStyle = pal.label2;
    ctx.font = `500 11px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(t('Empty'), w / 2, h / 2 + 4);
    return;
  }
  const xs = pts.map(q => q[0]),
    ys = pts.map(q => q[1]),
    x0 = Math.min(...xs),
    x1 = Math.max(...xs),
    y0 = Math.min(...ys),
    y1 = Math.max(...ys),
    pad = names ? 14 : 5;
  const k = Math.min((w - 2 * pad) / (x1 - x0 || 1), (h - 2 * pad) / (y1 - y0 || 1)),
    ox = (w - (x1 - x0) * k) / 2,
    oy = (h - (y1 - y0) * k) / 2,
    S = ([x, y]) => [ox + (x - x0) * k, h - oy - (y - y0) * k];
  const path = poly => {
    ctx.beginPath();
    poly.forEach((q, i) => {
      const [X, Y] = S(q);
      i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
    });
    ctx.closePath();
  };
  for (const r of p.rooms) {
    path(r.polygon);
    ctx.fillStyle = r.solid ? pal.wall : pal.room;
    ctx.fill();
    ctx.strokeStyle = pal.wall;
    ctx.lineWidth = names ? 2 : 1.2;
    ctx.stroke();
  }
  for (const f of p.furniture || []) {
    let cs;
    try {
      cs = corners(f);
    } catch {
      continue;
    }
    if (!cs?.every(q => q.every(Number.isFinite))) continue;
    path(cs);
    ctx.fillStyle = pal.furn;
    ctx.fill();
    ctx.strokeStyle = pal.furn_line;
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }
  for (const L of p.lights || [])
    if (L.placed)
      for (const q of L.points || []) {
        const [X, Y] = S(q);
        ctx.beginPath();
        ctx.arc(X, Y, names ? 3.5 : 2, 0, 7);
        ctx.fillStyle = '#f5b74a';
        ctx.fill();
      }
  if (names) {
    ctx.font = `600 11px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = pal.label;
    // name — if it fits the room's width
    for (const r of p.rooms) {
      if (r.solid || !r.name) continue;
      const c = r.polygon.reduce(
          (s, q) => [s[0] + q[0] / r.polygon.length, s[1] + q[1] / r.polygon.length],
          [0, 0],
        ),
        [X, Y] = S(c),
        sx = r.polygon.map(q => S(q)[0]);
      if (ctx.measureText(r.name).width > Math.max(...sx) - Math.min(...sx) - 8) continue;
      ctx.fillText(r.name, X, Y + 4);
    }
  }
}

export function openVersions(ed) {
  const V = ed.versions;
  let sel = 0,
    box = null;
  const rows = () => [{now: true, plan: ed.plan}, ...V.list().map(v => ({...v, plan: JSON.parse(v.plan)}))];
  const close = () => {
    box?.remove();
    box = null;
    removeEventListener('keydown', key, true);
  };
  const key = e => {
    if (!box) return;
    if (e.key === 'Escape') {
      e.stopPropagation();
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      pick(Math.max(0, Math.min(rows().length - 1, sel + (e.key === 'ArrowDown' ? 1 : -1))), true);
    }
  };
  function pick(i, focus = false) {
    sel = i;
    const R = rows(),
      r = R[i];
    box.querySelectorAll('.ver-row').forEach((b, j) => {
      b.classList.toggle('on', j === i);
      b.setAttribute('aria-selected', String(j === i));
      if (j === i && focus) b.focus();
    });
    box.querySelector('.ver-view b').textContent = r.now ? t('Now') : versionLabel(r);
    box.querySelector('.ver-view small').textContent = [r.now ? null : when(r.at), summary(r.plan)]
      .filter(Boolean)
      .join(' · ');
    const go = box.querySelector('[data-act=restore]');
    go.disabled = !!r.now;
    go.title = r.now ? t('This is the current plan') : '';
    drawPlan(box.querySelector('.ver-big'), r.plan, {names: true});
  }
  async function render() {
    await V.ready();
    if (!box) return;
    const R = rows(),
      list = box.querySelector('.ver-list');
    list.innerHTML =
      R.map(
        (
          r,
          i,
        ) => `<button class="ver-row" role="option" data-i="${i}"><canvas class="ver-thumb"></canvas><span><b>${esc(r.now ? t('Now') : versionLabel(r))}</b>
      <small>${esc(r.now ? summary(r.plan) : when(r.at))}</small></span></button>`,
      ).join('') +
      (R.length < 2
        ? `<p class="ver-empty">${esc(t('No versions yet. They appear on their own: after wizard steps, before big changes and every 10 minutes of work.'))}</p>`
        : '');
    list.querySelectorAll('.ver-row').forEach((b, i) => {
      drawPlan(b.querySelector('canvas'), R[i].plan);
      b.onclick = () => pick(i);
      b.ondblclick = () => {
        if (!R[i].now) restore(R[i]);
      };
    });
    const prev = box.querySelector('.ver-prev');
    prev.hidden = !ed.flows?.hasPrev?.();
    pick(Math.min(sel, R.length - 1));
  }
  async function restore(r) {
    close();
    await ed.versions.mark('before', 'restore');
    ed.applyPlan(r.plan, r.photo);
    ed.banner(t('Version restored.'), [
      [
        t('Undo|revert'),
        () => {
          ed.banner();
          ed.undo();
        },
      ],
      [t('Got it'), () => ed.banner(), true],
    ]);
  }
  box =
    el(`<div class="keys ver" role="dialog" aria-modal="true" aria-label="${esc(t('Version history'))}"><div class="keys-box glass ver-box">
    <div class="keys-head"><b>${esc(t('Version history'))}</b><button class="ib" data-close title="${esc(t('Close'))}">${icon('x')}</button></div>
    <div class="ver-body"><div class="ver-list" role="listbox" aria-label="${esc(t('Versions'))}"></div>
      <div class="ver-view"><canvas class="ver-big"></canvas><div class="ver-meta"><b></b><small></small></div>
        <button class="primary" data-act="restore">${icon('undo', 15)}${esc(t('Restore this version'))}</button></div></div>
    <div class="ver-prev" hidden><span>${esc(t('Previous plan — from before a new plan on the start screen or from a file.'))}</span><button class="soft" data-act="prev">${esc(t('Restore previous plan'))}</button></div>
  </div></div>`);
  box.onclick = e => {
    if (e.target === box || e.target.closest('[data-close]')) close();
  };
  box.querySelector('[data-act=restore]').onclick = () => {
    const r = rows()[sel];
    if (r && !r.now) restore(r);
  };
  box.querySelector('[data-act=prev]').onclick = () => {
    close();
    ed.flows?.swapPrev?.();
  };
  document.body.append(box);
  addEventListener('keydown', key, true);
  render();
  return {close};
}
