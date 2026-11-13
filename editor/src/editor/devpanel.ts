// Test panel — localhost only. A snapshot is the plan plus the plan photo (underlay); each wizard step has its own snapshot.
// “Save” puts the current state into the current step's snapshot (after a reload the step is guessed from the plan:
// lamps on the plan — “Lights”, HA links — “HA areas”, windows or doors — “Windows & doors”, rooms — “Split”).
// The list shows saved snapshots only. “→ Step” opens that step's own snapshot.
// After restoring, the project is like a new one (its own id):
// hints like “Shaft or column?” show again. Stored in the browser (IndexedDB), never sent anywhere.
// The trash button is always visible to the right of each snapshot; it deletes on the second click.
import {idb} from './underlay.ts';
import {el, esc} from './ui.ts';
import {icon} from './icons.ts';
import {emptyPlan} from '../core/plan.ts';
import type {Plan, Point} from '../core/types.ts';
import type {Editor, EditorFlows} from './editor-types.ts';

/** The steps that have a snapshot. */
type SnapshotStep = 'rect' | 'split' | 'open' | 'names' | 'furniture' | 'lights';

/** When each step's snapshot was saved, ms; legacy: the old single snapshot ('snap') stands for "Split". */
interface SnapshotIndex extends Partial<Record<SnapshotStep, number>> {
  legacy?: boolean;
}

/** A snapshot: the plan and the plan photo with its placement. */
interface DevSnapshot {
  plan: Plan;
  underlay: {src: string; a: Point | null; b: Point | null; opacity: number; visible: boolean} | null;
}

const STEPS: Array<[SnapshotStep, string]> = [
  ['rect', 'Rectangle'],
  ['split', 'Split'],
  ['open', 'Windows & doors'],
  ['names', 'HA areas'],
  ['furniture', 'Furniture'],
  ['lights', 'Lights'],
];
const KEY = 'home-twin-editor:dev';
const nameOf = (k: SnapshotStep): string => STEPS.find(s => s[0] === k)?.[1] || k;
export function devPanel(ed: Editor, flows: Pick<EditorFlows, 'hideStart'>): void {
  if (!['localhost', '127.0.0.1'].includes(location.hostname)) return;
  const box = el(`<div class="dev glass"><b>Test</b></div>`);
  const save = el(`<button class="soft">Save</button>`);
  box.append(save);
  document.body.append(box);
  // the previous panel version stored a single snapshot ('snap', time as a number) — treat it as the “Split” snapshot
  const index = (): SnapshotIndex => {
    const v = localStorage.getItem(KEY);
    if (!v) return {};
    if (/^\d+$/.test(v)) return {split: +v, legacy: true};
    try {
      // This panel writes it (localhost only); it is not checked.
      return JSON.parse(v) as SnapshotIndex;
    } catch {
      return {};
    }
  };
  const time = (t: number): string =>
    new Date(t).toLocaleString('en', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'});
  const phase = (): SnapshotStep => {
    if (ed.modes.lights.wizardOn?.()) return 'lights';
    if (ed.modes.furniture.wizardOn?.()) return 'furniture';
    const w = ed.modes.rooms.wizardPhase?.();
    if (w) return w;
    const p = ed.plan;
    return p.lights.some(l => l.placed)
      ? 'lights'
      : p.rooms.some(r => r.area)
        ? 'names'
        : p.openings.length
          ? 'open'
          : p.rooms.length
            ? 'split'
            : 'rect';
  };
  const keyOf = (s: SnapshotStep, ix = index()): string =>
    s === 'split' && ix.legacy ? 'snap' : 'snap:' + s;
  function render(): void {
    const ix = index();
    const ph = phase();
    save.textContent = `Save: ${nameOf(ph)}`;
    save.title = `Save the plan and photo as the “${nameOf(ph)}” step snapshot`;
    box.style.width = '';
    box.querySelectorAll('[data-step]').forEach(b => b.remove());
    for (const [k, name] of STEPS) {
      const savedAt = ix[k];
      if (!savedAt) continue;
      const row = el(`<div class="row" data-step="${k}"></div>`);
      const b = el(
        `<button class="soft go" title="“${esc(nameOf(k))}” snapshot from ${esc(time(savedAt))}">→ ${name}</button>`,
      );
      b.onclick = () => restore(k);
      row.append(b);
      // a step's own snapshot can be deleted: the first click shows “Delete?”, the second deletes; moving the mouse away cancels
      {
        const d = el(
          `<button class="soft del" title="Delete the “${esc(name)}” snapshot">${icon('trash', 13)}</button>`,
        );
        d.onclick = async () => {
          if (!row.classList.contains('sure')) {
            box.style.width = box.offsetWidth + 'px';
            row.classList.add('sure');
            b.textContent = 'Delete?';
            return;
          }
          await drop(k);
        };
        row.onmouseleave = () => {
          if (row.classList.contains('sure')) render();
        };
        row.append(d);
      }
      box.append(row);
    }
  }
  async function drop(k: SnapshotStep): Promise<void> {
    let ix = index();
    await idb('del', keyOf(k, ix)).catch(() => {});
    if (k === 'split' && ix.legacy) ix = {};
    else delete ix[k];
    Object.keys(ix).length ? localStorage.setItem(KEY, JSON.stringify(ix)) : localStorage.removeItem(KEY);
    render();
  }
  box.addEventListener('pointerenter', render);
  // the step changes on the fly — the “Save: …” label updates once a second (except while showing “Saved”)
  let busy = false;
  setInterval(() => {
    if (busy) return;
    const ph = phase();
    save.textContent = `Save: ${nameOf(ph)}`;
    save.title = `Save the plan and photo as the “${nameOf(ph)}” step snapshot`;
  }, 1000);
  save.onclick = async () => {
    const u = ed.underlay;
    const ph = phase();
    const snap: DevSnapshot = {
      plan: structuredClone(ed.plan),
      underlay:
        u.ready && u.src ? {src: u.src, a: u.a, b: u.b, opacity: u.opacity, visible: u.visible} : null,
    };
    let ix = index();
    if (ix.legacy) {
      const old = await idb('get', 'snap').catch(() => null);
      if (old) await idb('put', 'snap:split', old);
      delete ix.legacy;
    }
    await idb('put', 'snap:' + ph, snap);
    ix = {...ix, [ph]: Date.now()};
    localStorage.setItem(KEY, JSON.stringify(ix));
    render();
    busy = true;
    save.textContent = 'Saved';
    setTimeout(() => {
      busy = false;
      render();
    }, 1200);
  };
  async function restore(step: SnapshotStep): Promise<void> {
    if (!index()[step]) return;
    // This panel wrote it (save above); it is not checked.
    const snap = (await idb('get', keyOf(step)).catch(() => null)) as DevSnapshot | null;
    if (!snap) return;
    flows.hideStart();
    ed.step(null);
    const u = ed.underlay;
    const s = snap.underlay;
    if (s) {
      await u.set(s.src, {
        place: () => {
          u.a = s.a;
          u.b = s.b;
        },
      });
      Object.assign(u, {opacity: s.opacity, visible: s.visible});
      u.save();
    } else await u.clear();
    const plan: Plan = step === 'rect' ? {...emptyPlan(), wall: snap.plan.wall} : structuredClone(snap.plan);
    delete plan.id; // as a new project
    ed.setMain?.('plan');
    ed.setPlan(plan);
    ed.setMode('rooms');
    ed.modes.rooms.wizardAt(step);
    if (step === 'rect' && s) ed.fit?.();
    render();
  }
  render();
}
