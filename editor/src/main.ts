// Standalone editor app: demo HA data and the demo apartment (build.ts builds them into gen/), plan in the browser.
import './i18n/boot.ts'; // language first (D-036)
import {boot} from './boot.ts';
import {mockHA} from './editor/ha.ts';
import {DEMO_NAME, DEMO, HA, DEMO_UNDERLAY} from './gen/demo.gen.js';
import {EXAMPLES} from './gen/examples.gen.js';
import {hashRouter} from './editor/route.ts';
import {linkWindows} from './editor/link.ts';
import {openAiFromAddress, openAiBuild, aiService, aiStartCard} from './editor/ai-build.ts';
import {watchFixes} from './editor/ai-fix.ts';
import {keepPlanOnAccount} from './editor/account-plan.ts';
import {localizeDemo} from './i18n/demo-names.ts';
import {getLang} from './i18n/i18n.ts';
import type {ExampleHome} from './core/types.ts';

/** A home the standalone editor can open: an example, or the build's own demo home with its plan photo. */
type StartHome = ExampleHome & {UNDERLAY?: unknown};

// The start screen's examples (D-062): the ten typical homes, and first the build's demo apartment if it is not one of them (own.ts).
// Home Assistant is not connected — each example's own demo data through the same interface as the real one (editor/ha.js, ha-live.js).
// The example in the address (#/example/<id>, D-066) or else the one opened last: after a reload its plan meets its own lights, sensors and devices.
const own: StartHome = {id: 'demo', HA, DEMO, UNDERLAY: DEMO_UNDERLAY};
// The examples' rooms, lamps and devices are named in the UI language (D-120); the build's own home keeps the names it has.
const examples: StartHome[] = EXAMPLES.map(example => localizeDemo(example, getLang()));
const list: StartHome[] = [...(DEMO_NAME === 'typical' ? [] : [own]), ...examples];
const router = hashRouter();
const inAddress = router.read()?.ex;
let picked: string | null | undefined = list.some(x => x.id === inAddress) ? inAddress : null;
try {
  if (picked) localStorage.setItem('home-twin-editor:example', picked);
  else picked = localStorage.getItem('home-twin-editor:example');
} catch {}
// the usual fallback: 'family' (the typical demo) is one of the typical homes, 'demo' the build's own. A home whose module failed
// to load is left out of the examples (build.ts): then the first one there, and with none at all, the build's own demo home.
const usual = DEMO_NAME === 'typical' ? 'family' : 'demo';
const cur = list.find(x => x.id === picked) || list.find(x => x.id === usual) || list[0] || own;
const ha = mockHA(cur.HA);
// demo: lamp state “in HA” is the plan's lamps
// The gallery (D-113): the homes the server this page comes from publishes beside it (gallery/index.json); where there is
// none (a file, local work) the gallery shows the examples alone.
const galleryIndex = new URL('gallery/index.json', location.href).href;
const ed = await boot({
  ha,
  examples: list.map(x => ({id: x.id, plan: x.DEMO, underlay: x.UNDERLAY || null, render: x.render || null})),
  example: cur.id,
  router,
  gallery: galleryIndex,
  dev: true,
  onApp: ed => ha._lightsFrom(() => ed.plan.lights),
});
// A page that shows this home twice (a desktop window and a phone, ?link=<id>) gets one home in both (D-118).
linkWindows(ha, ed);
// The AI build (D-072, D-073, D-074): offered on the start screen where its service answers (locally: the harness's build server
// serves this page), with the build on its way if there is one; ?build=<id> opens that build's progress, ?ai=new the upload.
// Back from the checkout (?payment_id=…) the payment is counted on the account, then the page it left opens again (D-086,
// D-088); back from a sign-in with Google or GitHub, the same page opens signed in.
aiService().then(ok => {
  if (!ok) return;
  ed.flows.offerAi(card => aiStartCard(ed, card));
  // Forward back to the AI build's page (?ai=new, ?build=<id>): it opens again
  ed.flows.onAiAddress(page => {
    openAiBuild(ed, {id: page === 'upload' ? null : page.build, fromAddress: true});
  });
  // signed in on our site, your plan is kept on your account, to take into Home Assistant later (D-134)
  keepPlanOnAccount(ed);
  // a home taken from the AI build is offered the developer's fixes of its pins (D-129)
  watchFixes(ed);
});
openAiFromAddress(ed);
