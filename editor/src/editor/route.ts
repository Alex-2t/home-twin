// The editor's address (D-066): the page that is open, so a reload, Back / Forward and a link keep it. Pages: the start screen, a mode
// (plan, furniture, lights, devices, sensors) or Preview; in the standalone editor also an example and the gallery (D-113).
//   standalone (hashRouter): a hash — it works on any static hosting (the online demo) without server rules
//     (none) — the start screen · #/plan … #/preview — your plan · #/example/<id>/<page> — an example (no page — Preview, an example opens in it)
//     · #/gallery — the gallery of homes · #/home/<id> — a home the gallery publishes, opened in Preview (a link to share it)
//   Home Assistant (haRouter): the panel's own path, as HA's own panels have — /home-twin, /home-twin/lights …
// A router: read() — the route in the address; write(route, push) — show one (push — a new step in the history, else the step is corrected);
// listen(cb) — the address was changed from outside (Back / Forward, a typed or followed link).
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

/** The address: read the route in it, show one (push: a new step in the history), hear it changed from outside. */
export interface Router {
  read(): Route | null;
  write(route: Route | null, push: boolean): void;
  listen(listener: (route: Route | null) => void): void;
}

/** The route HA sets on the panel: the panel's own path, and the rest of the address. */
export interface PanelRoute {
  prefix?: string;
  path?: string;
}

/** The AI build's page in the address: the upload, or a build (its progress, its review). */
export type AiPage = 'upload' | {build: string};

/** The HA panel's router: route() passes on each route HA sets on the panel. */
export interface PanelRouter extends Router {
  route(value: PanelRoute | null | undefined): void;
  /**
   * The AI build's page over the editor (null: closed). The panel has one path, so while it is open the path names it, and
   * the editor's own page comes back when it closes. On our site the AI build keeps its page in ?ai= / ?build= instead.
   */
  showAi(page: AiPage | null): void;
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

export function hashRouter(): Router {
  return {
    read: () => parseRoute(location.hash),
    write: (r, push) =>
      history[push ? 'pushState' : 'replaceState'](
        null,
        '',
        routeHash(r) || location.pathname + location.search,
      ),
    listen: cb => addEventListener('popstate', () => cb(parseRoute(location.hash))),
  };
}

// panel: <home-twin-panel> — HA sets route {prefix, path} on it and sets it again when the address changes. We go to another page as HA's
// navigate() does: the history of HA's window (the panel is in an iframe of the same origin) and 'location-changed' on it.
export function haRouter(panel: {route?: PanelRoute | null}): PanelRouter {
  let cb: ((route: Route | null) => void) | null = null;
  // the editor's page as last written, and the AI build's page over it, if open
  let editorRoute: Route | null = parsePanelPath(panel.route?.path);
  let ai: AiPage | null = null;
  const put = (push: boolean): void => {
    const w = window.parent || window;
    const page = ai ? aiPath(ai) : editorRoute ? '/' + editorRoute.page : '';
    const url = (panel.route?.prefix || '/home-twin') + page;
    if (push) w.history.pushState(null, '', url);
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
    // HA sets the route again after each write: the AI build's own path is not an editor page to go to
    route: v => {
      if (parsePanelAi(v?.path)) return;
      cb?.(parsePanelPath(v?.path));
    },
    showAi: page => {
      ai = page;
      put(false);
    },
  };
}
