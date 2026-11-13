// The dashboard card (D-059): the plan from HA in 3D with the home panel — the editor's “Preview” (editor/look.js, D-047) without
// the editor. The plan comes from home_twin/plan/subscribe and follows every write; states, commands, history and statistics — the
// HA layer (editor/ha-live.js). What goes into the 3D is what the editor sends there too (core/plan-scene.js). Out of sight —
// scrolled away, another page, a dashboard HA keeps in memory — the 3D stops drawing (scene.js: pause).
// Night follows the sun (sun.sun) until the “Day / night” button is pressed. Settings the panel writes into the plan (scenes,
// “Customize panel”) are saved by administrators only; for others those buttons are hidden.
// Compact (card.js decides: an ordinary dashboard while the Home Twin dashboard exists) — the 3D as a still live picture, the room strip
// and “Now”; a tap on the model, a room or ⤢ opens the whole home there, a room — with ?room=, which the whole card opens.
import {createView} from './core/scene.ts';
import {migrate} from './core/plan.ts';
import {syncRuns} from './core/runs.ts';
import {syncFurnStrips} from './core/fixtures.ts';
import {liveScene} from './core/devices.ts';
import {validate} from './core/geometry.ts';
import {planWalls, planFurniture, planSpots} from './core/plan-scene.ts';
import {loadKenney} from './core/furniture3d.ts';
import {MODELS} from './gen/models.gen.js';
import {liveHA} from './editor/ha-live.ts';
import {haPlanLights, mergePlanLights} from './editor/ha.ts';
import {createLook} from './editor/look.ts';
import {t} from './i18n/i18n.ts';
import {readMode, saveMode, nextMode, isNight, onModeChange} from './core/daynight.ts';
import type {SceneView} from './core/scene.ts';
import type {Hass, HassMessage, Plan, PlanInput} from './core/types.ts';
import type {LookEditor} from './editor/editor-types.ts';

/** The card's settings in the dashboard's YAML: compact: false — never compact; height — px (a number) or any CSS length. */
export interface CardConfig {
  compact?: boolean;
  height?: number | string;
}

/** The <home-twin-card> element (card.ts) as the card's 3D and panel use it. */
export interface CardHost extends HTMLElement {
  /** Compact: the 3D, the room strip and “Now” (card.ts decides). */
  readonly compact: boolean;
}

/** The mounted card (createCard), as card.ts drives it. */
export interface CardApp {
  view: SceneView;
  update(hass: Hass): void;
  config(config: CardConfig | null | undefined): void;
  pause(): void;
  resume(): void;
  destroy(): void;
}

/** A plan from home_twin/plan/subscribe: the plan in HA (none yet: null) and its revision. */
interface PlanMessage {
  plan: PlanInput | null;
  rev: number;
}

/** hass.connection.subscribeMessage for home_twin/plan/subscribe, whose messages are PlanMessage. */
type SubscribePlan = (
  onMessage: (message: PlanMessage) => void,
  subscribe: HassMessage,
) => Promise<() => void>;

/** What a drawn part of the scene was last drawn from (JSON): the home view, the lights, the walls, the room mask. */
type DrawnKeys = Partial<Record<'view' | 'lights' | 'walls' | 'mask', string>>;

