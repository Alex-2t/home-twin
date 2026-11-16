// The AI build from Home Assistant (D-130). The build runs on our site, where the owner is signed in (its session cookie is
// first-party only there: Safari and Firefox would not send it to the site from a Home Assistant page). So the panel's
// "Build with AI" opens the site in a new tab, and the finished home comes back to the panel as a message between the two
// windows, never as a file:
//   1. The panel opens <service>/?ai=new&ha=<HA's address>. The site keeps that address for the tab (sessionStorage), so it
//      survives a sign-in or the checkout on other sites.
//   2. "Send to Home Assistant" posts {kind: 'home', plan} to the window that opened the tab, only to HA's address.
//   3. The panel answers {kind: 'received'} at once, then takes the home.
//   4. No answer (that window was closed or reloaded, the panel is not open there, a sign-in on another site cut the link):
//      "Open Home Assistant" opens HA's /home-twin in a tab of its own (a click of its own: Safari opens a tab only straight
//      from a click). The panel there says {kind: 'ready'} to the window that opened it, and the home is sent to it.
// Each side takes a message only from the other's address, so no other page can send a home or read one.
import type {Plan} from '../core/types.ts';

/** The AI build's service the Home Assistant panel uses. */
export const AI_SERVICE = 'https://twin.sync.md';
/** A developer points the panel at another service (staging, local work) with this key in HA's localStorage. */
export const AI_SERVICE_KEY = 'home-twin:ai-service';
/** The parameter that carries Home Assistant's address to the site. */
export const HA_PARAM = 'ha';
/** The tab the panel opens the site in: "Build with AI" again goes to the same tab. */
const AI_TAB = 'home-twin-ai';
/** The tab the site opens Home Assistant in when the window that opened it does not answer. */
const HA_TAB = 'home-twin-ha';
/** Where the site keeps Home Assistant's address for the tab. */
const HA_ORIGIN_KEY = 'home-twin:ha-origin';
/** The panel's address in Home Assistant. */
const PANEL_PATH = '/home-twin';
/** Every message carries this, so other messages a window gets are left alone. */
const HANDOFF = 'home-twin-handoff';

/** How long the window that opened the site has to answer: the panel answers at once when it is open there. */
const OPENER_ANSWER_MS = 3000;
/** How long a Home Assistant tab the site opened has to say it is ready: the owner may have to sign in to HA first. */
const NEW_TAB_ANSWER_MS = 180_000;

/** A message between the site and the panel. */
export type HandoffMessage =
  | {type: typeof HANDOFF; kind: 'ready'}
  | {type: typeof HANDOFF; kind: 'received'}
  | {type: typeof HANDOFF; kind: 'home'; plan: unknown};

/** What became of a home sent to Home Assistant. */
export type SendResult = 'sent' | 'no-answer' | 'blocked';

/** The message, or null when it is not one of ours. */
export function handoffMessage(data: unknown): HandoffMessage | null {
  if (typeof data !== 'object' || data === null) return null;
  const message = data as {type?: unknown; kind?: unknown; plan?: unknown};
  if (message.type !== HANDOFF) return null;
  if (message.kind === 'ready' || message.kind === 'received') return {type: HANDOFF, kind: message.kind};
  if (message.kind === 'home' && typeof message.plan === 'object' && message.plan !== null)
    return {type: HANDOFF, kind: 'home', plan: message.plan};
  return null;
}

const ready = (): HandoffMessage => ({type: HANDOFF, kind: 'ready'});
const received = (): HandoffMessage => ({type: HANDOFF, kind: 'received'});
const home = (plan: Plan): HandoffMessage => ({type: HANDOFF, kind: 'home', plan});

