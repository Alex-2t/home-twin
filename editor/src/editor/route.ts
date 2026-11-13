// The editor's address (D-066): the page that is open, so a reload, Back / Forward and a link keep it. Pages: the start screen, a mode
// (plan, furniture, lights, devices, sensors) or Preview; in the standalone editor also an example.
//   standalone (hashRouter): a hash — it works on any static hosting (the online demo) without server rules
//     (none) — the start screen · #/plan … #/preview — your plan · #/example/<id>/<page> — an example (no page — Preview, an example opens in it)
//   Home Assistant (haRouter): the panel's own path, as HA's own panels have — /home-twin, /home-twin/lights …
// A router: read() — the route in the address; write(route, push) — show one (push — a new step in the history, else the step is corrected);
// listen(cb) — the address was changed from outside (Back / Forward, a typed or followed link).
export const PAGES = ['plan', 'furniture', 'lights', 'devices', 'sensors', 'preview'] as const;

/** A page in the address. */
export type RoutePage = (typeof PAGES)[number];

/** The page that is open: an example's id (null: your plan) and the page. */
export interface Route {
  ex: string | null;
  page: RoutePage;
}

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

/** The HA panel's router: route() passes on each route HA sets on the panel. */
export interface PanelRouter extends Router {
  route(value: PanelRoute | null | undefined): void;
}

const PAGE_NAMES: readonly string[] = PAGES;
const isPage = (page: string): page is RoutePage => PAGE_NAMES.includes(page);

export function parseRoute(hash: string | null | undefined): Route | null {
  const m = /^#\/(?:example\/([a-z0-9-]+)(?:\/|$))?([a-z]*)$/.exec(hash || '');
  if (!m) return null;
  const page = m[2] || (m[1] ? 'preview' : '');
  return isPage(page) ? {ex: m[1] || null, page} : null;
}
export const routeHash = (r: Route | null | undefined): string =>
  r ? (r.ex ? `#/example/${r.ex}/` : '#/') + r.page : '';
export const parsePanelPath = (path: string | null | undefined): Route | null => {
  const p = String(path || '').replace(/^\/+|\/+$/g, '');
  return isPage(p) ? {ex: null, page: p} : null;
};

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
  return {
    read: () => parsePanelPath(panel.route?.path),
    write: (r, push) => {
      const w = window.parent || window;
      const url = (panel.route?.prefix || '/home-twin') + (r ? '/' + r.page : '');
      if (push) w.history.pushState(null, '', url);
      else w.history.replaceState(w.history.state, '', url);
      w.dispatchEvent(new CustomEvent('location-changed', {detail: {replace: !push}}));
    },
    listen: f => {
      cb = f;
    },
    route: v => cb?.(parsePanelPath(v?.path)),
  };
}