let models: Promise<void> | null = null; // furniture models: loaded once per page for every card
const esc = (s: unknown): string => {
  const entities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return String(s ?? '').replace(/[&<>"']/g, c => entities[c]);
};
const BOARD = 'home-twin-3d'; // the Home Twin dashboard (card.js, editor/ha-live.js)
const CSS = `:host{display:block;height:var(--home-twin-height,600px)}:host([compact]){height:var(--home-twin-height,360px)}:host([panel]),:host([grid]){height:100%}
ha-card{position:relative;display:block;height:100%;overflow:hidden;isolation:isolate}
.view{position:absolute;inset:0}
.empty{position:absolute;inset:0;z-index:6;display:grid;place-content:center;justify-items:center;gap:6px;padding:24px;text-align:center;color:var(--secondary-text-color);background:var(--card-background-color,#1c1c1c)}
.empty[hidden]{display:none}.empty b{font-size:16px;font-weight:600;color:var(--primary-text-color)}
.empty button{margin-top:8px;padding:8px 16px;border:0;border-radius:18px;font:inherit;font-weight:500;cursor:pointer;color:var(--text-primary-color,#fff);background:var(--primary-color,#03a9f4)}
.open{position:absolute;top:10px;right:10px;z-index:7;width:36px;height:36px;padding:0;border:0;border-radius:12px;display:none;place-items:center;cursor:pointer;
  color:var(--primary-text-color);background:color-mix(in srgb,var(--card-background-color,#1c1c1c) 72%,transparent);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
.open:hover{background:var(--card-background-color,#1c1c1c)}:host([compact]) .open{display:grid}`;
const EXPAND =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>';
// inside the panel (look.js): it is as tall as the card, not as the browser window; settings buttons — administrators only
const IN_CARD = ':host(.embedded) .shell{height:100%;min-height:0}';
const NOT_ADMIN = '.layout-open,[data-action=scene-edit]{display:none!important}';
// compact: the model fills the card, “Now” lies over its top, the room strip — over its bottom, nothing else of the panel
const COMPACT = `:host(.compact) .main{padding:0!important}:host(.compact) .workspace{display:block!important;position:relative;height:100%}
:host(.compact) .map-card{position:absolute!important;inset:0;height:auto!important;border:0;border-radius:0}
:host(.compact) .sidebar{position:absolute!important;left:12px;right:58px;top:12px;bottom:auto!important;width:auto!important;padding:0!important;background:none!important;
  border:0!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;overflow:visible!important;pointer-events:none}
:host(.compact) .sidebar>:not(.now-panel),:host(.compact) .now-panel .section-head{display:none!important}:host(.compact) .now-chips{pointer-events:auto}
:host(.compact) .room-strip{display:grid!important;padding:28px 10px 10px!important}
:host(.compact) .view-controls,:host(.compact) .workspace::before,:host(.compact) .workspace::after{display:none!important}`;

export async function createCard(card: CardHost, hass0: Hass, config0: CardConfig): Promise<CardApp> {
  let hass = hass0;
  let config = config0;
  const root = card.shadowRoot || card.attachShadow({mode: 'open'});
  root.innerHTML = `<style>${CSS}</style><ha-card><div class="view"></div><div class="empty" hidden></div>
    <button class="open" type="button" title="${esc(t('Open|verb'))}" aria-label="${esc(t('Open|verb'))}">${EXPAND}</button></ha-card>`;
  // the markup just above has them all
  const box = root.querySelector<HTMLElement>('ha-card')!;
  const emptyEl = root.querySelector<HTMLElement>('.empty')!;
  const viewEl = root.querySelector<HTMLElement>('.view')!;
  const ha = liveHA(hass);
  models ??= loadKenney(MODELS);
  await models;
  const view = createView(viewEl);
  const dark = (): boolean => !!hass.themes?.darkMode;
  const sunDown = (): boolean => hass.states['sun.sun']?.state === 'below_horizon';
  // day / night (D-068): auto — by the sun (night after sunset, day after sunrise), or always day, always night; the mode is shared with the
  // editor (core/daynight.js), the button steps through them
  let dayMode = readMode();
  let night = isNight(dayMode, sunDown());
  let themeDark = dark();
  const showNight = (): boolean => {
    const n = isNight(dayMode, sunDown());
    if (n === night) return false;
    night = n;
    view.setNight(n);
    return true;
  };
  view.setTheme(themeDark);
  view.setNight(night);

  // what look.js expects from the editor
  const ed: LookEditor = {
    plan: migrate({}),
    ha,
    view,
    areaName: id => ha.areas().find(a => a.area_id === id)?.name || id,
    sensorCtx: () => ({sensors: ha.sensors?.() || [], areas: ha.areas(), state: e => ha.state?.(e) ?? null}),
    history: {save: p => save(p)},
    night: () => night,
    dayMode: () => dayMode,
    toggleNight: () => {
      dayMode = nextMode(dayMode);
      saveMode(dayMode);
      showNight();
    },
    themeName: () => (themeDark ? 'dark' : 'light'),
  };
  const look = createLook(ed, box);
  const lookRoot = box.querySelector('#look')?.shadowRoot;
  const adminCss = document.createElement('style');
  lookRoot?.append(adminCss);
  const roles = (): void => {
    adminCss.textContent = IN_CARD + COMPACT + (hass.user?.is_admin ? '' : NOT_ADMIN);
  };
  roles();

  // the model fits into what the panel leaves free; compact — above the room strip
  const fit = (): void => {
    if (compact) {
      const s = lookRoot?.querySelector<HTMLElement>('.room-strip');
      view.setInsets(0, 0, s?.offsetHeight ? s.offsetHeight - 28 : 0);
      return;
    }
    const i = look.insets();
    view.setInsets(0, i.right, i.bottom);
  };

  // ---------- compact, and the way to the whole home ----------
  let compact = false;
  const go = (room?: string): void => {
    history.pushState(null, '', `/${BOARD}/home` + (room ? '?room=' + encodeURIComponent(room) : ''));
    window.dispatchEvent(new CustomEvent('location-changed'));
  };
  function setCompact(c: boolean): void {
    if (c === compact) return;
    compact = c;
    card.toggleAttribute('compact', c);
    box.querySelector('#look')?.classList.toggle('compact', c);
    view.controls.enabled = !c;
    view.renderer.domElement.style.touchAction = c ? 'pan-y' : 'none'; // a still picture: the page scrolls over it
    if (c) {
      look.close();
      look.open();
    }
    requestAnimationFrame(fit);
  }
  root.querySelector('.open')!.addEventListener('click', () => go()); // in the markup above
  // a tap (not a drag) on the model, a room chip — the whole home
  let down: {x: number; y: number; at: number} | null = null;
  viewEl.addEventListener('pointerdown', e => {
    down = {x: e.clientX, y: e.clientY, at: performance.now()};
  });
  viewEl.addEventListener('pointerup', e => {
    const d = down;
    down = null;
    if (compact && d && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 8 && performance.now() - d.at < 600)
      go();
  });
  lookRoot?.addEventListener(
    'click',
    e => {
      if (!compact) return;
      // the path also holds the shadow root, the document and the window, which have no dataset
      const chip = e
        .composedPath()
        .find((n): n is HTMLElement => (n as HTMLElement).dataset?.action === 'room');
      if (chip) {
        e.stopImmediatePropagation();
        e.preventDefault();
        go(chip.dataset.room);
      }
    },
    true,
  );
  // opened from a compact card with ?room= — that room's screen, and the address is cleaned
  function deepLink(): void {
    if (compact || !framed || !card.isConnected) return;
    const q = new URLSearchParams(location.search);
    const r = q.get('room');
    if (!r) return;
    q.delete('room');
    const rest = q.toString();
    history.replaceState(history.state, '', location.pathname + (rest ? '?' + rest : ''));
    look.room(r);
  }
  window.addEventListener('location-changed', deepLink);

  // ---------- the plan ----------
  let keys: DrawnKeys = {};
  let rev: number | null = null;
  let mine: number | null = null;
  let framed = false;
  // as the editor loads it: HA lamps reconciled with the plan's (editor/app.js: setPlan)
  function setPlan(p: PlanInput | null): void {
    ed.plan = migrate(p || {});
    ed.plan.lights = mergePlanLights(ed.plan.lights, haPlanLights(ha), ha.switches?.() || []);
    keys = {};
    if (!framed) view.reframe();
    sync();
    look.refresh();
    fit();
    deepLink();
  }
  function sync(): void {
    const plan = ed.plan;
    syncRuns(plan);
    syncFurnStrips(plan);
    const ok = plan.rooms.length > 0 && !validate(plan.rooms).length;
    empty(!ok);
    if (ok) framed = true;
    const vk = JSON.stringify(plan.view || null);
    if (vk !== keys.view) {
      keys.view = vk;
      view.setHome?.(plan.view);
    }
    live();
    const placed = plan.lights.filter(l => l.placed);
    const lk = JSON.stringify([placed, plan.rooms]);
    if (lk !== keys.lights) {
      keys.lights = lk;
      view.setLights(placed, plan.rooms);
    }
    const wk = JSON.stringify([plan.rooms, plan.openings, plan.wall]);
    if (wk !== keys.walls) {
      keys.walls = wk;
      if (ok) {
        const {g, ops} = planWalls(plan);
        view.set(g, plan.rooms, ops, null);
      } else view.set(null);
    }
    if (keys.mask !== lk) {
      keys.mask = lk;
      view.applyMask(plan.rooms.filter(r => !r.solid));
    }
  }
  // what changes with HA states: curtains and doors open, air conditioners blow, readings on the walls
  function live(): void {
    const plan = ed.plan;
    const l = liveScene(plan, ha);
    view.setFurniture(planFurniture(plan, l));
    view.setSensors(planSpots(plan, ed.sensorCtx(), {cam: view.homeCam?.()}));
    view.setClimate?.(l.climate);
    view.setContacts?.(l.contacts);
  }
  // no home yet: say so, and administrators get a way to the editor
  function empty(on: boolean): void {
    emptyEl.hidden = !on;
    if (!on) return;
    const admin = !!hass.user?.is_admin;
    emptyEl.innerHTML =
      `<b>${esc(t('Your home is not drawn yet'))}</b><span>${esc(admin ? t('Draw it in the Home Twin editor — it shows up here.') : t('An administrator can draw it in Home Twin.'))}</span>` +
      (admin ? `<button type="button">${esc(t('Open the editor'))}</button>` : '');
    emptyEl.querySelector('button')?.addEventListener('click', () => {
      history.pushState(null, '', '/home-twin');
      window.dispatchEvent(new CustomEvent('location-changed'));
    });
  }
  // the panel's own settings (scenes, layout) — into the plan in HA; our own write comes back through the subscription — not reloaded
  let saveT: ReturnType<typeof setTimeout> | number = 0;
  function save(p: Plan): void {
    if (!hass.user?.is_admin) return;
    clearTimeout(saveT);
    saveT = setTimeout(
      () =>
        hass.callWS({type: 'home_twin/plan/save', plan: p, rev}).then(
          r => {
            // home_twin/plan/save answers with the plan's new revision
            rev = mine = (r as {rev: number}).rev;
          },
          e => console.warn('Home Twin card:', e),
        ),
      700,
    );
  }
  // HA hands a card a hass with its connection; home_twin/plan/subscribe sends a PlanMessage
  const unsubPlan = (hass.connection!.subscribeMessage as SubscribePlan)(
    m => {
      if (m.rev === mine && m.rev === rev) return;
      rev = m.rev;
      setPlan(m.plan);
    },
    {type: 'home_twin/plan/subscribe'},
  );

  ha.onState(() => {
    live();
    if (showNight()) look.refresh();
  });
  onModeChange(m => {
    dayMode = m;
    showNight();
    look.refresh();
  });
  ha.onChange(() => {
    live();
    look.refresh();
  });
  look.open();
  setCompact(!!card.compact);

  const ro = new ResizeObserver(() => {
    fit();
    requestAnimationFrame(fit);
  });
  ro.observe(box);
  // drawing only while it can be seen
  let shown = true;
  let attached = true;
  const run = (): void => (shown && attached ? view.resume() : view.pause());
  const io = new IntersectionObserver(es => {
    shown = es.at(-1)!.isIntersecting; // the observer always hands at least one entry
    run();
  });
  io.observe(box);
  applyConfig();
  function applyConfig(): void {
    if (config.height)
      card.style.setProperty(
        '--home-twin-height',
        // a number that is not all digits (12.5) goes in as its text
        /^\d+$/.test(String(config.height)) ? config.height + 'px' : (config.height as string),
      );
    else card.style.removeProperty('--home-twin-height');
  }

  return {
    view,
    update(h) {
      const was = hass;
      hass = h;
      ha.update(h);
      setCompact(!!card.compact);
      if (dark() !== themeDark) {
        themeDark = dark();
        view.setTheme(themeDark);
        look.refresh();
      }
      if (h.user !== was.user) {
        roles();
        if (emptyEl.hidden === false) empty(true);
      }
    },
    config(c) {
      config = c || {};
      applyConfig();
      setCompact(!!card.compact);
    },
    pause() {
      attached = false;
      run();
    },
    resume() {
      attached = true;
      run();
      setCompact(!!card.compact);
      fit();
      deepLink();
    },
    // gone for good (card.js: removed and not back within a minute — HA never says so itself): let everything go
    destroy() {
      clearTimeout(saveT);
      window.removeEventListener('location-changed', deepLink);
      io.disconnect();
      ro.disconnect();
      look.close();
      ha.close();
      view.dispose();
      unsubPlan.then(u => u()).catch(() => {});
      root.innerHTML = '';
    },
  };
}