/** An address's origin when it is a web address (http or https), else null. */
export function webOrigin(address: string | null | undefined): string | null {
  if (!address) return null;
  try {
    const url = new URL(address);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** The address the panel opens: the site's upload, told Home Assistant's address. */
export function aiBuildLink(service: string, haOrigin: string): string {
  const url = new URL('/', service);
  url.searchParams.set('ai', 'new');
  url.searchParams.set(HA_PARAM, haOrigin);
  return url.href;
}

// ---------- Home Assistant's side: the panel ----------

/** The service the panel uses: ours, or the one a developer set in HA's localStorage. */
export function aiServiceAddress(): string {
  let set: string | null = null;
  try {
    set = localStorage.getItem(AI_SERVICE_KEY);
  } catch {}
  return webOrigin(set) || AI_SERVICE;
}

/**
 * Whether the service can be reached from here. Its answer cannot be read from Home Assistant's page (the service does not
 * share it with other sites), but a request that comes back at all says the site is there.
 */
export async function aiServiceReachable(service: string): Promise<boolean> {
  try {
    await fetch(`${service}/api/health`, {mode: 'no-cors', cache: 'no-store'});
    return true;
  } catch {
    return false;
  }
}

/** Opens the AI build in its tab. Home Assistant's page is the window that opens it: a message to it reaches the panel. */
export function openAiBuildTab(service: string, top: Window): void {
  top.open(aiBuildLink(service, top.location.origin), AI_TAB);
}

/**
 * The panel takes homes the site sends: from the service's address only, to Home Assistant's page (the panel listens there,
 * its own iframe is not the window the site knows). A Home Assistant tab the site opened says it is ready. Returns the
 * function that stops listening, for when the panel closes.
 */
export function receiveHomes(service: string, top: Window, onHome: (plan: unknown) => void): () => void {
  const onMessage = (event: MessageEvent): void => {
    if (event.origin !== service) return;
    const message = handoffMessage(event.data);
    if (message?.kind !== 'home') return;
    (event.source as Window | null)?.postMessage(received(), service);
    onHome(message.plan);
  };
  top.addEventListener('message', onMessage);
  // A tab the site opened: the site waits for this before it sends the home. Any other opener is not the service's page,
  // and the browser does not deliver a message to a window of another address.
  top.opener?.postMessage(ready(), service);
  return () => top.removeEventListener('message', onMessage);
}

// ---------- the site's side ----------

/**
 * Home Assistant's address for this tab: taken from the page's address the first time (and taken off it, so a link copied
 * from the address bar does not carry it), kept for the tab after that.
 */
export function haOriginOfTab(): string | null {
  const url = new URL(location.href);
  const given = webOrigin(url.searchParams.get(HA_PARAM));
  if (url.searchParams.has(HA_PARAM)) {
    url.searchParams.delete(HA_PARAM);
    history.replaceState(history.state, '', url);
  }
  try {
    if (given) sessionStorage.setItem(HA_ORIGIN_KEY, given);
  } catch {}
  return given || keptHaOrigin();
}

/** Home Assistant's address kept for this tab (haOriginOfTab took it), or null: the tab was not opened from the panel. */
export function keptHaOrigin(): string | null {
  try {
    return webOrigin(sessionStorage.getItem(HA_ORIGIN_KEY));
  } catch {
    return null;
  }
}

/**
 * The panel's answer, from Home Assistant's address; false when none comes in time. Its address is what is checked, not the
 * window: the panel answers from its own iframe, so the message's source is that iframe, not the HA page this tab knows.
 */
function answerFrom(haOrigin: string, kind: 'ready' | 'received', waitMs: number): Promise<boolean> {
  return new Promise(resolve => {
    const onMessage = (event: MessageEvent): void => {
      if (event.origin !== haOrigin) return;
      if (handoffMessage(event.data)?.kind !== kind) return;
      finish(true);
    };
    const timer = setTimeout(() => finish(false), waitMs);
    function finish(answered: boolean): void {
      clearTimeout(timer);
      removeEventListener('message', onMessage);
      resolve(answered);
    }
    addEventListener('message', onMessage);
  });
}

/** Sends the home to one window and waits for the panel there to say it has it. */
async function sendTo(target: Window, haOrigin: string, plan: Plan): Promise<boolean> {
  const answered = answerFrom(haOrigin, 'received', OPENER_ANSWER_MS);
  target.postMessage(home(plan), haOrigin);
  return answered;
}

/** The window that opened this tab, while it is still there: the home is sent to it first. */
export function openerWindow(): Window | null {
  const opener = window.opener as Window | null;
  return opener && !opener.closed ? opener : null;
}

/** Sends the home to the window that opened this tab: 'sent' once the panel there has it. */
export async function sendHomeToOpener(plan: Plan, haOrigin: string): Promise<SendResult> {
  const opener = openerWindow();
  if (!opener) return 'no-answer';
  return (await sendTo(opener, haOrigin, plan)) ? 'sent' : 'no-answer';
}

/**
 * Opens Home Assistant's panel in a tab of its own and sends the home there once the panel is ready (the owner may sign in to
 * HA first). The tab is opened before anything is awaited: call it straight from a click, as browsers open a tab only then.
 */
export async function sendHomeToNewTab(plan: Plan, haOrigin: string): Promise<SendResult> {
  const tab = window.open(`${haOrigin}${PANEL_PATH}`, HA_TAB);
  if (!tab) return 'blocked';
  if (!(await answerFrom(haOrigin, 'ready', NEW_TAB_ANSWER_MS))) return 'no-answer';
  return (await sendTo(tab, haOrigin, plan)) ? 'sent' : 'no-answer';
}
