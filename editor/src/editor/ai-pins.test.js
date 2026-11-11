// The AI build's pins (ai-pins.js): which room and item a spot is, and what the service gets.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {roomAt, newPin, pinLabel, pinsToSend, pinsToRetry, changeCount, MAX_PIN_PHOTOS} from './ai-pins.js';

const plan = {
  rooms: [
    {id: 'r1', name: 'Kitchen', polygon: [[0, 0], [4, 0], [4, 3], [0, 3]]},
    {id: 'r2', name: 'Bedroom', polygon: [[4, 0], [7, 0], [7, 3], [4, 3]]},
    {id: 'shaft', name: 'Shaft', solid: true, polygon: [[1, 1], [1.5, 1], [1.5, 1.5], [1, 1.5]]},
  ],
  furniture: [{id: 'r6_i1', name: 'Grey sofa'}],
};

test('a spot is in the room around it, or the nearest one just outside, never in a shaft', () => {
  assert.equal(roomAt(plan, [2, 1]).id, 'r1');
  assert.equal(roomAt(plan, [1.2, 1.2]).id, 'r1');
  assert.equal(roomAt(plan, [7.3, 1.5]).id, 'r2');
  assert.equal(roomAt(plan, [10, 10]), null);
});

test('a pin in 3D takes its room from the point inside the wall it hit, and the item it hit', () => {
  const pin = newPin(plan, {p: [4.0, 1.5], z: 1.2, inside: [3.9, 1.5], item: 'r6_i1'});
  assert.deepEqual(pin, {
    x: 4,
    y: 1.5,
    z: 1.2,
    room: 'r1',
    roomName: 'Kitchen',
    item: 'r6_i1',
    itemName: 'Grey sofa',
    text: '',
    view: null,
    photos: [],
  });
  assert.equal(pinLabel(pin, 'Outside'), 'Grey sofa · Kitchen');
  assert.equal(pinLabel(newPin(plan, {p: [10, 10]}), 'Outside'), 'Outside');
});

test('only pins with words go, numbered in order; the count adds the note for the whole home', () => {
  const pins = [
    {...newPin(plan, {p: [1, 1]}), text: ' no wall here '},
    {...newPin(plan, {p: [5, 1]}), text: ''},
    {...newPin(plan, {p: [10, 10]}), text: 'a balcony'},
  ];
  assert.deepEqual(pinsToSend(pins), [
    {n: 1, x: 1, y: 1, room: 'r1', roomName: 'Kitchen', text: 'no wall here'},
    {n: 2, x: 10, y: 10, text: 'a balcony'},
  ]);
  assert.equal(changeCount({pins, text: ''}), 2);
  assert.equal(changeCount({pins, text: 'oak floors'}), 3);
});

test("a pin's pictures go with it: what the owner saw and their photos, at most four", () => {
  const pin = {
    ...newPin(plan, {p: [2, 1]}),
    text: 'the sofa faces the window',
    view: 'view-k1.jpg',
    photos: ['photo-a.jpg', 'photo-b.jpg', 'photo-c.jpg', 'photo-d.jpg', 'photo-e.jpg'],
  };
  const [sent] = pinsToSend([pin]);
  assert.equal(sent.view, 'view-k1.jpg');
  assert.equal(sent.photos.length, MAX_PIN_PHOTOS);
  const [bare] = pinsToSend([{...newPin(plan, {p: [2, 1]}), text: 'a lamp'}]);
  assert.equal('view' in bare || 'photos' in bare, false);
});

test('the pins of the last round that did not work out come back, with why', () => {
  const lastRound = {
    round: 1,
    pins: [
      {n: 1, x: 2, y: 4, z: 0.5, item: 'r7_i13', itemName: 'Sofa', room: 'r6', roomName: 'Living room', text: 'faces the window', made: 'no', why: [{code: 'refused', text: '…'}, {code: 'refused', text: '…'}]},
      {n: 2, x: 2, y: 6, text: 'four chairs', made: 'yes', why: []},
      {n: 3, x: 1, y: 1, text: 'a column', photos: ['photo-a.jpg'], made: 'partly', why: [{code: 'box', text: '…'}]},
    ],
  };
  const pins = pinsToRetry(lastRound);
  assert.deepEqual(
    pins.map(pin => pin.text),
    ['faces the window', 'a column'],
  );
  assert.deepEqual(pins[0].retry, {made: 'no', codes: ['refused']});
  assert.equal(pins[0].z, 0.5);
  assert.deepEqual(pins[1].photos, ['photo-a.jpg']);
  assert.deepEqual(pinsToRetry(null), []);
});
