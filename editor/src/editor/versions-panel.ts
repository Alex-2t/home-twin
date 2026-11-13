// The “Version history” window (⌂ menu): versions with thumbnails on the left, the selected one large on the right, plus “Restore this version”.
// The first row is “Now”. Restoring is an edit: ⌘Z brings it back, and the current plan itself becomes a “Before restoring a version” version.
// At the bottom — the “Previous plan” from the backup slot (flows.js), if there is one.
import {t, N, locale, clock} from '../i18n/i18n.ts';
import {el, esc, find} from './ui.ts';
import {icon} from './icons.ts';
import {pal, FONT} from './draw.ts';
import {MAND, OPT} from './wizard-path.ts';
import {corners} from '../core/layout.ts';
import type {Plan, Point} from '../core/types.ts';
import type {CanvasPoint, Editor} from './editor-types.ts';
import type {PlanVersion} from './versions.ts';

/** A kept version in the list, with its plan read back. */
type KeptRow = Omit<PlanVersion, 'plan'> & {now?: false; plan: Plan};

/** A row of the list: "Now" (the plan open now), or a kept version. */
type VersionRow = {now: true; plan: Plan} | KeptRow;

const BEFORE: Record<string, string> = {
  autoLights: N('Before auto-placing lights'),
  autoDevices: N('Before auto-placing devices'),
  sensors: N('Before recommended sensors'),
  merge: N('Before merging rooms'),
  removeRoom: N('Before deleting a room'),
  rotate: N('Before rotating the plan'),
  file: N('Before opening a file'),
  restore: N('Before restoring a version'),
};
const STEP: Record<string, string> = Object.fromEntries([...MAND, ...OPT].map(s => [s[0], s[1]]));
export const versionLabel = (v: Pick<PlanVersion, 'kind' | 'what'>): string => {
  // A step's and a "before" version always say what they were kept for.
  const what = v.what as string;
  return v.kind === 'step'
    ? t('Step “{0}”', t(STEP[what] || what))
    : v.kind === 'before'
      ? t(BEFORE[what] || what)
      : t('Autosave');
};

// when: today — the time, yesterday — “Yesterday, 18:40”, earlier — date and time
function when(at: number): string {
  const d = new Date(at);
  const now = new Date();
  const tm = clock(d);
  const day = (x: Date): number => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const k = Math.round((day(now) - day(d)) / 864e5);
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
const summary = (p: Plan): string =>
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
export function drawPlan(cv: HTMLCanvasElement, p: Plan, {names = false}: {names?: boolean} = {}): void {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = cv.clientWidth || cv.width;
  const h = cv.clientHeight || cv.height;
  cv.width = Math.round(w * dpr);
  cv.height = Math.round(h * dpr);
  // These canvases get no other kind of context, so a 2D one is always there.
  const ctx = cv.getContext('2d') as CanvasRenderingContext2D;
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
  const xs = pts.map(q => q[0]);
  const ys = pts.map(q => q[1]);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  const pad = names ? 14 : 5;
  const k = Math.min((w - 2 * pad) / (x1 - x0 || 1), (h - 2 * pad) / (y1 - y0 || 1));
  const ox = (w - (x1 - x0) * k) / 2;
  const oy = (h - (y1 - y0) * k) / 2;
  const S = ([x, y]: Point): CanvasPoint => [ox + (x - x0) * k, h - oy - (y - y0) * k];
  const path = (poly: Point[]): void => {
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
    let cs: Point[];
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
      const c = r.polygon.reduce<Point>(
        (s, q) => [s[0] + q[0] / r.polygon.length, s[1] + q[1] / r.polygon.length],
        [0, 0],
      );
      const [X, Y] = S(c);
      const sx = r.polygon.map(q => S(q)[0]);
      if (ctx.measureText(r.name).width > Math.max(...sx) - Math.min(...sx) - 8) continue;
      ctx.fillText(r.name, X, Y + 4);
    }
  }
}

export function openVersions(ed: Editor): {close(): void} {
  const V = ed.versions;
  let sel = 0;
  let box: HTMLElement | null = null;
  const rows = (): VersionRow[] => [
    {now: true, plan: ed.plan},
    // the plan as this editor kept it
    ...V.list().map(v => ({...v, plan: JSON.parse(v.plan) as Plan})),
  ];
  const close = (): void => {
    box?.remove();
    box = null;
    removeEventListener('keydown', key, true);
  };
  const key = (e: KeyboardEvent): void => {
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
  function pick(i: number, focus = false): void {
    sel = i;
    const R = rows();
    const r = R[i];
    // pick runs only while the window is open
    const dialog = box!;
    dialog.querySelectorAll<HTMLElement>('.ver-row').forEach((b, j) => {
      b.classList.toggle('on', j === i);
      b.setAttribute('aria-selected', String(j === i));
      if (j === i && focus) b.focus();
    });
    find(dialog, '.ver-view b').textContent = r.now ? t('Now') : versionLabel(r);
    find(dialog, '.ver-view small').textContent = [r.now ? null : when(r.at), summary(r.plan)]
      .filter(Boolean)
      .join(' · ');
    const go = find<HTMLButtonElement>(dialog, '[data-act=restore]');
    go.disabled = !!r.now;
    go.title = r.now ? t('This is the current plan') : '';
    drawPlan(find<HTMLCanvasElement>(dialog, '.ver-big'), r.plan, {names: true});
  }
  async function render(): Promise<void> {
    await V.ready();
    if (!box) return;
    const R = rows();
    const list = find(box, '.ver-list');
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
    list.querySelectorAll<HTMLElement>('.ver-row').forEach((b, i) => {
      drawPlan(find<HTMLCanvasElement>(b, 'canvas'), R[i].plan);
      b.onclick = () => pick(i);
      b.ondblclick = () => {
        const row = R[i];
        if (!row.now) restore(row);
      };
    });
    const prev = find(box, '.ver-prev');
    prev.hidden = !ed.flows?.hasPrev?.();
    pick(Math.min(sel, R.length - 1));
  }
  async function restore(r: KeptRow): Promise<void> {
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
    // a click inside the window: its target is an element
    if (e.target === box || (e.target as Element).closest('[data-close]')) close();
  };
  find(box, '[data-act=restore]').onclick = () => {
    const r = rows()[sel];
    if (r && !r.now) restore(r);
  };
  find(box, '[data-act=prev]').onclick = () => {
    close();
    ed.flows?.swapPrev?.();
  };
  document.body.append(box);
  addEventListener('keydown', key, true);
  render();
  return {close};
}
