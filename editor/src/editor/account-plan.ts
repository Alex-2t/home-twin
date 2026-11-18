// The plan drawn on our site, kept on its account while signed in (D-134): so a home made here can be taken into Home
// Assistant later. In HA, signed in with the same account, it shows in "Version history" ("From twin.sync.md") with
// "Take". Each browser keeps its own plan there (a device id made once per browser), so signing in on another browser
// with another plan does not replace this one's; the service keeps the latest few. Only your own work here goes: examples
// and published homes you play with stay out of it. Only the plan itself goes (rooms, furniture, lights, sensors); the plan
// photo under it stays in this browser.
//   GET <api>/api/account-plan → {plan, at, plans: [{plan, at}]} (a service from before: {plan, at}); 404 NO_PLAN;
//   401 SIGNED_OUT
//   PUT <api>/api/account-plan {plan, device} → {at}
import type {Plan} from '../core/types.ts';
import type {Editor} from './editor-types.ts';
import {currentAccount} from './ai-account.ts';

/** Said on the page when the account changed (ai-build.ts ACCOUNT_CHANGED; kept here so this module needs nothing of that one). */
const ACCOUNT_CHANGED = 'home-twin:account-changed';

/** A plan kept on the account, and when it was saved (ms). */
export interface KeptPlan {
  plan: Plan;
  at: number;
}

/** How often the site looks for changes to keep; the account is asked again every ACCOUNT_EVERY of these. */
const KEEP_EVERY_MS = 4000;
const ACCOUNT_EVERY = 8;

/** Whether a value is a plan kept on the account: a plan with rooms, and when. */
function isKeptPlan(value: unknown): value is KeptPlan {
  const kept = value as Partial<KeptPlan> | null;
  if (!kept || typeof kept !== 'object') return false;
  return !!kept.plan && Array.isArray(kept.plan.rooms) && typeof kept.at === 'number';
}

/** The plans kept on the signed-in account, the newest first; [] when there are none, nobody is signed in, or the service
 * has no such route. */
export async function fetchAccountPlans(api: string): Promise<KeptPlan[]> {
  const res = await fetch(`${api}/api/account-plan`, {cache: 'no-store'});
  if (!res.ok) return [];
  const data = (await res.json()) as Partial<KeptPlan> & {plans?: unknown};
  // a service from before the list keeps one plan
  const plans = Array.isArray(data.plans) ? data.plans : [data];
  return plans.filter(isKeptPlan).map(kept => ({plan: kept.plan, at: kept.at}));
}

/** Where this browser keeps its id for the account's plans. */
const DEVICE_KEY = 'home-twin:plan-device';

/** This browser's id among the account's plans: made once and kept; a page that cannot keep it gets one for its own life. */
let pageDevice: string | null = null;
export function browserDevice(): string {
  try {
    const kept = localStorage.getItem(DEVICE_KEY);
    if (kept) return kept;
  } catch {} // storage blocked: the page's own id below
  pageDevice ??= Math.random().toString(36).slice(2) + Date.now().toString(36);
  try {
    localStorage.setItem(DEVICE_KEY, pageDevice);
  } catch {}
  return pageDevice;
}

/** Keeps the plan on the signed-in account as this browser's → when; throws when it could not. */
export async function saveAccountPlan(api: string, plan: Plan, device = browserDevice()): Promise<number> {
  const res = await fetch(`${api}/api/account-plan`, {
    method: 'PUT',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({plan, device}),
  });
  if (!res.ok) throw new Error(`account plan: ${res.status}`);
  return ((await res.json()) as {at: number}).at;
}

/**
 * On our site (not in Home Assistant, where the plan lives in HA): while someone is signed in, their own plan goes to their
 * account a few seconds after each change. Signed out, or an example being played with: nothing goes.
 */
export function keepPlanOnAccount(ed: Editor, {api = ''}: {api?: string} = {}): void {
  let signedIn = false;
  let looksSinceAccount = ACCOUNT_EVERY;
  // the step kept last: another step is another change
  let keptStep: number | null = null;
  let busy = false;

  const setKept = (kept: boolean): void => {
    if (ed.keptOnAccount === kept) return;
    ed.keptOnAccount = kept;
    ed.syncSave();
  };

  async function look(): Promise<void> {
    if (busy || document.hidden) return;
    busy = true;
    try {
      if (looksSinceAccount >= ACCOUNT_EVERY) {
        looksSinceAccount = 0;
        signedIn = !!(await currentAccount(api).catch(() => null));
      }
      looksSinceAccount++;
      const yours = !!ed.flows?.isYours(ed.plan);
      setKept(signedIn && yours && keptStep !== null);
      if (!signedIn || !yours) return;
      const step = ed.history.step();
      if (step === keptStep) return;
      await saveAccountPlan(api, ed.plan);
      keptStep = step;
      setKept(true);
    } catch {
      setKept(false); // the next look tries again
    } finally {
      busy = false;
    }
  }

  setInterval(look, KEEP_EVERY_MS);
  // back to the page, or signed in or out here: the account is asked again at once
  const askAgain = (): void => {
    looksSinceAccount = ACCOUNT_EVERY;
    look();
  };
  document.addEventListener('visibilitychange', askAgain);
  addEventListener(ACCOUNT_CHANGED, askAgain);
  look();
}
