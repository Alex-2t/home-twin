// The plan drawn on our site, kept on its account while signed in (D-134): so a home made here can be taken into Home
// Assistant later. In HA, signed in with the same account, it shows in "Version history" ("From twin.sync.md") with
// "Take". One plan per account: the latest your own work here; examples and published homes you play with stay out of it.
// Only the plan itself goes (rooms, furniture, lights, sensors); the plan photo under it stays in this browser.
//   GET <api>/api/account-plan → {plan, at}; 404 NO_PLAN; 401 SIGNED_OUT
//   PUT <api>/api/account-plan {plan} → {at}
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

/** The plan kept on the signed-in account; null when there is none, nobody is signed in, or the service has no such route. */
export async function fetchAccountPlan(api: string): Promise<KeptPlan | null> {
  const res = await fetch(`${api}/api/account-plan`, {cache: 'no-store'});
  if (!res.ok) return null;
  const data = (await res.json()) as Partial<KeptPlan>;
  if (!data.plan || !Array.isArray(data.plan.rooms) || typeof data.at !== 'number') return null;
  return {plan: data.plan, at: data.at};
}

/** Keeps the plan on the signed-in account → when; throws when it could not. */
export async function saveAccountPlan(api: string, plan: Plan): Promise<number> {
  const res = await fetch(`${api}/api/account-plan`, {
    method: 'PUT',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({plan}),
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
