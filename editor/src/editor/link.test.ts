// Linked windows (D-118): two windows opened with the same ?link= show one home; a window with another home, or another link,
// takes nothing. Two editors are stood in for by the parts link.ts reads, each with its own demo HA, as two iframes have.
import test from 'node:test';
import assert from 'node:assert/strict';
import {homeKey, linkId, linkWindows} from './link.ts';
import {mockHA} from './ha.ts';
import type {DayNightMode, DemoHaLayer, Plan, PlanLight, Room} from '../core/types.ts';
import type {Editor} from './editor-types.ts';

/** A window: its demo HA and the editor's parts link.ts uses. */
interface FakeWindow {
  ha: DemoHaLayer;
  ed: Editor;
  plan: Plan;
}

// the links are closed after the tests, or the open channels keep the process alive
const opened: Array<() => void> = [];
test.after(() => opened.forEach(unlink => unlink()));

function openWindow(search: string, roomIds = ['living', 'bed']): FakeWindow {
  const lights = [
    {id: 'l1', entity: 'light.living', name: 'Living', area: 'living', color: '#fff'},
    {id: 'l2', entity: 'light.bed', name: 'Bed', area: 'bed', color: '#fff'},
  ];
  const ha = mockHA({
    areas: {living: 'Living', bed: 'Bed'},
    lights,
    entities: {'cover.curtain': {state: 'closed', attributes: {current_position: 0}}},
    devices: [{entity: 'cover.curtain', name: 'Curtain', area: 'bed', domain: 'cover', cls: 'curtain'}],
  });
  const lamps = [
    {id: 'l1', entity: 'light.living', on: false},
    {id: 'l2', entity: 'light.bed', on: false},
    {id: 'l3', on: false},
  ] as PlanLight[];
  const plan = {rooms: roomIds.map(id => ({id}) as Room), lights: lamps} as Plan;
  ha._lightsFrom(() => plan.lights);
  let dayMode: DayNightMode = 'night';
  const ed = {
    plan,
    dayMode: () => dayMode,
    toggleNight: () => {
      dayMode = dayMode === 'night' ? 'auto' : 'night';
    },
    setDayMode: (mode: DayNightMode) => {
      dayMode = mode;
    },
    setLampOn: (id: string, on: boolean) => {
      const lamp = plan.lights.find(light => light.id === id);
      if (lamp) lamp.on = on;
    },
    showcaseLight: () => {},
  } as unknown as Editor;
  const unlink = linkWindows(ha, ed, search);
  if (unlink) opened.push(unlink);
  return {ha, ed, plan};
}

// a message crosses the channel on a later turn of the event loop
const delivered = (): Promise<void> => new Promise(done => setTimeout(done, 20));

test('the link id is taken from the address only when it is a plain name', () => {
  assert.equal(linkId('?show&link=ab12cd'), 'ab12cd');
  assert.equal(linkId('?show'), null);
  assert.equal(linkId('?link='), null);
  assert.equal(linkId('?link=a%20b'), null);
});

test('the home key: the same plan gives the same key, no rooms gives none', () => {
  const plan = {rooms: [{id: 'a'}], lights: [{id: 'x'}]} as Plan;
  assert.equal(homeKey({plan}), homeKey({plan: structuredClone(plan)}));
  assert.equal(homeKey({plan: {rooms: [], lights: []} as unknown as Plan}), '');
});

test('a command and day / night in one window happen in the other', async () => {
  const desk = openWindow('?show&link=t1');
  const phone = openWindow('?show&link=t1');
  await desk.ha.call('light', 'turn_on', {entity_id: 'light.living'});
  await desk.ha.call('cover', 'open_cover', {entity_id: 'cover.curtain'});
  phone.ed.toggleNight();
  await delivered();
  assert.equal(phone.plan.lights[0].on, true, 'the lamp is on in the phone');
  assert.equal(phone.ha.entity('cover.curtain')!.state, 'open', 'the curtain is open in the phone');
  assert.equal(desk.ed.dayMode(), 'auto', 'day / night stepped in the phone is stepped on the desktop');
  assert.equal(desk.plan.lights[0].on, true, 'a command that came in is not run twice');
});

test('a window that joins later takes what the first one shows', async () => {
  const desk = openWindow('?show&link=t2');
  await desk.ha.call('light', 'turn_on', {entity_id: 'light.bed'});
  await desk.ha.call('cover', 'open_cover', {entity_id: 'cover.curtain'});
  desk.plan.lights[2].on = true;
  const phone = openWindow('?show&link=t2');
  phone.ed.showcaseLight();
  await delivered();
  assert.deepEqual(
    phone.plan.lights.map(lamp => lamp.on),
    [false, true, true],
  );
  assert.equal(phone.ha.entity('cover.curtain')!.state, 'open');
});

test('another home or another link takes nothing', async () => {
  const desk = openWindow('?show&link=t3');
  const otherHome = openWindow('?show&link=t3', ['kitchen']);
  const otherLink = openWindow('?show&link=t4');
  await desk.ha.call('light', 'turn_on', {entity_id: 'light.living'});
  await delivered();
  assert.equal(otherHome.plan.lights[0].on, false);
  assert.equal(otherLink.plan.lights[0].on, false);
});
