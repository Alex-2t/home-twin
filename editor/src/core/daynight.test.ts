import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MODES, readMode, nextMode, isNight} from './daynight.ts';

test('day / night: auto follows the sun, day and night hold, the button steps auto → day → night → auto (D-068)', () => {
  assert.equal(readMode(), 'auto', 'nothing saved (no storage here) — auto');
  assert.deepEqual(MODES.map(nextMode), ['day', 'night', 'auto']);
  assert.equal(isNight('auto', true), true);
  assert.equal(isNight('auto', false), false);
  assert.equal(isNight('day', true), false, 'day holds after sunset');
  assert.equal(isNight('night', false), true, 'night holds by day');
});
