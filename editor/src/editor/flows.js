// Start screen, the “upload plan → align → trace” wizard, the “⋯” menu.
import {t, N, num} from '../i18n/i18n.js';
import {emptyPlan, rotatePlan, scalePlan} from '../core/plan.js';
import {$, el, esc} from './ui.js';
import {icon} from './icons.js';
import {pointIn, area, WALL} from '../core/geometry.js';
import {pal, dimLabel} from './draw.js';
import {DRAW_RECT} from './modes/rooms.js';
import {tiltOf, fitPhoto} from './underlay.js';
import {readPlan} from '../core/plan-file.js';
import {idb} from './underlay.js';
import {axisCursor} from './drag-gesture.js';
import {routeHash} from './route.js';

const UPLOAD_WIDTH_M = 12; // until the scale is set, the plan image is assumed to be 12 m wide — a typical apartment
// The start screen's examples (D-062): three designer interiors first, the ten typical homes (demo/homes.mjs, D-030), and “Demo home” — the build's own demo apartment
// when it is not one of them. note — said under the name (houses: only the ground floor is drawn, the editor is single-floor)
const EXAMPLE = {
  demo: {name: N('Demo home'), kind: 'flat'},
  studio: {name: N('Studio'), kind: 'flat'},
  'one-bed': {name: N('One room + kitchen'), kind: 'flat'},
  'euro-two': {name: N('Open kitchen + bedroom'), kind: 'flat'},
  'old-two': {name: N('Two rooms, older block'), kind: 'flat'},
  family: {name: N('Family, three rooms'), kind: 'flat'},
  large: {name: N('Large, two bathrooms'), kind: 'flat'},
  altbau: {name: N('Period apartment'), kind: 'flat'},
  loft: {name: N('Loft'), kind: 'style'},
  minimal: {name: N('Minimalist'), kind: 'style'},
  japandi: {name: N('Japandi'), kind: 'style'},
  townhouse: {name: N('Townhouse'), kind: 'house', note: N('ground floor')},
  bungalow: {name: N('Bungalow'), kind: 'house'},
  house: {name: N('Detached house'), kind: 'house', note: N('ground floor')},
};
const OUTDOOR = /балкон|лодж|террас|сад|balcon|terra|patio|garden|porch/i; // not counted in the example's area
// a small outline of the rooms for an example's card (north up)
function planThumb(plan) {
  const P = plan.rooms.map(r => r.polygon),
    xs = P.flat().map(p => p[0]),
    ys = P.flat().map(p => p[1]),
    x0 = Math.min(...xs),
    y1 = Math.max(...ys);
  const w = Math.max(...xs) - x0,
    h = y1 - Math.min(...ys),
    d = q => 'M' + q.map(([x, y]) => (x - x0).toFixed(2) + ' ' + (y1 - y).toFixed(2)).join('L') + 'Z';
  return `<svg viewBox="-.4 -.4 ${(w + 0.8).toFixed(2)} ${(h + 0.8).toFixed(2)}" aria-hidden="true">${P.map(q => `<path d="${d(q)}"/>`).join('')}</svg>`;
}

