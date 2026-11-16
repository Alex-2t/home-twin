// The AI build from Home Assistant's panel (D-130), both ends of it. The messages themselves are ha-handoff.ts.
//   The panel: "Build with AI" opens the build on our site in a new tab; a home the site sends replaces the plan (asked first
//              when the plan has rooms), and the owner is led to link its rooms to Home Assistant's areas.
//   The site:  a tab opened from the panel offers "Send to Home Assistant" when the home is ready, and in the plan menu.
import {t} from '../i18n/i18n.ts';
import {readPlan} from '../core/plan-file.ts';
import {NewerPlanError, newerPlanText} from '../core/plan-format.ts';
import {
  aiServiceAddress,
  aiServiceReachable,
  openAiBuildTab,
  openerWindow,
  receiveHomes,
  sendHomeToNewTab,
  sendHomeToOpener,
} from './ha-handoff.ts';
import type {Plan} from '../core/types.ts';
import type {Editor} from './editor-types.ts';
import type {SendResult} from './ha-handoff.ts';

// ---------- the panel in Home Assistant ----------

/**
 * Offers the AI build on the panel's start screen where the service can be reached, and takes the homes it sends. Returns the
 * function that stops taking them, for when the panel closes.
 */
export function aiBuildInPanel(ed: Editor, top: Window): () => void {
  const service = aiServiceAddress();
  aiServiceReachable(service).then(reachable => {
    if (!reachable) return;
    ed.flows.offerAi(card => {
      card.onclick = () => openAiBuildTab(service, top);
    });
  });
  return receiveHomes(service, top, plan => takeAiHome(ed, plan));
}

/** A home the site sent: checked as a plan file is, then opened in place of the plan (asked first when it has rooms). */
function takeAiHome(ed: Editor, sent: unknown): void {
  // the start screen would cover the question (and the home): the plan open now is shown under it, as "Continue" does
  ed.flows.hideStart();
  let plan: Plan;
  try {
    plan = readPlan(JSON.stringify(sent));
  } catch (error) {
    const text = error instanceof NewerPlanError ? newerPlanText() : t("This isn't a plan file.");
    ed.banner(text, [[t('Got it'), () => ed.banner(), true]]);
    return;
  }
  if (!ed.plan.rooms.length) {
    open(ed, plan);
    return;
  }
  ed.banner(t('A home built by AI arrived. Replace your plan with it?'), [
    [t('Replace'), () => open(ed, plan), true],
    [t('Keep mine'), () => ed.banner()],
  ]);
}

/** Opens the home, the 3D large as the site shows a finished build, and offers the step that links its rooms to HA. */
async function open(ed: Editor, plan: Plan): Promise<void> {
  ed.banner();
  ed.exitWizard();
  await ed.flows.takePlan(plan, 'aiHome');
  ed.setMain('3d');
  ed.view.home();
  ed.banner(t('Your home is here. Link its rooms to Home Assistant.'), [
    [
      t('Link rooms'),
      () => {
        ed.banner();
        // rooms are linked by clicking them on the plan
        ed.setMain('plan');
        ed.path.go('names');
      },
      true,
    ],
    [t('Later'), () => ed.banner()],
  ]);
}

// ---------- the site, in a tab opened from the panel ----------

/** "Send to Home Assistant": to the panel that opened this tab, else to a Home Assistant tab this one opens. */
export function sendToHa(ed: Editor, haOrigin: string): void {
  // a copy of plain data: the message carries it to the other window
  const plan = JSON.parse(JSON.stringify(ed.plan)) as Plan;
  if (!openerWindow()) {
    // straight from the click: a browser opens a tab only then
    void toNewTab(ed, plan, haOrigin);
    return;
  }
  ed.banner(t('Sending to Home Assistant…'));
  void sendHomeToOpener(plan, haOrigin).then(result => {
    if (result === 'sent') return sent(ed);
    ed.banner(t('Home Assistant did not answer.'), [
      [t('Open Home Assistant'), () => toNewTab(ed, plan, haOrigin), true],
    ]);
  });
}

/** Opens Home Assistant in a tab of its own and sends the home there; says what became of it. */
async function toNewTab(ed: Editor, plan: Plan, haOrigin: string): Promise<void> {
  ed.banner(t('Waiting for Home Assistant. Sign in there if it asks.'));
  const result: SendResult = await sendHomeToNewTab(plan, haOrigin);
  if (result === 'sent') return sent(ed);
  const text =
    result === 'blocked'
      ? t('Allow pop-ups for this site, then try again.')
      : t('Home Assistant did not answer.');
  ed.banner(text, [[t('Try again'), () => toNewTab(ed, plan, haOrigin), true]]);
}

function sent(ed: Editor): void {
  ed.banner(t('Your home is in Home Assistant.'), [[t('Got it'), () => ed.banner(), true]]);
}
