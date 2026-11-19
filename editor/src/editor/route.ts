// The editor's address (D-066): the page that is open, so a reload, Back / Forward and a link keep it. Pages: the start screen, a mode
// (plan, furniture, lights, devices, sensors) or Preview; in the standalone editor also an example and the gallery (D-113).
//   standalone (hashRouter): a hash — it works on any static hosting (the online demo) without server rules
//     (none) — the start screen · #/plan … #/preview — your plan · #/example/<id>/<page> — an example (no page — Preview, an example opens in it)
//     · #/gallery — the gallery of homes · #/home/<id> — a home the gallery publishes, opened in Preview (a link to share it)
//   Home Assistant (haRouter): the panel's own path, as HA's own panels have — /home-twin, /home-twin/lights …
// A router: read() — the route in the address; write(route, push) — show one (push — a new step in the history, else the step is corrected);
// listen(cb) — the address was changed from outside (Back / Forward, a typed or followed link).
// The AI build is a page of its own over the editor, a step in the history too: Back closes it, Forward opens it again.
//   standalone: ?ai=new — the upload, ?build=<id> — a build (beside the editor's hash) · Home Assistant: /home-twin/ai, /home-twin/ai/<id>
export const PAGES = ['plan', 'furniture', 'lights', 'devices', 'sensors', 'preview'] as const;

/** A page in the address. */
export type RoutePage = (typeof PAGES)[number];

/** A page of the editor, or the gallery of homes (the standalone editor's only, D-113). */
export type RouteScreen = RoutePage | 'gallery';

/** The page that is open: an example's id (null: your plan, or the gallery) and the page. */
export interface Route {
  ex: string | null;
  page: RouteScreen;
  /** With the gallery: a home it publishes, to be opened (a shared link). Once open it is your copy, at #/preview. */
  home?: string;
}

const GALLERY_HASH = '#/gallery';

/** The AI build's page in the address: the upload, or a build (its progress, its review). */
export type AiPage = 'upload' | {build: string};

/**
 * The address: read the route in it, show one (push: a new step in the history), hear it changed from outside. The AI build's
 * page the same way: readAi, writeAi (null: closed, the editor's page again), and listen hears it with the editor's route.
 * back() — one step back, as the browser's Back.
 */
export interface Router {
  read(): Route | null;
  write(route: Route | null, push: boolean): void;
  listen(listener: (route: Route | null, ai: AiPage | null) => void): void;
  readAi(): AiPage | null;
  writeAi(page: AiPage | null, push: boolean): void;
  /** Whether the step shown now was made by opening the AI build (writeAi with push). */
  atAiStep(): boolean;
  back(): void;
}

/**
 * The page changed by Back / Forward or a followed link (flows.ts): a dialog over the page it left closes, so it does not wait
 * under the page shown now and come back over another one. Gives the way to stop listening, for a dialog closed otherwise.
 */
const ADDRESS_CHANGED = 'home-twin-address-changed';
export function closeOnAddressChange(close: () => void): () => void {
  addEventListener(ADDRESS_CHANGED, close, {once: true});
  return () => removeEventListener(ADDRESS_CHANGED, close);
}
export const tellAddressChanged = (): void => {
  dispatchEvent(new Event(ADDRESS_CHANGED));
};

/** The mark on the history step the AI build was opened with: its in-app Back goes back to the step before it. */
export const AI_STEP = 'home-twin-ai';
/** Whether this history step was made by opening the AI build. */
export const isAiStep = (state: unknown): boolean =>
  typeof state === 'object' && state !== null && (state as {homeTwin?: unknown}).homeTwin === AI_STEP;
const aiStepState = {homeTwin: AI_STEP};

/** The route HA sets on the panel: the panel's own path, and the rest of the address. */
export interface PanelRoute {
  prefix?: string;
  path?: string;
}

/** The HA panel's router: route() passes on each route HA sets on the panel. */
export interface PanelRouter extends Router {
  route(value: PanelRoute | null | undefined): void;
}

const PAGE_NAMES: readonly string[] = PAGES;
const isPage = (page: string): page is RoutePage => PAGE_NAMES.includes(page);

// A published home's address: its id as the gallery's list gives it (gallery.ts: lowercase letters, digits and hyphens).
const HOME_HASH = /^#\/home\/([a-z0-9][a-z0-9-]*)$/;

export function parseRoute(hash: string | null | undefined): Route | null {
  if (hash === GALLERY_HASH) return {ex: null, page: 'gallery'};
  const published = HOME_HASH.exec(hash || '');
  if (published) return {ex: null, page: 'gallery', home: published[1]};
  const m = /^#\/(?:example\/([a-z0-9-]+)(?:\/|$))?([a-z]*)$/.exec(hash || '');
  if (!m) return null;
  const page = m[2] || (m[1] ? 'preview' : '');
  return isPage(page) ? {ex: m[1] || null, page} : null;
}
export function routeHash(r: Route | null | undefined): string {
  if (!r) return '';
  if (r.page === 'gallery') return r.home ? `#/home/${r.home}` : GALLERY_HASH;
  return (r.ex ? `#/example/${r.ex}/` : '#/') + r.page;
}
export const parsePanelPath = (path: string | null | undefined): Route | null => {
  const p = String(path || '').replace(/^\/+|\/+$/g, '');
  return isPage(p) ? {ex: null, page: p} : null;
};

