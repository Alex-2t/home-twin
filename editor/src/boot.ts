// Editor startup — shared by the standalone app (main.js: demo data, plan in the browser) and the Home Assistant panel
// (ha-app.js: real HA, plan in HA). The language is already set (i18n/boot.js), the shell markup is in the document.
//   ha     — the HA layer (editor/ha.js: mockHA or ha-live.js)
//   examples — the start screen's examples [{id, plan, underlay}] and example — the one whose HA data are loaded (D-062); absent (in HA) — none
//   router — the address: the page that is open (editor/route.js, D-066); absent — not used
//   gallery — the address of the list of homes the server publishes for the gallery (D-113); absent — the examples alone
//   plans  — where else the plan is stored: {load(local) → Promise<{plan, rev}>, save(plan)}; absent — browser only
//   photos — where the plan photo is kept (underlay.js: browserPhotos — the default, ha-live.js: hassPhotos)
//   onApp(ed) — right after the editor is created, before the first plan
//   onNewerPlan — the plan opened is of a newer format than this editor writes (D-121): it is not saved; absent — a notice offers to reload
//   dev    — the test panel (standalone app on localhost only)
import {createApp} from './editor/app.ts';
import {haPlanLights} from './editor/ha.ts';
import {createFlows} from './editor/flows.ts';
import {devPanel} from './editor/devpanel.ts';
import {t, translateDom} from './i18n/i18n.ts';
import {loadKenney, thumbnails} from './core/furniture3d.ts';
import {MODELS} from './gen/models.gen.js';
import {isNewerPlan} from './core/plan-format.ts';
import {hasOwnerWork} from './core/plan.ts';
import {showEditorUpdateNotice} from './frontend-build.ts';
import type {PhotoStore} from './editor/underlay.ts';
import type {Router} from './editor/route.ts';
import type {HaLayer, Plan, PlanInput, PlanLight} from './core/types.ts';
import type {Editor, EditorFlows} from './editor/editor-types.ts';

/** A start screen example (D-062): its id, its plan, its plan photo (null: none) and its 3D render (D-113; null: none). */
export interface StartExample {
  id: string;
  plan: PlanInput;
  underlay: unknown;
  render?: string | null;
}

/**
 * Where else the plan is stored (ha-live.ts hassPlans): the plan there, given the browser's; and every save. The plans it
 * hands over are unchecked.
 */
export interface PlanStore {
  load(local: unknown): Promise<{plan?: unknown} | null>;
  save(plan: Plan): void;
}

/** What boot is given (the list at the top of this file). */
export interface BootOptions {
  ha: HaLayer;
  examples?: StartExample[];
  example?: string | null;
  router?: Router | null;
  gallery?: string | null;
  plans?: PlanStore | null;
  photos?: PhotoStore;
  onApp?: ((ed: Editor) => void) | null;
  onNewerPlan?: (() => void) | null;
  dev?: boolean;
}

declare global {
  interface Window {
    /** The editor and its steps, for checks in the browser's console. */
    editor?: {ed: Editor; flows: EditorFlows};
  }
}

export async function boot({
  ha,
  examples = [],
  example = null,
  router = null,
  gallery = null,
  plans = null,
  photos = undefined,
  onApp = null,
  onNewerPlan = null,
  dev = false,
}: BootOptions): Promise<Editor> {
  const haLights = (): PlanLight[] => haPlanLights(ha);
  translateDom(document.body); // static markup — in the user's language
  const ed = createApp({haLights, ha, photos});
  onApp?.(ed);
  const flows = createFlows(ed, {examples, example, router, gallery});
  ed.flows = flows;
  await loadKenney(MODELS);
  ed.thumbs = thumbnails();
  // plan: from HA (if available), otherwise the one saved in the browser; every browser save is sent there too
  // (plans.load gets the browser's plan: changes that did not reach HA last time — no connection — are not lost)
  // the plans come unchecked: canContinue below asks for a list of rooms, and setPlan migrates the rest
  let saved: PlanInput | null = null;
  if (plans) {
    try {
      saved = ((await plans.load(ed.history.load()))?.plan || null) as PlanInput | null;
    } catch {}
    const local = ed.history.save;
    ed.history.save = p => {
      plans.save(p);
      return local(p);
    };
  }
  keepNewerPlans(ed, onNewerPlan);
  saved ??= ed.history.load() as PlanInput | null;
  // "Continue" is offered for a plan the owner worked on: a room, a thing, a light put on it, or a placed plan photo. The plan
  // the app saved by itself on an earlier visit (only the lights from HA) starts afresh, as on the first visit.
  const savedPlan = saved && Array.isArray(saved.rooms) ? saved : null;
  const canContinue = !!savedPlan && ((await ed.underlay.load()) || hasOwnerWork(savedPlan));
  if (canContinue) {
    // canContinue: there is a saved plan the owner worked on
    if (!saved!.rooms?.length) ed.wizard.set(saved!.id, {open: false, names: false});
    ed.setPlan(saved!);
  } else ed.setPlan({});
  // undo steps from last time come from storage; the plan as it was at the end of last time becomes a version (if there is no such one yet)
  await ed.history.ready;
  await ed.versions.ready();
  ed.versions.mark('auto', null, {at: ed.history.lastAt()});
  flows.resume(); // the “Furniture”, “Lights”, “Devices”, “Sensors” steps — in their own mode
  flows.showStart({canContinue});
  if (dev) devPanel(ed, flows);
  window.editor = {ed, flows};
  document.body.dataset.ready = 'true';
  return ed;
}

// A plan of a newer format than this editor writes (D-121) — this tab is older than the plan: HA's plan was saved by a newer
// Home Twin in another window, or this browser ran a newer editor. It is shown as far as it can be, but never written back,
// in this browser or in HA: an older editor would drop or misread what it does not know. The user is told once.
function keepNewerPlans(ed: Editor, onNewerPlan: (() => void) | null): void {
  const save = ed.history.save;
  ed.history.save = plan => {
    if (!isNewerPlan(plan)) {
      ed.newerPlan = false;
      return save(plan);
    }
    if (!ed.newerPlan) {
      ed.newerPlan = true;
      if (onNewerPlan) onNewerPlan();
      else
        showEditorUpdateNotice({text: t('Home Twin was updated'), reload: t('Reload')}, () =>
          location.reload(),
        );
    }
    return true;
  };
}