// router — the address (route.js, D-066): hashRouter in the standalone editor, haRouter in the HA panel; absent — the address is not used
export function createFlows(ed, {examples = [], example = null, router = null}) {
  const f = {};
  const EX = 'home-twin-editor:example',
    COVER = 'home-twin-editor:loading';
  // an example in the address opens right away (also after the reload for its HA data); until then the plan saved last time is not built
  // in 3D (ed.hold, app.js) — it would only flash before the example
  const r0 = router?.read() || null;
  ed.hold = !!(r0?.ex && r0.ex === example);
  // ---------- loading: the cover from shell.html is up until the editor has started and the plan is drawn ----------
  // Opening an example shows its card from the start screen — over a reload too: the card goes to sessionStorage, shell.html puts it up at the first paint
  // While it is up the 3D draws nothing (the GPU is left to the page: the bar does not stutter); before it goes, the new home's shaders
  // compile in parallel (scene.js: warm), so its first frame does not freeze the page either.
  const cover = $('loading'),
    frame = () => new Promise(r => requestAnimationFrame(r));
  if (!cover.hidden) ed.view.pause?.();
  const coverUp = card => {
    cover.querySelector('.loading-ex').innerHTML = card;
    cover.dataset.ex = '';
    delete cover.dataset.boot;
    cover.classList.remove('out');
    cover.hidden = false;
    ed.view.pause?.();
  };
  const coverDown = async () => {
    ed.hold = false;
    try {
      sessionStorage.removeItem(COVER);
    } catch {}
    delete cover.dataset.boot;
    if (cover.hidden) {
      ed.view.resume?.();
      return;
    }
    await frame();
    await frame(); // the 3D is built in the next frame (ed.update)
    await Promise.race([ed.view.warm?.().catch(() => {}), new Promise(r => setTimeout(r, 4000))]);
    ed.view.resume?.();
    await frame();
    await frame(); // drawn
    cover.classList.add('out');
    setTimeout(() => {
      cover.hidden = true;
      cover.classList.remove('out');
    }, 260);
  };
  // ---------- start screen ----------
  // the first call is the start of the editor: the page in the address opens instead, if there is one
  let started = false;
  f.showStart = ({canContinue}) => {
    if (!started) {
      started = true;
      go(r0, {canContinue}).finally(() => {
        quiet--;
        writeRoute(false);
      });
      return;
    }
    startScreen(canContinue);
  };
  const startScreen = canContinue => {
    coverDown();
    const box = $('start');
    box.hidden = false;
    box.querySelector('[data-a=continue]').hidden = !canContinue;
    syncPrev();
    f.syncRoute();
  };
  const hideStart = () => {
    $('start').hidden = true;
    f.syncRoute();
  };
  f.hideStart = hideStart;
  // The AI build (D-073, D-074, ai-build.js): offered only where its service answers (main.js); the card is the AI build's own
  // (aiStartCard: a build on its way shows there)
  f.offerAi = setup => {
    const b = $('start').querySelector('[data-a=ai]');
    b.hidden = false;
    setup(b);
  };

  // ---------- the address (route.js, D-066) ----------
  // Pages: the start screen (null), a mode or Preview of your plan, of an example. Another page — a new step in the history (Back returns
  // to it); the same page whose plan stopped being an example (its rooms were edited) — the step is corrected. While the address is being
  // applied (the start, Back / Forward) nothing is written: quiet.
  const PAGE = {
      rooms: 'plan',
      furniture: 'furniture',
      lights: 'lights',
      devices: 'devices',
      sensors: 'sensors',
    },
    MODE = Object.fromEntries(Object.entries(PAGE).map(([m, p]) => [p, m]));
  let quiet = 1,
    queued = false,
    shown = routeHash(r0),
    leaving = false;
  const routeNow = () =>
    $('start').hidden
      ? {ex: exampleOf(ed.plan)?.id || null, page: ed.look?.() ? 'preview' : PAGE[ed.mode.id] || 'plan'}
      : null;
  const pageOf = h => h.replace(/^#\/example\/[\w-]+/, '#') || 'start';
  function writeRoute(push = null) {
    queued = false;
    if (!router || quiet || leaving) return;
    const now = routeNow(),
      h = routeHash(now);
    if (h === shown) return;
    router.write(now, push ?? pageOf(h) !== pageOf(shown));
    shown = h;
  }
  // several changes in one go (a mode button: leave Preview, switch the mode) — one step
  f.syncRoute = () => {
    if (router && !queued) {
      queued = true;
      queueMicrotask(() => writeRoute());
    }
  };
  const setPage = p => {
    if (p === 'preview') ed.setLook(true);
    else {
      ed.setLook(false);
      ed.setMode(MODE[p]);
    }
  };
  // another example than the one whose HA data are loaded: the page reloads with it (main.js reads the address)
  // (the address already names it; under its card from the start screen)
  const reloadWith = x => {
    leaving = true;
    const card = $('start').querySelector(`.ex[data-ex="${x.id}"]`)?.innerHTML;
    if (card) {
      coverUp(card);
      try {
        sessionStorage.setItem(COVER, JSON.stringify({card}));
      } catch {}
    }
    try {
      localStorage.setItem(EX, x.id);
    } catch {}
    requestAnimationFrame(() => requestAnimationFrame(() => location.reload()));
  };
  // the address → the page: at the start, after Back / Forward, a typed or followed link
  async function go(r, {canContinue = true} = {}) {
    const x = r?.ex ? examples.find(e => e.id === r.ex) : null;
    if (!r || (r.ex && !x) || (!r.ex && !canContinue)) {
      ed.hold = false;
      startScreen(canContinue);
      return;
    }
    if (x && exampleOf(ed.plan) !== x) {
      if (x.id !== example) {
        reloadWith(x);
        return;
      }
      await openExample(x, r.page);
      return;
    }
    // your plan's page while an example is open (Back from it): your plan comes back from the backup slot
    if (!x && isDemo(ed.plan) && readPrev()?.plan) await swapPrev();
    if (ed.hold) {
      ed.hold = false;
      ed.update();
    } // the example in the address is the plan already open (a reload): it stays as it is
    $('start').hidden = true;
    setPage(r.page);
    coverDown();
  }
  // an address from outside: once its page is open, the address is written as it is now (a wrong one is cleaned, a refused mode corrected)
  router?.listen(r => {
    if (routeHash(r) === shown && r) return;
    shown = undefined;
    quiet++;
    go(r).finally(() => {
      quiet--;
      writeRoute(false);
    });
  });
  $('start').querySelector('[data-a=continue]').onclick = hideStart;
  // Plan image: from the start screen — a new plan and the wizard; from the panel — only replace the plan photo.
  let fresh = false;
  $('start').querySelector('[data-a=upload]').onclick = () => {
    fresh = true;
    $('file-plan').click();
  };
  f.pickUnderlay = () => {
    fresh = false;
    $('file-plan').click();
  };
  $('file-plan').onchange = async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const src = await fitPhoto(
      await new Promise(ok => {
        const r = new FileReader();
        r.onload = () => ok(r.result);
        r.readAsDataURL(file);
      }),
    );
    if (fresh) {
      await keepPrev();
      hideStart();
      ed.setMain('plan');
      ed.setPlan(emptyPlan(), {fit: false});
      ed.setMode('rooms');
    }
    await ed.underlay.set(src, {
      place: img => {
        const k = UPLOAD_WIDTH_M / img.width;
        ed.underlay.a = [k, 0];
        ed.underlay.b = [0, img.height * k];
      },
    });
    ed.underlay.opacity = 0.7;
    ed.underlay.visible = true;
    ed.underlay.save();
    ed.mode.refresh?.();
    if (fresh || !ed.plan.rooms.length) ed.fit();
    // a new photo is straightened along the plan lines right away (D-040); “Undo straightening” is in the rectangle step
    autoTilt = null;
    if (fresh) {
      const th = tiltOf(ed.underlay.img);
      if (th != null && Math.abs(th) > 0.003 && Math.abs(th) < 0.35) {
        const c = ed.underlay.center();
        ed.underlay.turn(c, th);
        ed.underlay.save();
        autoTilt = {c, th};
        knob.src = ed.underlay.src;
        knob.straight = th;
        ed.fit();
        ed.draw();
      }
    }
    ed.amend();
    if (fresh) f.askArea();
    else f.calibrate();
  };
  let autoTilt = null;
  $('start').querySelector('[data-a=scratch]').onclick = async () => {
    await keepPrev();
    hideStart();
    ed.setMain('plan');
    await ed.underlay.clear();
    ed.setPlan(emptyPlan(), {fit: false});
    ed.v.fit([
      [0, 0],
      [10, 7],
    ]);
    ed.setMode('rooms');
    ed.setTool('rect');
    // area first: without it a rectangle drawn “by eye” came out any size at all (17 m² for a whole apartment)
    f.askArea();
  };
  // a step without a button: it ends by itself once the rectangle is drawn
  const scratchStep = () => {
    ed.setTool('rect');
    ed.step(DRAW_RECT, [], ed.aim.photo);
  };
  // ---------- examples (D-062): two groups, apartments and houses; a click opens the home with its demo HA data ----------
  // Each example has its own lights, sensors and devices: another one than the loaded one — the page reloads with it (main.js) and opens it
  {
    const box = $('start').querySelector('.examples');
    box.hidden = !examples.length;
    for (const x of examples) {
      const info = EXAMPLE[x.id] || {name: x.id, kind: 'flat'};
      const m2 = x.plan.rooms
        .filter(r => !OUTDOOR.test(r.name + ' ' + r.id))
        .reduce((s, r) => s + Math.abs(area(r.polygon)), 0);
      const b = el(
        `<button class="ex glass" data-ex="${esc(x.id)}">${planThumb(x.plan)}<b></b><span></span></button>`,
      );
      b.querySelector('b').textContent = t(info.name);
      b.querySelector('span').textContent = num(m2, 0) + t(' m²') + (info.note ? ' · ' + t(info.note) : '');
      b.onclick = () => {
        coverUp(b.innerHTML);
        if (x.id === example) {
          openExample(x);
          return;
        }
        // another example's HA data: its address, then the page reloads with it
        const r = {ex: x.id, page: 'preview'};
        router?.write(r, true);
        shown = routeHash(r);
        reloadWith(x);
      };
      box.querySelector(`.ex-list[data-kind=${info.kind}]`).append(b);
    }
    box.querySelectorAll('.ex-group').forEach(g => (g.hidden = !g.querySelector('.ex')));
  }
  // “← Examples” by the file menu while an example is open: back to the start screen, at the examples
  const back = $('to-examples');
  back.onclick = () => {
    f.showStart({canContinue: true});
    $('start').querySelector('.examples').scrollIntoView({block: 'center'});
  };
  f.syncExample = () => {
    back.hidden = !examples.length || !exampleOf(ed.plan);
    f.syncRoute();
  };
  // page — where it opens: Preview (the finished home first; “Plan” and the other modes are a click away) or the page in the address
  async function openExample(x, page = 'preview') {
    quiet++;
    try {
      const kept = await keepPrev();
      hideStart();
      ed.banner();
      const plan = structuredClone(x.plan),
        name = t(EXAMPLE[x.id]?.name || x.id);
      plan.name ??= name;
      ed.hold = false;
      ed.setPlan(plan, {fit: false});
      ed.setMode('rooms');
      ed.setTool('select');
      const u = x.underlay;
      if (u) {
        await ed.underlay.set(u.src, {place: () => ed.underlay.match(...u.match)});
        ed.underlay.opacity = 0.5;
        ed.underlay.save();
      } else await ed.underlay.clear();
      ed.amend();
      ed.mode.refresh?.();
      ed.fit();
      setPage(page);
      // an example is most often opened “just to look” — say right away that your own plan is safe
      // shown in “Preview” too: the example opens in it
      if (kept)
        ed.banner(
          t('“{0}” is open. Your plan is saved.', name),
          [
            [
              t('Restore my plan'),
              () => {
                ed.banner();
                swapPrev();
              },
            ],
            [t('Got it'), () => ed.banner(), true],
          ],
          null,
          {look: true},
        );
    } finally {
      quiet--;
      f.syncRoute();
      coverDown();
    }
  }

  // ---------- previous plan: a new plan does not erase the old one (start screen, “Open from file…”) ----------
  // Before replacement the plan and photo go into the backup slot; “Restore previous plan” (the ⌂ menu, start screen) swaps them —
  // it can be swapped back too. An empty plan and an untouched example are not saved: nothing to lose, and the real plan in the slot would be overwritten.
  const PREV = 'home-twin-editor:prev',
    same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const readPrev = () => {
    try {
      return JSON.parse(localStorage.getItem(PREV) || 'null');
    } catch {
      return null;
    }
  };
  // a plan is an example while its rooms are those of an example: playing with one (furniture, lights) is not your work, so it never
  // takes the backup slot from your own plan; the rooms redrawn — it has become yours
  const roomsKey = p => JSON.stringify(p.rooms.map(r => r.polygon)),
    exKeys = examples.map(x => roomsKey(x.plan));
  const exampleOf = p => examples[exKeys.indexOf(roomsKey(p))] || null,
    isDemo = p => !!exampleOf(p);
  const worth = () => (ed.plan.rooms.length > 0 || ed.underlay.ready) && !isDemo(ed.plan);
  const photoOf = u => (u.ready ? {a: [...u.a], b: [...u.b], opacity: u.opacity, visible: u.visible} : null);
  // into the slot goes what is current; false — nothing to save or it failed (then the slot is left alone)
  async function putPrev(plan, photo, src) {
    try {
      localStorage.setItem(PREV, JSON.stringify({plan, photo}));
    } catch {
      return false;
    }
    await (photo ? idb('put', 'prev-underlay', src) : idb('del', 'prev-underlay')).catch(() => {});
    return true;
  }
  async function keepPrev() {
    const ok = worth() && (await putPrev(ed.plan, photoOf(ed.underlay), ed.underlay.src));
    syncPrev();
    return ok;
  }
  f.keepPrev = keepPrev; // a new home from the AI build replaces the plan open now (ai-build.js)
  function syncPrev() {
    const on = !!readPrev()?.plan;
    document.querySelectorAll('[data-a=prev]').forEach(b => (b.hidden = !on));
  }
  async function swapPrev() {
    const prev = readPrev();
    if (!prev?.plan) return;
    const src = prev.photo ? await idb('get', 'prev-underlay').catch(() => null) : null,
      cur = {plan: ed.plan, photo: photoOf(ed.underlay), src: ed.underlay.src};
    if (worth()) await putPrev(cur.plan, cur.photo, cur.src);
    else {
      localStorage.removeItem(PREV);
      await idb('del', 'prev-underlay').catch(() => {});
    }
    if (src)
      await ed.underlay.set(src, {
        place: () =>
          Object.assign(ed.underlay, {
            a: prev.photo.a,
            b: prev.photo.b,
            opacity: prev.photo.opacity,
            visible: prev.photo.visible,
          }),
      });
    else await ed.underlay.clear();
    // your plan comes back where you worked on it, not in “Preview” (an example opens in it)
    hideStart();
    ed.banner();
    ed.setLook?.(false);
    ed.setTool?.('select');
    ed.setPlan(prev.plan);
    f.resume();
    syncPrev();
  }
  f.swapPrev = swapPrev;
  f.hasPrev = () => !!readPrev()?.plan;
  $('start').querySelector('[data-a=prev]').onclick = () => swapPrev();
  // the mode and wizard step — as this plan had last time (at startup and after “Restore previous plan”)
  f.resume = () => {
    const w = ed.wizard.get(ed.plan.id);
    ed.setMode(
      w?.lights ? 'lights' : w?.furn ? 'furniture' : w?.dev ? 'devices' : w?.sens ? 'sensors' : 'rooms',
    );
    if (w?.fin) ed.path.finale();
    else if (w?.askDev) ed.path.askDevices();
    else if (w?.ask) ed.path.ask();
  };

  // ---------- size from the area in the documents (D-038) ----------
  // Instead of measuring a wall — one number: the apartment area. From the first rectangle (it still includes walls and empty corners) the plan with
  // the photo is sized approximately; once rooms are split and named — exactly, by the sum of rooms without balconies and shafts.
  // “Don't know” — scale by a wall, as before. Once the scale is set by a wall, the area no longer touches it.
  // The area dialog: when a photo is uploaded, at the start of “Draw from scratch” and via “Back” from the first steps (to fix the area). If rooms already exist —
  // the size comes from them right away, the step stays the same. Without a photo “Don't know” means draw by eye (sizes show at the cursor). A balcony is not included in the documented area everywhere (it is in Moldova, not in Russia) — a checkbox,
  // the last choice is remembered.
  const BALC = 'home-twin-editor:docBalcony';
  f.askArea = () => {
    const has = ed.plan.rooms.length > 0,
      photo = ed.underlay.ready;
    const box = el(`<div class="keys area-ask"><form class="keys-box glass area-box">
      <b>${esc(t('Floor area'))}</b><p>${esc(t("We'll estimate the scale from the documented floor area. You can refine it later using a wall length."))}</p>
      <label class="area-in"><input inputmode="decimal" autocomplete="off" placeholder="62" aria-label="${esc(t('Floor area'))}" aria-describedby="area-error"><span>${esc(t(' m²').trim())}</span></label>
      <p id="area-error" class="field-error" role="alert" hidden>${esc(t('Enter an area from 5 to 5000 m², for example 62.5.'))}</p>
      <label class="area-balc"><input type="checkbox">${esc(t('Balcony is included in the area'))}</label>
      <div class="area-btns"><button type="button" class="soft" data-a="wall">${esc(photo ? t("Don't know — use a wall") : t("Don't know — draw by eye"))}</button><button class="primary">${esc(t('Next'))}</button></div></form></div>`);
    document.body.append(box);
    const inp = box.querySelector('.area-in input'),
      bal = box.querySelector('.area-balc input'),
      form = box.querySelector('form');
    if (ed.plan.docArea) inp.value = num(ed.plan.docArea);
    bal.checked = ed.plan.docBalcony ?? localStorage.getItem(BALC) === '1';
    setTimeout(() => {
      inp.focus();
      inp.select();
    });
    const wall = () => {
      box.remove();
      if (!photo) {
        if (!has) scratchStep();
        return;
      }
      has ? f.calibrate() : f.calibrate({step: true});
    };
    box.querySelector('[data-a=wall]').onclick = wall;
    // Esc: on upload — “Don't know”, when editing — just close
    box.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        has ? box.remove() : wall();
      }
    });
    inp.oninput = () => {
      inp.removeAttribute('aria-invalid');
      box.querySelector('#area-error').hidden = true;
    };
    form.onsubmit = e => {
      e.preventDefault();
      const raw = inp.value.trim().replace(',', '.'),
        v = /^\d+(?:\.\d+)?$/.test(raw) ? Number(raw) : NaN;
      if (!(v >= 5 && v <= 5000)) {
        inp.setAttribute('aria-invalid', 'true');
        box.querySelector('#area-error').hidden = false;
        inp.focus();
        return;
      }
      box.remove();
      ed.plan.docArea = v;
      ed.plan.docBalcony = bal.checked;
      localStorage.setItem(BALC, bal.checked ? '1' : '0');
      delete ed.plan.scaleBy;
      // rooms are not named yet — after naming, the size is refined without the balcony
      if (has) {
        ed.fitArea('rooms', {tell: true, commit: false});
        if (['rect', 'split'].includes(ed.path.cur())) ed.plan.scaleBy = 'rect';
        ed.commit();
        return;
      }
      ed.commit();
      if (!photo) {
        scratchStep();
        return;
      }
      const at = autoTilt;
      afterCalibration(
        at &&
          (() => {
            ed.underlay.turn(at.c, -at.th);
            ed.underlay.save();
            autoTilt = null;
            ed.draw();
          }),
      );
    };
  };
  ed.askArea = () => f.askArea();
  ed.showStart = () => f.showStart({canContinue: true});
  // balcony, loggia, terrace (in ten languages) — not included in the area unless “included” is checked (plan.docBalcony)
  const OUT =
    /балкон|лодж|террас|balcon|balkon|loggia|terras|balcón|terraza|terrazzo|taras|varanda|sacada|terraço|阳台|露台/i;
  // room area without its share of walls: inner walls take WALL.inner off each side of the outline
  const net = r => {
    const p = r.polygon;
    let per = 0;
    for (let i = 0; i < p.length; i++) {
      const q = p[(i + 1) % p.length];
      per += Math.hypot(q[0] - p[i][0], q[1] - p[i][1]);
    }
    return Math.abs(area(p)) - per * WALL.inner;
  };
  // by: 'rect' — from the first rectangle (~80% of it is living space), 'rooms' — from the rooms; returns the factor or 0
  // tell — say that sizes were adjusted (the user fixed the area themselves); refinement during the wizard is silent (the owner)
  ed.fitArea = (by, {commit = true, tell = false} = {}) => {
    const p = ed.plan,
      A = p.docArea;
    if (!A || p.scaleBy === 'wall' || (p.scaleBy === 'rooms' && by === 'rect')) return 0;
    const rs = p.rooms.filter(
      r =>
        !r.solid && (p.docBalcony || !OUT.test((r.name || '') + ' ' + (r.area ? ed.areaName(r.area) : ''))),
    );
    let S = rs.reduce((s, r) => s + (by === 'rect' ? Math.abs(area(r.polygon)) : net(r)), 0);
    if (by === 'rect') S *= 0.8;
    if (S < 1) return 0;
    const k = Math.sqrt(A / S);
    p.scaleBy = by;
    if (Math.abs(k - 1) < 0.005) {
      if (commit) ed.commit();
      return 1;
    }
    const xs = p.rooms.flatMap(r => r.polygon.map(q => q[0])),
      ys = p.rooms.flatMap(r => r.polygon.map(q => q[1])),
      c = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
    ed.history.captureExtra();
    scalePlan(p, c, k);
    if (ed.underlay.ready) {
      ed.underlay.turn(c, 0, k);
      ed.underlay.save();
    }
    const [X, Y] = ed.v.S(c);
    ed.v.zoomAt(X, Y, 1 / k); // everything stays in place on screen — only the sizes change
    if (commit) ed.commit();
    if (tell && Math.abs(k - 1) > 0.02)
      ed.banner(t('Sizes fitted to {0} m² from your documents.', A), [
        [
          t('Set scale from a wall'),
          () => {
            ed.banner();
            f.calibrate();
          },
        ],
        [t('Got it'), () => ed.banner(), true],
      ]);
    return k;
  };

  // ---------- aligning the plan photo: two clicks and a length ----------
  f.calibrate = ({step} = {}) => {
    if (!ed.underlay.ready) {
      f.pickUnderlay();
      return;
    }
    ed.setTool('select');
    ed.setMain('plan');
    ed.history.captureExtra();
    const pts = [];
    let hover = null;
    let tilt = 0,
      rescale = null;
    const undoTilt = () => {
      ed.underlay.turn(ed.underlay.center(), -tilt);
      tilt = 0;
      ed.underlay.save();
      ed.draw();
    };
    const finish = () => {
      ed.capture = null;
      ed.plan.scaleBy = 'wall';
      ed.draw();
      const k = rescale?.k;
      if (k && ed.plan.rooms.length && Math.abs(k - 1) > 0.02) {
        const x = Math.round((k > 1 ? k : 1 / k) * 100) / 100;
        ed.banner(
          k > 1
            ? t('The photo is now {0}× larger. Rescale rooms?', x)
            : t('The photo is now {0}× smaller. Rescale rooms?', x),
          [
            [
              t('No thanks'),
              () => {
                ed.commit();
                ed.banner();
                ed.fit();
              },
            ],
            [
              t('Rescale'),
              () => {
                scalePlan(ed.plan, rescale.c, k);
                ed.commit();
                ed.banner();
                ed.fit();
              },
              true,
            ],
          ],
        );
        return;
      }
      ed.commit();
      ed.fit();
      const tilted = Math.abs(tilt) > 0.002;
      if (step) afterCalibration(tilted ? undoTilt : null);
      else
        ed.banner(t('Scale set.'), [
          ...(tilted
            ? [
                [
                  t('Undo straightening'),
                  () => {
                    undoTilt();
                    ed.banner();
                  },
                ],
              ]
            : []),
          [t('Got it'), () => ed.banner(), true],
        ]);
    };
    ed.banner(
      t('Click both ends of a wall you know the length of.'), // the step number is in the path bar
      [
        ...(step ? ed.wizBtns() : []),
        [
          step ? t('Skip') : t('Cancel'),
          () => {
            ed.capture = null;
            step ? afterCalibration() : ed.banner();
            ed.draw();
          },
        ],
      ],
      ed.aim.photo,
    );
    ed.capture = {
      down(p, e) {
        if (pts.length >= 2) return;
        pts.push(ed.underlay.toImage(p));
        ed.draw();
        // second click: the photo is straightened along this wall right away (apartment walls are almost always at right angles), then the length
        if (pts.length === 2) {
          tilt = ed.underlay.straighten(pts[0], pts[1]);
          ed.draw();
          ed.ask(e.offsetX, e.offsetY, t('Length, cm'), '', {
            type: 'len',
            ok: m => {
              const k0 = Math.hypot(...ed.underlay.a);
              ed.underlay.calibrate(pts[0], pts[1], m);
              rescale = {k: Math.hypot(...ed.underlay.a) / k0, c: ed.underlay.toWorld(pts[0])};
              finish();
            },
            cancel: () => {
              if (Math.abs(tilt) > 1e-6) ed.underlay.turn(ed.underlay.center(), -tilt);
              tilt = 0;
              pts.length = 0;
              ed.draw();
            },
          });
        }
      },
      move(p) {
        hover = p;
        ed.draw();
      },
      cancel() {
        ed.capture = null;
        ed.banner();
        ed.draw();
      },
      draw() {
        const w = pts.map(z => ed.underlay.toWorld(z));
        if (pts.length === 1 && hover) w.push(hover);
        if (w.length === 2) {
          ed.v.path(w, false);
          ed.v.ctx.strokeStyle = '#e63c8c';
          ed.v.ctx.lineWidth = 2;
          ed.v.ctx.stroke();
        }
        w.forEach(q => ed.v.dot(q, 5, '#e63c8c'));
      },
    };
    ed.v.cv.style.cursor = 'crosshair';
  };
  // ---------- photo rotation knob (D-040) ----------
  // On the “Outline” and “Rooms” steps (the apartment is not split yet — the photo under it can be rotated) there is a knob above the photo: drag it —
  // the photo rotates around its center, with a grid on top so walls line up with the lines; the angle is at the cursor. It snaps to
  // “straight along the plan lines” (tiltOf) and right angles from it; Shift — no snapping. After that — “Rotate plan with photo”.
  const knob = {drag: null, straight: null, src: null};
  const knobOn = () => {
    const u = ed.underlay;
    return (
      u.ready &&
      u.visible &&
      ed.mode === ed.modes.rooms &&
      !ed.capture &&
      (ed.plan.rooms.length === 0 ||
        (ed.plan.rooms.length === 1 && ['rect', 'split'].includes(ed.path?.cur?.())))
    );
  };
  const knobGeo = () => {
    const u = ed.underlay,
      cs = u.corners().map(q => ed.v.S(q)),
      c = ed.v.S(u.center());
    let bi = 0,
      by = Infinity;
    for (let i = 0; i < 4; i++) {
      const m = (cs[i][1] + cs[(i + 1) % 4][1]) / 2;
      if (m < by) {
        by = m;
        bi = i;
      }
    }
    const a = cs[bi],
      b = cs[(bi + 1) % 4],
      m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
      dx = m[0] - c[0],
      dy = m[1] - c[1],
      L = Math.hypot(dx, dy) || 1;
    let k = [m[0] + (dx / L) * 30, m[1] + (dy / L) * 30];
    const out = k[1] < 72 || k[1] > ed.v.h - 90 || k[0] < 20 || k[0] > ed.v.w - 20; // that side is off screen — the knob sits at the edge
    if (out) k = [Math.max(20, Math.min(ed.v.w - 20, k[0])), Math.max(72, Math.min(ed.v.h - 90, k[1]))];
    return {m, k, out};
  };
  const straightOf = () => {
    const u = ed.underlay;
    if (knob.src !== u.src) {
      knob.src = u.src;
      knob.straight = tiltOf(u.img);
    }
    return knob.straight;
  };
  // The knob is a button over the plan (above the step hint frame, below the card); the grid, the dashed line to the photo and the angle are on the canvas.
  const kb = el(
    `<button class="knob" type="button" hidden title="${esc(t('Rotate photo'))}">${icon('rotate', 15)}</button>`,
  );
  $('pane-plan').append(kb);
  const kmove = e => {
    const d = knob.drag;
    if (!d) return;
    const r = ed.v.cv.getBoundingClientRect(),
      u = ed.underlay,
      p = ed.v.W([e.clientX - r.left, e.clientY - r.top]);
    let a = Math.atan2(p[1] - d.c[1], p[0] - d.c[0]) - d.a0;
    a = Math.atan2(Math.sin(a), Math.cos(a));
    if (!e.shiftKey && knob.straight != null) {
      const Q = Math.PI / 2,
        abs = d.ang0 + a,
        st = knob.straight + Math.round((abs - knob.straight) / Q) * Q;
      if (Math.abs(abs - st) < 0.0044) a = st - d.ang0;
    }
    d.t = a;
    u.a = [...d.u0];
    u.b = [...d.b0];
    u.turn(d.c, a);
    ed.draw();
  };
  kb.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    kb.setPointerCapture(e.pointerId);
    const r = ed.v.cv.getBoundingClientRect(),
      u = ed.underlay,
      c = u.center(),
      p = ed.v.W([e.clientX - r.left, e.clientY - r.top]);
    straightOf();
    knob.drag = {
      c,
      a0: Math.atan2(p[1] - c[1], p[0] - c[0]),
      u0: [...u.a],
      b0: [...u.b],
      ang0: u.angle(),
      t: 0,
    };
    kb.classList.add('drag');
  });
  kb.addEventListener('pointermove', kmove);
  const kup = () => {
    if (!knob.drag) return;
    knob.drag = null;
    kb.classList.remove('drag');
    ed.underlay.save();
    ed.draw();
  };
  kb.addEventListener('pointerup', kup);
  kb.addEventListener('pointercancel', kup);
  ed.knob = {
    draw: () => {
      const on = (knobOn() && ed.role('plan') === 'main') || !!knob.drag;
      kb.hidden = !on;
      if (!on) return;
      const {ctx} = ed.v,
        {m, k, out} = knobGeo(),
        d = knob.drag;
      kb.style.left = k[0] + 'px';
      kb.style.top = k[1] + 'px';
      ctx.save();
      if (d) {
        ctx.strokeStyle = pal.acc;
        ctx.globalAlpha = 0.22;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = ((ed.v.ox % 40) + 40) % 40; x < ed.v.w; x += 40) {
          ctx.moveTo(x, 0);
          ctx.lineTo(x, ed.v.h);
        }
        for (let y = ((ed.v.oy % 40) + 40) % 40; y < ed.v.h; y += 40) {
          ctx.moveTo(0, y);
          ctx.lineTo(ed.v.w, y);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      if (!out) {
        ctx.strokeStyle = pal.acc;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(m[0], m[1]);
        ctx.lineTo(k[0], k[1]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (d) dimLabel(ed.v, k[0], k[1] + 30, fmtDeg(d.t));
      ctx.restore();
    },
  };

  // Step 2: rectangle. A tilted photo gets a knob above it (ed.knob); if it was straightened automatically — “Undo straightening”.
  function afterCalibration(undoTilt = null) {
    ed.setTool('rect');
    ed.step(
      `${DRAW_RECT}<small>${t('Photo at an angle? Turn it by the circle above the photo.')}</small>`,
      undoTilt
        ? [
            [
              t('Undo straightening'),
              () => {
                undoTilt();
                afterCalibration();
              },
            ],
          ]
        : [],
      ed.aim.photo,
      {id: 'rect'},
    );
  }
  // Signed angle, “+” is counterclockwise (as in Figma).
  const fmtDeg = rad => {
    let d = (((rad * 180) / Math.PI + 540) % 360) - 180;
    d = Math.round(d * 10) / 10;
    if (d === -180) d = 180;
    return (d > 0 ? '+' : d < 0 ? '−' : '') + num(Math.abs(d)) + '°';
  };
  const Q = Math.PI / 2,
    nearestAxis = a => Math.round(a / Q) * Q;
  // frame, rotation knob and angle label
  function drawFrame(c, h, label) {
    const {ctx} = ed.v,
      m = [(c[0][0] + c[1][0]) / 2, (c[0][1] + c[1][1]) / 2];
    ctx.strokeStyle = pal.acc;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ed.v.path(c);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(...ed.v.S(m));
    ctx.lineTo(...ed.v.S(h));
    ctx.stroke();
    ed.v.dot(h, 7, '#fff', pal.acc, 2);
    const [X, Y] = ed.v.S(h);
    dimLabel(ed.v, X, Y - 20, label);
  }
  const handleOf = (c, ctr) => {
    const m = [(c[0][0] + c[1][0]) / 2, (c[0][1] + c[1][1]) / 2],
      d = Math.hypot(m[0] - ctr[0], m[1] - ctr[1]) || 1,
      k = 30 / ed.v.sc;
    return [m[0] + ((m[0] - ctr[0]) / d) * k, m[1] + ((m[1] - ctr[1]) / d) * k];
  };
  // ---------- rotate the whole plan together with the photo (button in the bottom panel) ----------
  // Scenario: uploaded a slightly crooked plan → rotated everything so the walls lie straight → draw on top.
  // Rotation only: the plan scale is real, and the hand tool can move the view.
  f.rotatePlan = () => {
    const ul = ed.underlay,
      photo = ul.ready,
      plan = () => ed.plan;
    const pts = [...plan().rooms.flatMap(r => r.polygon), ...(photo ? ul.corners() : [])];
    if (!pts.length) {
      ed.toolDone('rotate');
      ed.banner(t('Nothing to rotate: no photo or rooms.'), [[t('Got it'), () => ed.banner()]]);
      return;
    }
    ed.setMain('plan');
    ed.sel = {};
    ed.mode.refresh?.();
    ed.versions.mark('before', 'rotate');
    const xs = pts.map(p => p[0]),
      ys = pts.map(p => p[1]),
      pivot = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
    ed.history.captureExtra();
    const snap = {
      rooms: structuredClone(plan().rooms),
      furniture: structuredClone(plan().furniture),
      lights: structuredClone(plan().lights),
      a: photo && [...ul.a],
      b: photo && [...ul.b],
    };
    const photo0 = photo ? Math.atan2(snap.a[1], snap.a[0]) : 0;
    let th = 0,
      op = null,
      cursor = null;
    const apply = t => {
      th = t;
      plan().rooms = structuredClone(snap.rooms);
      plan().furniture = structuredClone(snap.furniture);
      plan().lights = structuredClone(snap.lights);
      rotatePlan(plan(), pivot, th);
      if (photo) {
        ul.a = [...snap.a];
        ul.b = [...snap.b];
        ul.turn(pivot, th);
      }
      ed.update();
    };
    // snaps to 90° and to the position where the photo is straight
    const snapTh = t => {
      for (const q of [nearestAxis(t), ...(photo ? [nearestAxis(photo0 + t) - photo0] : [])])
        if (Math.abs(t - q) < 0.044) return q;
      return t;
    };
    // the view is not touched on entry or exit: only the user moves the plan
    const finish = keep => {
      if (!keep) apply(0);
      ed.capture = null;
      ed.toolDone('rotate');
      ed.banner();
      ed.v.cv.style.cursor = '';
      if (photo) ul.save();
      if (Math.abs(th) > 1e-6) ed.commit();
      else ed.draw();
    };
    ed.banner(t('Drag to rotate the plan with the photo. Click to finish, Esc to cancel.'));
    const near = (p, q, r) => Math.hypot(p[0] - q[0], p[1] - q[1]) * ed.v.sc < r;
    // like rotation in Blender and SketchUp: no frame; center, a line to the cursor, an arc and the angle
    let raw = null,
      spinT = null;
    const spinEnd = () => {
      raw = null;
    };
    ed.capture = {
      kind: 'rotate-plan',
      dragCursor: () => 'grabbing',
      spin(d) {
        if (raw == null) raw = th;
        raw += d;
        apply(snapTh(raw));
        clearTimeout(spinT);
        spinT = setTimeout(spinEnd, 300);
      },
      spinEnd,
      down(p) {
        op = {p0: p, th0: th, a0: Math.atan2(p[1] - pivot[1], p[0] - pivot[0])};
      },
      move(p, e) {
        cursor = p;
        ed.v.cv.style.cursor = op?.moved ? 'grabbing' : 'grab';
        if (!op) {
          ed.draw();
          return;
        }
        if (!op.moved && !near(p, op.p0, 3)) op.moved = true;
        if (!op.moved || near(p, pivot, 24)) return;
        let t = op.th0 + Math.atan2(p[1] - pivot[1], p[0] - pivot[0]) - op.a0;
        if (!e.shiftKey) t = snapTh(t);
        apply(t);
      },
      up() {
        const o = op;
        op = null;
        if (o && !o.moved) finish(true);
        else ed.draw();
      },
      cancel: () => finish(false),
      done: () => finish(true),
      draw() {
        const {ctx} = ed.v,
          [X, Y] = ed.v.S(pivot);
        ctx.strokeStyle = pal.acc;
        ctx.fillStyle = pal.acc;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(X, Y, 5, 0, 7);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(X - 11, Y);
        ctx.lineTo(X - 7, Y);
        ctx.moveTo(X + 7, Y);
        ctx.lineTo(X + 11, Y);
        ctx.moveTo(X, Y - 11);
        ctx.lineTo(X, Y - 7);
        ctx.moveTo(X, Y + 7);
        ctx.lineTo(X, Y + 11);
        ctx.stroke();
        if (op?.moved && cursor) {
          const [CX, CY] = ed.v.S(cursor),
            r = Math.min(70, Math.hypot(CX - X, CY - Y));
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(X, Y);
          ctx.lineTo(CX, CY);
          ctx.stroke();
          ctx.setLineDash([]);
          // arc from the initial direction to the current one (on screen y points down — angles have the opposite sign)
          const a1 = -op.a0,
            a2 = -(op.a0 + th - op.th0);
          ctx.beginPath();
          ctx.arc(X, Y, r, Math.min(a1, a2), Math.max(a1, a2));
          ctx.lineWidth = 2;
          ctx.stroke();
          dimLabel(ed.v, CX + 28, CY - 18, fmtDeg(th));
        } else if (Math.abs(th) > 1e-6) dimLabel(ed.v, X, Y - 24, fmtDeg(th));
      },
    };
    ed.draw();
  };

  // ---------- plan photo frame: move, rotate, scale (button in the “Background” row) ----------
  // Photo only — when rooms are already drawn and the photo under them has shifted. Like an image in Figma:
  // drag inside — move, the knob above the top edge — rotate (snaps to 90°), corners — scale.
  f.moveUnderlay = () => {
    const ul = ed.underlay;
    if (!ul.ready) return;
    ed.setTool('select');
    ed.setMain('plan');
    let op = null;
    // the view is not touched: only the user moves the plan
    const done = () => {
      ed.capture = null;
      ul.save();
      ed.banner();
      ed.v.cv.style.cursor = '';
      ed.mode.refresh?.();
      ed.draw();
    };
    ed.banner(t('Drag to move, outside the frame to rotate, corners to resize. Click to finish.'));
    const geo = () => {
      const c = ul.corners(),
        ctr = ul.center();
      return {c, ctr, h: handleOf(c, ctr)};
    };
    const pick = p => {
      const g = geo(),
        near = (q, r) => Math.hypot(p[0] - q[0], p[1] - q[1]) * ed.v.sc < r;
      if (near(g.h, 12)) return 'rotate';
      if (g.c.some(q => near(q, 10))) return 'scale';
      return pointIn(p, g.c) ? 'move' : 'outside';
    };
    const resizeCursor = p => {
      const {ctr} = geo();
      return axisCursor([p[0] - ctr[0], p[1] - ctr[1]]);
    };
    let raw = null,
      spinT = null;
    ed.capture = {
      dragCursor: () => (op?.k === 'scale' ? resizeCursor(op.p0) : op?.k === 'move' ? 'move' : 'grabbing'),
      // rotate gesture / two fingers: spin the photo around its center, snapping to the straight position
      spin(d) {
        const a = ul.angle();
        if (raw == null) raw = a;
        raw += d;
        let t = raw;
        const q = nearestAxis(t);
        if (Math.abs(t - q) < 0.044) t = q;
        ul.turn(ul.center(), t - a);
        ed.draw();
        clearTimeout(spinT);
        spinT = setTimeout(() => {
          raw = null;
          ul.save();
        }, 300);
      },
      spinEnd() {
        raw = null;
        ul.save();
      },
      down(p) {
        // a click outside the photo — done (as in Figma: clicking empty space clears the selection)
        const g = geo(),
          k = pick(p);
        op = {
          k,
          p0: p,
          a: [...ul.a],
          b: [...ul.b],
          ctr: g.ctr,
          ang0: Math.atan2(p[1] - g.ctr[1], p[0] - g.ctr[0]),
          r0: Math.hypot(p[0] - g.ctr[0], p[1] - g.ctr[1]),
        };
      },
      move(p, e) {
        if (!op) {
          const k = pick(p);
          ed.v.cv.style.cursor =
            k === 'rotate' || k === 'outside' ? 'grab' : k === 'scale' ? resizeCursor(p) : 'move';
          return;
        }
        if (!op.moved && Math.hypot(p[0] - op.p0[0], p[1] - op.p0[1]) * ed.v.sc < 3) return;
        op.moved = true;
        ul.a = [...op.a];
        ul.b = [...op.b];
        if (op.k === 'move') ul.moveBy(p[0] - op.p0[0], p[1] - op.p0[1]);
        else if (op.k === 'rotate' || op.k === 'outside') {
          let th = Math.atan2(p[1] - op.ctr[1], p[0] - op.ctr[0]) - op.ang0;
          if (!e.shiftKey) {
            const abs = Math.atan2(op.a[1], op.a[0]) + th,
              q = nearestAxis(abs);
            if (Math.abs(abs - q) < 0.044) th += q - abs;
          }
          ul.turn(op.ctr, th);
        } else ul.turn(op.ctr, 0, Math.max(0.05, Math.hypot(p[0] - op.ctr[0], p[1] - op.ctr[1]) / op.r0));
        ed.draw();
      },
      // a click on the photo without dragging — also done
      // a click without dragging — on the photo or outside — done
      up() {
        if (!op) return;
        const o = op;
        op = null;
        if (!o.moved && (o.k === 'move' || o.k === 'outside')) {
          done();
          return;
        }
        ul.save();
      },
      cancel: done,
      draw() {
        const g = geo(),
          {ctx} = ed.v;
        drawFrame(g.c, g.h, fmtDeg(ul.angle()));
        ctx.strokeStyle = pal.acc;
        for (const q of g.c) {
          const [X, Y] = ed.v.S(q);
          ctx.fillStyle = '#fff';
          ctx.fillRect(X - 4, Y - 4, 8, 8);
          ctx.strokeRect(X - 4, Y - 4, 8, 8);
        }
      },
    };
  };
  // ---------- the “⋯” menu ----------
  // On the left — the file menu (under the home name), on the right — settings.
  const menus = [
      [$('brand-btn'), $('file-menu')],
      [$('menu-btn'), $('menu')],
    ],
    closeMenus = () => menus.forEach(([, m]) => (m.hidden = true));
  for (const [btn, m] of menus)
    btn.onclick = e => {
      e.stopPropagation();
      const open = m.hidden;
      closeMenus();
      m.hidden = !open;
      $('grid').checked = ed.grid;
      ed.syncSettings?.();
    };
  addEventListener('pointerdown', e => {
    if (!e.target.closest('.menu,#brand-btn,#menu-btn')) closeMenus();
  });
  addEventListener('keydown', e => {
    if (e.key === 'Escape') closeMenus();
  });
  const act = {
    new: () => f.showStart({canContinue: true}),
    keys: () => ed.showKeys(),
    download: () => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(ed.plan, null, 1)], {type: 'application/json'}));
      a.download = 'plan.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },
    open: () => $('file-json').click(),
    wizard: () => {
      hideStart();
      ed.path.resume();
    },
    prev: () => swapPrev(),
    versions: () => ed.showVersions(),
    board: () => f.addBoard(),
  };
  document.querySelectorAll('.menu [data-a]').forEach(
    b =>
      (b.onclick = () => {
        closeMenus();
        act[b.dataset.a]();
      }),
  );
  syncPrev();
  // The whole home on a dashboard (D-059, in HA only): the Home Twin dashboard with the card, in the sidebar; there already — go there.
  // The menu item says which of the two it will do.
  const boardBtn = document.querySelector('[data-a=board]');
  const syncBoard = () => {
    const b = ed.ha.board;
    boardBtn.hidden = !b;
    if (b) boardBtn.lastChild.textContent = b.exists() ? t('Open dashboard') : t('Add to dashboard');
  };
  $('brand-btn').addEventListener('click', syncBoard);
  syncBoard();
  f.addBoard = async () => {
    const b = ed.ha.board;
    if (!b) return;
    if (b.exists()) {
      b.open();
      return;
    }
    const name = ed.plan.name || t('My home');
    // after the message — the summary again, if it was open: now without “Add to dashboard”
    const done = () => {
      if (ed.stepNow()?.o?.id === 'fin') ed.path.finale();
      else ed.banner();
    };
    try {
      await b.add(name);
      syncBoard();
      ed.banner(t('Your home is on the dashboard “{0}” in the sidebar.', name), [
        [t('Got it'), done],
        [
          t('Open|verb'),
          () => {
            done();
            b.open();
          },
          true,
        ],
      ]);
    } catch (e) {
      ed.banner(t('Could not create the dashboard: {0}', e?.message || String(e)), [
        [t('Got it'), () => ed.banner(), true],
      ]);
    }
  };
  $('grid').onchange = e => {
    ed.grid = e.target.checked;
  };
  $('file-json').onchange = async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    let plan;
    try {
      plan = readPlan(await file.text());
    } catch {
      ed.banner(t("This isn't a plan file."), [[t('Got it'), () => ed.banner()]]);
      return;
    }
    // Another project has no photo in its JSON. The previous plan photo must not end up under the new home.
    ed.versions.mark('before', 'file');
    if (plan.id !== ed.plan.id) {
      await keepPrev();
      await ed.underlay.clear();
    }
    ed.setPlan(plan);
    hideStart();
  };
  return f;
}
