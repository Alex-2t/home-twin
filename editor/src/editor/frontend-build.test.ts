// The panel and the card know their own build from their address and learn when HA serves a newer one (frontend-build.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildOf, noticeLang, watchBuild} from '../frontend-build.ts';
import type {Hass, HassMessage} from '../core/types.ts';

test('the build is the folder of the address the integration serves a file at', () => {
  assert.equal(buildOf('http://ha.local:8123/home_twin_static/3f9a0c12be47/panel.js'), '3f9a0c12be47');
  assert.equal(buildOf('https://x.ui.nabu.casa/home_twin_static/3f9a0c12be47/card-app.js'), '3f9a0c12be47');
  // the address before builds had folders, the standalone app, another integration's file
  assert.equal(buildOf('http://ha.local:8123/home_twin_static/card.js?v=1794633260'), null);
  assert.equal(buildOf('http://localhost:8766/index.html'), null);
  assert.equal(buildOf('http://ha.local:8123/hacsfiles/other/card.js'), null);
});

test('the notice is in HA’s language, its base, or English', () => {
  const languages = ['en', 'de', 'pt', 'zh'];
  assert.equal(noticeLang('de', languages), 'de');
  assert.equal(noticeLang('pt-BR', languages), 'pt');
  assert.equal(noticeLang('zh-Hans', languages), 'zh');
  assert.equal(noticeLang('sv', languages), 'en');
  assert.equal(noticeLang(undefined, languages), 'en');
});

/** A hass whose home_twin/frontend/subscribe the test drives: send() is HA telling the build it serves. */
function fakeHass(answer: 'ok' | 'unknown'): {
  hass: Hass;
  send: (message: unknown) => void;
  asked: HassMessage[];
} {
  let listener: ((message: unknown) => void) | null = null;
  const asked: HassMessage[] = [];
  const hass = {
    states: {},
    callWS: async () => null,
    callService: async () => null,
    fetchWithAuth: async () => new Response(),
    connection: {
      subscribeMessage: async (onMessage: (message: unknown) => void, subscribe: HassMessage) => {
        asked.push(subscribe);
        if (answer === 'unknown') throw {code: 'unknown_command'};
        listener = onMessage;
        return () => {
          listener = null;
        };
      },
    },
  } satisfies Hass;
  return {hass, send: message => listener?.(message), asked};
}

test('a newer build is told once; the same build, or a message without one, is not', async () => {
  const {hass, send, asked} = fakeHass('ok');
  const told: string[] = [];
  watchBuild(hass, 'aaaaaaaaaaaa', build => told.push(build));
  await Promise.resolve();
  assert.deepEqual(asked, [{type: 'home_twin/frontend/subscribe'}]);
  send({build: 'aaaaaaaaaaaa'});
  send({});
  assert.deepEqual(told, []);
  send({build: 'bbbbbbbbbbbb'});
  send({build: 'cccccccccccc'});
  assert.deepEqual(told, ['bbbbbbbbbbbb']);
});

test('nothing is watched outside HA’s addresses, and an older integration without the command is no error', async () => {
  const outside = fakeHass('ok');
  watchBuild(outside.hass, null, () => assert.fail('no build of ours: nothing to compare'));
  assert.deepEqual(outside.asked, []);
  const older = fakeHass('unknown');
  const stop = watchBuild(older.hass, 'aaaaaaaaaaaa', () => assert.fail('nothing to tell'));
  await new Promise(resolve => setTimeout(resolve, 0));
  stop();
});

test('after stop nothing more is told', async () => {
  const {hass, send} = fakeHass('ok');
  const told: string[] = [];
  const stop = watchBuild(hass, 'aaaaaaaaaaaa', build => told.push(build));
  await Promise.resolve();
  stop();
  send({build: 'bbbbbbbbbbbb'});
  assert.deepEqual(told, []);
});

test('the editor says it is open, so the integration keeps its panel where it is', async () => {
  const {hass, asked} = fakeHass('ok');
  watchBuild(hass, 'aaaaaaaaaaaa', () => {}, {panel: true});
  await Promise.resolve();
  assert.deepEqual(asked, [{type: 'home_twin/frontend/subscribe', panel: true}]);
});