// The AI build in the panel's path: /home-twin/ai — the upload, /home-twin/ai/<build> — that build. A build's id as the service
// gives it: letters, digits and hyphens.
const AI_PATH = /^ai(?:\/([A-Za-z0-9-]+))?$/;
export function parsePanelAi(path: string | null | undefined): AiPage | null {
  const m = AI_PATH.exec(String(path || '').replace(/^\/+|\/+$/g, ''));
  if (!m) return null;
  return m[1] ? {build: m[1]} : 'upload';
}
const aiPath = (page: AiPage): string => (page === 'upload' ? '/ai' : '/ai/' + page.build);

// The AI build on our site, in the query: ?ai=new — the upload, ?build=<id> — that build.
const UPLOAD_PARAM = 'ai';
const UPLOAD_VALUE = 'new';
export function parseSearchAi(search: string | null | undefined): AiPage | null {
  const params = new URLSearchParams(search || '');
  const build = params.get('build');
  if (build) return {build};
  return params.get(UPLOAD_PARAM) === UPLOAD_VALUE ? 'upload' : null;
}
/** The address with the AI build's page in its query (null: none), the rest of it as it is. */
export function withSearchAi(address: string, page: AiPage | null): string {
  const url = new URL(address);
  url.searchParams.delete('build');
  url.searchParams.delete(UPLOAD_PARAM);
  if (page === 'upload') url.searchParams.set(UPLOAD_PARAM, UPLOAD_VALUE);
  else if (page) url.searchParams.set('build', page.build);
  return url.href;
}

export function hashRouter(): Router {
  return {
    read: () => parseRoute(location.hash),
    write: (r, push) =>
      history[push ? 'pushState' : 'replaceState'](
        null,
        '',
        routeHash(r) || location.pathname + location.search,
      ),
    listen: cb =>
      addEventListener('popstate', () => cb(parseRoute(location.hash), parseSearchAi(location.search))),
    readAi: () => parseSearchAi(location.search),
    writeAi: (page, push) => {
      const url = withSearchAi(location.href, page);
      if (push) history.pushState(aiStepState, '', url);
      else history.replaceState(history.state, '', url);
    },
    atAiStep: () => isAiStep(history.state),
    back: () => history.back(),
  };
}

// panel: <home-twin-panel> — HA sets route {prefix, path} on it and sets it again when the address changes. We go to another page as HA's
// navigate() does: the history of HA's window (the panel is in an iframe of the same origin) and 'location-changed' on it.
// HA passes the route on to the panel a moment later, so each of our own writes comes back as a route too, and after two quick
// writes the first one comes back when the address is already the second. Neither is a change from outside: answering them
// wrote the address again, HA set the route again, and the panel went to and fro between two pages without end (the owner:
// Back on the AI build's page). A route is passed on only when it is the address now and not the one written last.
export function haRouter(panel: {route?: PanelRoute | null}): PanelRouter {
  let cb: ((route: Route | null, ai: AiPage | null) => void) | null = null;
  // the editor's page as last written, and the AI build's page over it, if open
  let editorRoute: Route | null = parsePanelPath(panel.route?.path);
  let ai: AiPage | null = parsePanelAi(panel.route?.path);
  const prefix = (): string => panel.route?.prefix || '/home-twin';
  const trim = (path: string): string => (path.length > 1 ? path.replace(/\/+$/, '') : path);
  const page = (): Window => window.parent || window;
  const addressNow = (): string | null => {
    const where = page().location?.pathname;
    return where === undefined ? null : trim(where);
  };
  // the panel's address as last written or heard
  let known = trim(prefix() + (panel.route?.path || ''));
  const put = (push: boolean, state: unknown = null): void => {
    const w = page();
    const url = prefix() + (ai ? aiPath(ai) : editorRoute ? '/' + editorRoute.page : '');
    known = url;
    // already the address: no step, and no route from HA to answer
    if (addressNow() === url) return;
    if (push) w.history.pushState(state, '', url);
    else w.history.replaceState(w.history.state, '', url);
    w.dispatchEvent(new CustomEvent('location-changed', {detail: {replace: !push}}));
  };
  return {
    read: () => parsePanelPath(panel.route?.path),
    write: (r, push) => {
      editorRoute = r;
      put(push && !ai);
    },
    listen: f => {
      cb = f;
    },
    route: v => {
      const url = trim(prefix() + (v?.path || ''));
      if (url === known) return;
      const now = addressNow();
      if (now !== null && now !== url) return;
      known = url;
      const heardAi = parsePanelAi(v?.path);
      ai = heardAi;
      if (!heardAi) editorRoute = parsePanelPath(v?.path);
      cb?.(heardAi ? editorRoute : parsePanelPath(v?.path), heardAi);
    },
    readAi: () => parsePanelAi(panel.route?.path),
    writeAi: (next, push) => {
      ai = next;
      put(push && !!next, push && next ? aiStepState : null);
    },
    atAiStep: () => isAiStep(page().history.state),
    back: () => page().history.back(),
  };
}
