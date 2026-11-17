import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseRoute, routeHash, parsePanelPath, parsePanelAi, haRouter} from './route.ts';
import type {PanelRoute, Route} from './route.ts';

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

test("the panel's path: the AI build's page while it is open, the editor's page again once it closes", () => {
  const urls: string[] = [];
  const fakeWindow = {
    history: {
      pushState: (_state: unknown, _title: string, url: string) => urls.push('push ' + url),
      replaceState: (_state: unknown, _title: string, url: string) => urls.push('replace ' + url),
      state: null,
    },
    dispatchEvent: () => true,
  };
  const saved = globalThis.window;
  Object.defineProperty(globalThis, 'window', {value: {parent: fakeWindow}, configurable: true});
  try {
    const panel: {route: PanelRoute} = {route: {prefix: '/home-twin', path: '/lights'}};
    const router = haRouter(panel);
    const heard: (Route | null)[] = [];
    router.listen(route => heard.push(route));
    router.showAi('upload');
    // the editor writes its page under the AI build (the start screen hidden): the path stays the AI build's, no new step
    router.write({ex: null, page: 'plan'}, true);
    router.showAi({build: 'home-1'});
    // HA sets the route again after the write: not an editor page to go to
    router.route({prefix: '/home-twin', path: '/ai/home-1'});
    router.showAi(null);
    assert.deepEqual(urls, [
      'replace /home-twin/ai',
      'replace /home-twin/ai',
      'replace /home-twin/ai/home-1',
      'replace /home-twin/plan',
    ]);
    assert.deepEqual(heard, []);
    router.route({prefix: '/home-twin', path: '/furniture'});
    assert.deepEqual(heard, [{ex: null, page: 'furniture'}]);
  } finally {
    Object.defineProperty(globalThis, 'window', {value: saved, configurable: true});
  }
});
