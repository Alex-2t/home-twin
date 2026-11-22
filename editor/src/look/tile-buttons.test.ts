// A room tile's buttons: each device its own while they fit, alike ones together when they do not.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buttonsThatFit, tileButtons} from './tile-buttons.ts';
import type {TileButton} from './tile-buttons.ts';

const names = (buttons: TileButton<string, string, string>[]): string[] =>
  buttons.map(button =>
    button.kind === 'lamp'
      ? button.lamp
      : button.kind === 'cover'
        ? button.cover
        : button.kind === 'climate'
          ? button.device
          : button.kind === 'more'
            ? `+${button.count}`
            : button.kind,
  );

test('the hallway: its main light and its skirting light, each its own button', () => {
  const buttons = tileButtons({lamps: ['main', 'skirting'], covers: [], climate: []}, 5);
  assert.deepEqual(names(buttons), ['main', 'skirting']);
});

test('the bedroom: five devices in a row of five, all apart', () => {
  const buttons = tileButtons({lamps: ['main', 'niche'], covers: ['curtain'], climate: ['heater', 'ac']}, 5);
  assert.deepEqual(names(buttons), ['main', 'niche', 'curtain', 'heater', 'ac']);
});

test('the kitchen: six devices in five, the lamps together first', () => {
  const buttons = tileButtons(
    {lamps: ['main', 'plinth'], covers: ['blind'], climate: ['ac', 'heater', 'radiator']},
    5,
  );
  assert.deepEqual(names(buttons), ['lights', 'blind', 'ac', 'heater', 'radiator']);
});

test('then the curtains together, then the rest behind "+N"', () => {
  const room = {lamps: ['a', 'b'], covers: ['c1', 'c2'], climate: ['ac', 'heater', 'fan']};
  assert.deepEqual(names(tileButtons(room, 5)), ['lights', 'covers', 'ac', 'heater', 'fan']);
  assert.deepEqual(names(tileButtons(room, 4)), ['lights', 'covers', 'ac', '+2']);
});

test('how many 28 px buttons with 5 px gaps fit a row', () => {
  assert.equal(buttonsThatFit(160, 28, 5), 5);
  assert.equal(buttonsThatFit(158, 28, 5), 4);
  assert.equal(buttonsThatFit(10, 28, 5), 1);
});
