// “How to rotate” demo (D-035, the owner 2026-11-07): while a step asks to pick a view, a cursor moves over the 3D window, “grabs”
// the model and drags it to the right — the model rotates with it — and back to the same view. Repeats every 3.6 s until the user
// takes hold of the model. The camera returns exactly: rotation via view.spin, the offset is computed here (off).
// Pressing the window pauses the demo, the model stays put; releasing without rotating (a click swaps the windows) — again after 1.5 s.
//   run(on) — show or not (app.js decides: view step, model not yet rotated, 3D window visible, no “reduced motion”)
import type {SceneView} from '../core/scene.ts';

const A = 0.45;
const CYCLE = 3600;
const START = 600;
const ease = (u: number): number => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);

/** The demo: run(on) shows it or stops it (a truthy value shows it). */
export interface ViewDemo {
  run(v: unknown): void;
}

export function createViewDemo(pane: HTMLElement, view: Partial<Pick<SceneView, 'spin'>>): ViewDemo {
  const el = document.createElement('div');
  el.className = 'drag-demo';
  el.hidden = true;
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML =
    '<i class="dd-ring"></i><svg viewBox="0 0 24 24" width="24" height="24"><path d="M4 2v17l4.4-4.1 3 6.6 2.6-1.2-3-6.5H17z"/></svg>';
  pane.appendChild(el);
  let on = false;
  let raf = 0;
  let t0 = 0;
  let held = false;
  let off = 0;
  const setOff = (v: number): void => {
    if (Math.abs(v - off) < 1e-6) return;
    if (view.spin?.(v - off)) off = v;
  };
  function frame(now: number): void {
    raf = requestAnimationFrame(frame);
    if (held || now < t0) {
      el.style.opacity = '0';
      setOff(0);
      return;
    }
    const t = (now - t0) % CYCLE;
    const w = pane.clientWidth;
    const h = pane.clientHeight;
    const dx = Math.min(110, w * 0.28);
    // u — fraction of the way to the right (0…1): appear, grab, drag, hold, return, release, pause
    let u = 0;
    let a = 1;
    let press = true;
    if (t < 300) {
      a = t / 300;
      press = false;
    } else if (t < 450) u = 0;
    else if (t < 1550) u = ease((t - 450) / 1100);
    else if (t < 1750) u = 1;
    else if (t < 2850) u = 1 - ease((t - 1750) / 1100);
    else {
      press = false;
      a = t < 3050 ? 1 - (t - 2850) / 200 : 0;
    }
    el.style.opacity = String(a);
    el.style.transform = `translate(${Math.round(w / 2 - dx / 2 + dx * u)}px,${Math.round(h * 0.56)}px)`;
    el.classList.toggle('press', press);
    setOff(-A * u);
  } // rightwards — as in OrbitControls: the camera orbits left, the model turns right
  const down = (e: PointerEvent): void => {
    // A press inside the pane: its target is an element.
    if (!on || (e.target as Element).closest('button,.pip-grip')) return;
    held = true;
    setOff(0);
  };
  const up = (): void => {
    if (!held) return;
    held = false;
    t0 = performance.now() + 1500;
  };
  pane.addEventListener('pointerdown', down, true);
  addEventListener('pointerup', up, true);
  addEventListener('pointercancel', up, true);
  return {
    run(v) {
      const show = !!v;
      if (show === on) return;
      on = show;
      held = false;
      if (show) {
        t0 = performance.now() + START;
        el.hidden = false;
        el.style.opacity = '0';
        raf = requestAnimationFrame(frame);
      } else {
        cancelAnimationFrame(raf);
        raf = 0;
        setOff(0);
        off = 0;
        el.hidden = true;
      }
    },
  };
}
