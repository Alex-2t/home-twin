// The remote's dial: where on the arc a pointer is → the setpoint (ac-control.ts dialValue).
import test from 'node:test';
import assert from 'node:assert/strict';
import {dialValue} from './ac-control.ts';

const RANGE = {min: 16, max: 30, step: 0.5};
// a point on the dial's circle at an angle, degrees clockwise from the right
const at = (degrees: number): [number, number] => {
  const radians = (degrees * Math.PI) / 180;
  return [92 * Math.cos(radians), 92 * Math.sin(radians)];
};

test('the arc runs from the lowest setpoint at the bottom left to the highest at the bottom right', () => {
  assert.equal(dialValue(...at(135), RANGE), 16);
  assert.equal(dialValue(...at(270), RANGE), 23); // the top — the middle of the range
  assert.equal(dialValue(...at(45), RANGE), 30);
});

test('a point in the gap at the bottom goes to the nearer end', () => {
  assert.equal(dialValue(...at(100), RANGE), 16);
  assert.equal(dialValue(...at(80), RANGE), 30);
});

test('the setpoint is rounded to the step', () => {
  const value = dialValue(...at(200), RANGE);
  assert.equal((value * 2) % 1, 0);
  assert.ok(value > 16 && value < 23);
  assert.equal(dialValue(...at(270), {min: 5, max: 35, step: 1}), 20);
});
