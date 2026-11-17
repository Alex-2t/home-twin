// The AI build in Home Assistant's panel (D-132). The same screens as on our site, reached through the integration: it keeps
// the account's session for the whole home and passes the panel's requests on to our service
// (custom_components/home_twin/ai.py). The panel gets a key for those addresses (home_twin/ai/key), so the screens' plain
// addresses — images, uploads, the account — work as they are, with the proxy's address in front.
import {aiService, aiStartCard, openAiBuild} from './ai-build.ts';
import {watchFixes} from './ai-fix.ts';
import type {Hass} from '../core/types.ts';
import type {Editor} from './editor-types.ts';
import type {AiPage} from './route.ts';

/** home_twin/ai/key's answer. */
interface AiKey {
  key: string;
  /** The proxy's address, the key goes after it. */
  base: string;
}

/** The proxy's address for this panel, or null where the integration has no AI build (an older one, before a restart). */
async function proxyAddress(hass: Hass): Promise<string | null> {
  try {
    const answer = (await hass.callWS({type: 'home_twin/ai/key'})) as AiKey;
    return answer.base + encodeURIComponent(answer.key);
  } catch {
    return null;
  }
}

/**
 * Offers the AI build on the panel's start screen where our service answers, and the developer's fixes to a home it built.
 * at: the AI build's page the panel's path names (a reload on it): opened again.
 */
export async function aiBuildInPanel(ed: Editor, hass: Hass, at: AiPage | null = null): Promise<void> {
  const api = await proxyAddress(hass);
  if (!api || !(await aiService(api))) {
    // no AI build here (now): the path goes back to the editor's page
    if (at) ed.flows.aiAddress(null);
    return;
  }
  ed.flows.offerAi(card => aiStartCard(ed, card, {api, inHa: true}));
  if (at) openAiBuild(ed, {api, id: at === 'upload' ? null : at.build, inHa: true});
  // a home taken from the AI build is offered the developer's fixes of its pins (D-129)
  watchFixes(ed, {api});
}
