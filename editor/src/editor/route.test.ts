// @ts-nocheck
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseRoute, routeHash, parsePanelPath} from './route.ts';

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
  for (const h of ['#/plan', '#/preview', '#/example/house/sensors'])
    assert.equal(routeHash(parseRoute(h)), h);
  assert.equal(routeHash(null), '');
});

test('in Home Assistant the page is the panel path', () => {
  assert.deepEqual(parsePanelPath('/lights'), {ex: null, page: 'lights'});
  assert.deepEqual(parsePanelPath('preview/'), {ex: null, page: 'preview'});
  for (const bad of ['', '/', '/foo', '/example/loft']) assert.equal(parsePanelPath(bad), null, bad);
});
