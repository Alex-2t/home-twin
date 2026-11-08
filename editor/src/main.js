// Standalone editor app: demo HA data and the demo apartment (build.mjs builds them into gen/), plan in the browser.
import './i18n/boot.js'; // language first (D-036)
import {boot} from './boot.js';
import {mockHA} from './editor/ha.js';
import {DEMO,HA,DEMO_UNDERLAY} from './gen/demo.gen.js';

// Home Assistant is not connected — demo data through the same interface as the real one (editor/ha.js, ha-live.js).
const ha=mockHA(HA);
// demo: lamp state “in HA” is the plan's lamps
await boot({ha,demo:DEMO,demoUnderlay:DEMO_UNDERLAY,dev:true,onApp:ed=>ha._lightsFrom(()=>ed.plan.lights)});
