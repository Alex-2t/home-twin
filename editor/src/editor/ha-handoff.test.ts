// The AI build from Home Assistant (D-130): the addresses, the messages, the panel taking a home only from the service, and
// the site sending one to the window that opened it. Windows are stood in for by event targets that deliver a message only
// to the address it was sent to, as browsers do.
import test from 'node:test';
import assert from 'node:assert/strict';
import {aiBuildLink, handoffMessage, receiveHomes, sendHomeToOpener, webOrigin} from './ha-handoff.ts';
import type {Plan} from '../core/types.ts';

const SERVICE = 'https://twin.sync.md';
const HA = 'http://homeassistant.local:8123';

/** A window at an address: postMessage reaches its listeners only when the target address is its own. */
class FakeWindow extends EventTarget {
  opener: FakeWindow | null = null;
  closed = false;
  readonly location: {origin: string};
  readonly sent: unknown[] = [];

  constructor(origin: string) {
    super();
    this.location = {origin};
  }

  /** A message from `from`, delivered as the browser would. */
  postFrom(from: FakeWindow, data: unknown, targetOrigin: string): void {
    if (targetOrigin !== this.location.origin) return;
    this.sent.push(data);
    const event = new MessageEvent('message', {data, origin: from.location.origin});
    // MessageEvent's source accepts only a real window: the fake is set on the event itself
    Object.defineProperty(event, 'source', {value: from});
    setTimeout(() => this.dispatchEvent(event), 0);
  }
}

/** A window whose postMessage comes from `from`. */
function asSeenBy(target: FakeWindow, from: FakeWindow): Window {
  const view = Object.create(target) as FakeWindow & {postMessage(data: unknown, origin: string): void};
  view.postMessage = (data, origin) => target.postFrom(from, data, origin);
  return view as unknown as Window;
}

const plan = {version: 1, rooms: [{id: 'r1', name: 'Living room'}]} as unknown as Plan;

test('web addresses: an http or https origin, nothing else', () => {
  assert.equal(webOrigin('http://homeassistant.local:8123/home-twin?x=1'), HA);
  assert.equal(webOrigin('https://ha.example.com'), 'https://ha.example.com');
  assert.equal(webOrigin('javascript:alert(1)'), null);
  assert.equal(webOrigin('file:///etc/passwd'), null);
  assert.equal(webOrigin('not an address'), null);
  assert.equal(webOrigin(null), null);
});

test('the link the panel opens: the upload, with Home Assistant’s address', () => {
  const link = new URL(aiBuildLink(SERVICE, HA));
  assert.equal(link.origin, SERVICE);
  assert.equal(link.searchParams.get('ai'), 'new');
  assert.equal(link.searchParams.get('ha'), HA);
});

test('messages: only ours, a home only with a plan', () => {
  assert.deepEqual(handoffMessage({type: 'home-twin-handoff', kind: 'ready'}), {
    type: 'home-twin-handoff',
    kind: 'ready',
  });
  assert.equal(handoffMessage({type: 'home-twin-handoff', kind: 'home'}), null);
  assert.equal(handoffMessage({type: 'other', kind: 'ready'}), null);
  assert.equal(handoffMessage('ready'), null);
  assert.equal(handoffMessage(null), null);
});

test('the panel takes a home from the service only, and says it has it', async () => {
  const haPage = new FakeWindow(HA);
  const site = new FakeWindow(SERVICE);
  const stranger = new FakeWindow('https://evil.example');
  const taken: unknown[] = [];
  const stop = receiveHomes(SERVICE, haPage as unknown as Window, home => taken.push(home));
  const message = {type: 'home-twin-handoff', kind: 'home', plan};
  haPage.postFrom(stranger, message, HA);
  // the answer goes back to the window the home came from
  Object.defineProperty(site, 'postMessage', {
    value: (data: unknown, origin: string) => site.postFrom(haPage, data, origin),
  });
  haPage.postFrom(site, message, HA);
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.deepEqual(taken, [plan]);
  assert.deepEqual(site.sent, [{type: 'home-twin-handoff', kind: 'received'}]);
  stop();
  haPage.postFrom(site, message, HA);
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(taken.length, 1);
});

test('a Home Assistant tab the site opened says it is ready to the site, to its address only', () => {
  const haPage = new FakeWindow(HA);
  const site = new FakeWindow(SERVICE);
  haPage.opener = asSeenBy(site, haPage) as unknown as FakeWindow;
  const stop = receiveHomes(SERVICE, haPage as unknown as Window, () => {});
  assert.deepEqual(site.sent, [{type: 'home-twin-handoff', kind: 'ready'}]);
  stop();
});

test('the site sends the home to the panel that opened it, and knows when it is there', async () => {
  const haPage = new FakeWindow(HA);
  const site = new FakeWindow(SERVICE);
  const taken: unknown[] = [];
  const stop = receiveHomes(SERVICE, haPage as unknown as Window, home => taken.push(home));
  Object.defineProperty(site, 'postMessage', {
    value: (data: unknown, origin: string) => site.postFrom(haPage, data, origin),
  });
  const globals = globalThis as unknown as {
    window?: unknown;
    addEventListener: unknown;
    removeEventListener: unknown;
  };
  const saved = {window: globals.window, add: globals.addEventListener, remove: globals.removeEventListener};
  // the site's own window: its opener is HA's page, and the answer arrives at it
  // the opener and the answer's source are one window, as in a browser; what the site posts to it comes from the site
  Object.defineProperty(haPage, 'postMessage', {
    value: (data: unknown, origin: string) => haPage.postFrom(site, data, origin),
  });
  globals.window = {opener: haPage};
  globals.addEventListener = site.addEventListener.bind(site);
  globals.removeEventListener = site.removeEventListener.bind(site);
  try {
    assert.equal(await sendHomeToOpener(plan, HA), 'sent');
    assert.deepEqual(taken, [plan]);
    // a page at another address than the one given never gets the home
    taken.length = 0;
    const wrong = await sendHomeToOpener(plan, 'https://other.example');
    assert.equal(wrong, 'no-answer');
    assert.equal(taken.length, 0);
  } finally {
    globals.window = saved.window;
    globals.addEventListener = saved.add;
    globals.removeEventListener = saved.remove;
    stop();
  }
});
