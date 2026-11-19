import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  parseRoute,
  routeHash,
  parsePanelPath,
  parsePanelAi,
  parseSearchAi,
  withSearchAi,
  haRouter,
} from './route.ts';
import type {AiPage, PanelRoute, Route} from './route.ts';

test('the address names the page: start screen, your plan in a mode, an example', () => {
  assert.equal(parseRoute(''), null);
  assert.equal(parseRoute('#/'), null, 'the start screen has no hash');
  assert.deepEqual(parseRoute('#/lights'), {ex: null, page: 'lights'});
  assert.deepEqual(
    parseRoute('#/example/loft'),
    {ex: 'loft', page: 'preview'},
    'an example opens in Preview',
  );
  assert.deepEqual(parseRoute('#/example/one-bed/furniture'), {ex: 'one-bed', page: 'furniture'});
  for (const bad of [
    '#/foo',
    '#/example',
    '#/example/loft/foo',
    '#/Lights',
    '#lights',
    '#/example/loft/lights/x',
  ])
    assert.equal(parseRoute(bad), null, bad);
  assert.deepEqual(parseRoute('#/gallery'), {ex: null, page: 'gallery'}, 'the gallery of homes (D-113)');
  for (const bad of ['#/gallery/', '#/example/loft/gallery', '#/galleryx'])
    assert.equal(parseRoute(bad), null, bad);
  assert.deepEqual(
    parseRoute('#/home/compact-one-bedroom'),
    {ex: null, page: 'gallery', home: 'compact-one-bedroom'},
    'a home the gallery publishes, by a shared link',
  );
  for (const bad of ['#/home/', '#/home/Loft', '#/home/a/b', '#/home/-x', '#/home/a.json'])
    assert.equal(parseRoute(bad), null, bad);
  for (const h of ['#/plan', '#/preview', '#/example/house/sensors', '#/gallery', '#/home/two-bed-flat'])
    assert.equal(routeHash(parseRoute(h)), h);
  assert.equal(routeHash(null), '');
});

test('in Home Assistant the page is the panel path', () => {
  assert.deepEqual(parsePanelPath('/lights'), {ex: null, page: 'lights'});
  assert.deepEqual(parsePanelPath('preview/'), {ex: null, page: 'preview'});
  for (const bad of ['', '/', '/foo', '/example/loft', '/gallery'])
    assert.equal(parsePanelPath(bad), null, bad);
});

test("in Home Assistant the AI build's page is in the panel path too, so a reload keeps it", () => {
  assert.equal(parsePanelAi('/ai'), 'upload');
  assert.deepEqual(parsePanelAi('ai/home-mwj0bwll/'), {build: 'home-mwj0bwll'});
  for (const bad of ['', '/plan', '/ai/x/y', '/aix', '/ai/a b']) assert.equal(parsePanelAi(bad), null, bad);
  // it is not an editor page
  assert.equal(parsePanelPath('/ai'), null);
});

/** A stand-in for HA's page: its history and address, the routes HA would pass on, and the steps made. */
function fakeHaPage(startPath: string) {
  const steps: string[] = [];
  const entries: {url: string; state: unknown}[] = [{url: startPath, state: null}];
  let at = 0;
  const page = {
    location: {
      get pathname() {
        return entries[at].url;
      },
    },
    history: {
      pushState: (state: unknown, _title: string, url: string) => {
        steps.push('push ' + url);
        entries.splice(at + 1);
        entries.push({url, state});
        at += 1;
      },
      replaceState: (state: unknown, _title: string, url: string) => {
        steps.push('replace ' + url);
        entries[at] = {url, state};
      },
      get state() {
        return entries[at].state;
      },
      back: () => {
        at -= 1;
      },
    },
    dispatchEvent: () => true,
  };
  return {page, steps};
}

function withPage<T>(page: unknown, run: () => T): T {
  const saved = globalThis.window;
  Object.defineProperty(globalThis, 'window', {value: {parent: page}, configurable: true});
  try {
    return run();
  } finally {
    Object.defineProperty(globalThis, 'window', {value: saved, configurable: true});
  }
}

test("the panel's path: the AI build's page is a step of its own, the editor's page again once it closes", () => {
  const {page, steps} = fakeHaPage('/home-twin');
  withPage(page, () => {
    const panel: {route: PanelRoute} = {route: {prefix: '/home-twin', path: ''}};
    const router = haRouter(panel);
    const heard: [Route | null, AiPage | null][] = [];
    router.listen((route, ai) => heard.push([route, ai]));
    router.writeAi('upload', true);
    assert.equal(router.atAiStep(), true, 'opened from the editor: its in-app Back goes back a step');
    router.writeAi({build: 'home-1'}, false);
    assert.equal(router.atAiStep(), true, 'the upload becoming a build keeps the step');
    // HA passes the routes on a moment later: echoes of our own writes, not changes from outside
    router.route({prefix: '/home-twin', path: '/ai'});
    router.route({prefix: '/home-twin', path: '/ai/home-1'});
    assert.deepEqual(heard, []);
    router.writeAi(null, false);
    router.write({ex: null, page: 'preview'}, false);
    assert.deepEqual(steps, [
      'push /home-twin/ai',
      'replace /home-twin/ai/home-1',
      'replace /home-twin',
      'replace /home-twin/preview',
    ]);
    // the first echo comes when the address is already the second: stale, not heard
    router.route({prefix: '/home-twin', path: ''});
    router.route({prefix: '/home-twin', path: '/preview'});
    assert.deepEqual(heard, []);
  });
});

test("the panel's route from outside is heard once, and answering it writes nothing (the loop on Back)", () => {
  const {page, steps} = fakeHaPage('/home-twin');
  withPage(page, () => {
    const panel: {route: PanelRoute} = {route: {prefix: '/home-twin', path: ''}};
    const router = haRouter(panel);
    const heard: [Route | null, AiPage | null][] = [];
    router.listen((route, ai) => {
      heard.push([route, ai]);
      // the editor answers with the address as it is now
      router.write(route, false);
    });
    router.writeAi('upload', true);
    router.back();
    router.route({prefix: '/home-twin', path: ''});
    // HA sets the same route again (another render): nothing new
    router.route({prefix: '/home-twin', path: ''});
    assert.deepEqual(heard, [[null, null]]);
    assert.deepEqual(
      steps,
      ['push /home-twin/ai'],
      'the answer is the address already: no step, no route from HA',
    );
    // a page of the editor by HA's sidebar or a link
    page.history.pushState(null, '', '/home-twin/furniture');
    router.route({prefix: '/home-twin', path: '/furniture'});
    assert.deepEqual(heard.at(-1), [{ex: null, page: 'furniture'}, null]);
  });
});

test("on our site the AI build is in the query, beside the editor's hash", () => {
  assert.equal(parseSearchAi('?ai=new'), 'upload');
  assert.deepEqual(parseSearchAi('?x=1&build=home-1'), {build: 'home-1'});
  assert.equal(parseSearchAi(''), null);
  assert.equal(parseSearchAi('?ai=old'), null);
  assert.equal(
    withSearchAi('https://twin.sync.md/?x=1#/plan', 'upload'),
    'https://twin.sync.md/?x=1&ai=new#/plan',
  );
  assert.equal(
    withSearchAi('https://twin.sync.md/?ai=new', {build: 'b-2'}),
    'https://twin.sync.md/?build=b-2',
  );
  assert.equal(withSearchAi('https://twin.sync.md/?build=b-2&x=1', null), 'https://twin.sync.md/?x=1');
});
