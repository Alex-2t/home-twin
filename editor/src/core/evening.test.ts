import {test} from 'node:test';
import assert from 'node:assert/strict';
import {eveningRooms} from './evening.ts';
import type {Room} from './types.ts';

// a square room of this side, in metres
const room = (id: string, name: string, side: number): Room => ({
  id,
  name,
  polygon: [
    [0, 0],
    [side, 0],
    [side, side],
    [0, side],
  ],
});

test('the evening lights the main room and the largest bedroom, of the rooms that have a lamp', () => {
  const rooms = [
    room('living', 'Living room', 5),
    room('kitchen', 'Kitchen', 3),
    room('bed', 'Bedroom', 4),
    room('small', 'Bedroom 2', 3),
    room('bath', 'Bathroom', 2),
  ];
  const lamps = rooms.map(r => ({room: r.id}));
  assert.deepEqual([...eveningRooms(rooms, lamps)], ['living', 'bed']);
});

test('a room without a lamp is skipped, and two rooms are lit where two have lamps', () => {
  // an AI-built home: no lamp in its kitchen diner, two in its bedrooms
  const rooms = [
    room('diner', 'Kitchen diner', 5),
    room('bed', 'Bedroom', 4),
    room('spare', 'Spare bedroom', 3),
  ];
  const lamps = [{room: 'bed'}, {room: 'spare'}];
  assert.deepEqual([...eveningRooms(rooms, lamps)].sort(), ['bed', 'spare']);
});

test('no lamps, no rooms lit; a bathroom or a hallway alone is never chosen', () => {
  const rooms = [room('hall', 'Hallway', 3), room('bath', 'Bathroom', 2)];
  assert.equal(eveningRooms(rooms, []).size, 0);
  assert.equal(eveningRooms(rooms, [{room: 'hall'}, {room: 'bath'}]).size, 0);
});
