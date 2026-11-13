// Standalone editor app: demo HA data and the demo apartment (build.mjs builds them into gen/), plan in the browser.
import './i18n/boot.js'; // language first (D-036)
import {boot} from './boot.js';
import {mockHA} from './editor/ha.js';
import {DEMO_NAME, DEMO, HA, DEMO_UNDERLAY} from './gen/demo.gen.js';
import {EXAMPLES} from './gen/examples.gen.js';
import {hashRouter} from './editor/route.js';
import {openAiFromAddress, aiService, aiStartCard} from './editor/ai-build.js';

// The start screen's examples (D-062): the ten typical homes, and first the build's demo apartment if it is not one of them (own.mjs).
// Home Assistant is not connected — each example's own demo data through the same interface as the real one (editor/ha.js, ha-live.js).
// The example in the address (#/example/<id>, D-066) or else the one opened last: after a reload its plan meets its own lights, sensors and devices.
const list = [
  ...(DEMO_NAME === 'typical' ? [] : [{id: 'demo', HA, DEMO, UNDERLAY: DEMO_UNDERLAY}]),
  ...EXAMPLES,
];
const router = hashRouter(),
  inAddress = router.read()?.ex;
let picked = list.some(x => x.id === inAddress) ? inAddress : null;
try {
  if (picked) localStorage.setItem('home-twin-editor:example', picked);
  else picked = localStorage.getItem('home-twin-editor:example');
} catch {}
const cur =
  list.find(x => x.id === picked) || list.find(x => x.id === (DEMO_NAME === 'typical' ? 'family' : 'demo'));
const ha = mockHA(cur.HA);
// demo: lamp state “in HA” is the plan's lamps
const ed = await boot({
  ha,
  examples: list.map(x => ({id: x.id, plan: x.DEMO, underlay: x.UNDERLAY || null})),
  example: cur.id,
  router,
  dev: true,
  onApp: ed => ha._lightsFrom(() => ed.plan.lights),
});
// The AI build (D-072, D-073, D-074): offered on the start screen where its service answers (locally: the harness's build server
// serves this page), with the build on its way if there is one; ?build=<id> opens that build's progress, and back from the
// checkout (?payment_id=…) the payment is counted, then the build or the upload opens (D-086).
aiService().then(ok => {
  if (ok) ed.flows.offerAi(card => aiStartCard(ed, card));
});
openAiFromAddress(ed);
