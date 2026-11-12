// The AI build's pins (ai-pins.js): which room and item a spot is, and what the service gets.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {roomAt, newPin, pinLabel, pinsToSend, pinsToRetry, refreshRetries, changeCount, MAX_PIN_PHOTOS} from './ai-pins.js';

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
  // A pin put in 3D keeps the camera it was put from (D-081): the service looks at the changed home from there.
  const camera = {t: [2, 0.4, -1], theta: 0.6, phi: 1, fit: [6, 4]};
  assert.deepEqual(pinsToSend([{...newPin(plan, {p: [2, 1]}), text: 'a lamp', camera}])[0].camera, camera);
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
  assert.deepEqual(pins[0].retry, {round: 1, n: 1, made: 'no', codes: ['refused']});
  assert.equal(pins[0].z, 0.5);
  assert.deepEqual(pins[1].photos, ['photo-a.jpg']);
  assert.deepEqual(pinsToRetry(null), []);
});

test('a pin that came back follows what the service says of its round now: made, it leaves; still not, its reason is new', () => {
  // A round judged again: the plant (n 1) is made now; the kitchen run (n 2) is not, for another reason.
  const judgedAgain = {
    round: 1,
    pins: [
      {n: 1, x: 1, y: 3, item: 'r2_i19', text: 'flowers stand here', made: 'yes', why: []},
      {n: 2, x: 1, y: 1, item: 'r3_i1', text: 'what is this cube?', made: 'no', why: [{code: 'unchanged', text: '…'}]},
    ],
  };
  const back = pinsToRetry({...judgedAgain, pins: judgedAgain.pins.map(pin => ({...pin, made: 'no', why: [{code: 'box'}]}))});
  const now = refreshRetries(back, judgedAgain);
  assert.deepEqual(now.map(pin => pin.text), ['what is this cube?']);
  assert.deepEqual(now[0].retry.codes, ['unchanged']);
  // A made pin the owner added to stays, without its reason.
  const added = refreshRetries([{...back[0], text: 'flowers stand here, three pots'}], judgedAgain);
  assert.equal(added.length, 1);
  assert.equal('retry' in added[0], false);
  // A pin kept before pins had their number is found by its words and its thing.
  const older = {...back[0], retry: {made: 'no', codes: ['box']}};
  assert.deepEqual(refreshRetries([older], judgedAgain), []);
  // The owner's own new pins and those of another round stay as they are.
  const own = {x: 2, y: 2, text: 'a rug here'};
  const otherRound = {...back[1], retry: {...back[1].retry, round: 2}};
  assert.deepEqual(refreshRetries([own, otherRound], judgedAgain), [own, otherRound]);
});

// The service reads each pin back (harness owner-result.ts): what it understood, and in the owner's words what it can't do yet
// or what it asks. The owner: "why was it unclear?" — it was understood, and the app could not do it.
test("a pin that comes back keeps what the service understood and said in the owner's words, and that it was sent on", () => {
  const lastRound = {
    round: 1,
    pins: [
      {
        n: 4,
        x: 12.3,
        y: 3.1,
        text: 'from here to the right the wall is white',
        made: 'no',
        understood: 'The wall right of the balcony door is plain white.',
        why: [{code: 'cannot', text: '…', say: 'A wall has one finish from corner to corner in this version.'}],
      },
    ],
  };
  const [pin] = pinsToRetry(lastRound);
  assert.deepEqual(pin.retry, {
    round: 1,
    n: 4,
    made: 'no',
    codes: ['cannot'],
    told: [{code: 'cannot', say: 'A wall has one finish from corner to corner in this version.'}],
    understood: 'The wall right of the balcony door is plain white.',
  });
  // Sent to the developer: that stays when the round is read again; what the service says is taken anew.
  const sent = {...pin, retry: {...pin.retry, reported: true}};
  const again = {
    ...lastRound,
    pins: [{...lastRound.pins[0], why: [{code: 'unclear', text: '…', say: 'Which wall do you mean?'}]}],
  };
  const [now] = refreshRetries([sent], again);
  assert.equal(now.retry.reported, true);
  assert.deepEqual(now.retry.told, [{code: 'unclear', say: 'Which wall do you mean?'}]);
});
