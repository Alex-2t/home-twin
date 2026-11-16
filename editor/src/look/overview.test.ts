// The room screen's lamp dimmer: which lamps have one and how bright they are (lampDim).
import test from 'node:test';
import assert from 'node:assert/strict';
import {lampDim} from './overview.ts';
import type {HassAttributes} from '../core/types.ts';

const light = (state: string, attributes: HassAttributes) => ({state, attributes});

test('a light that can be dimmed reads its brightness in percent', () => {
  assert.equal(lampDim(light('on', {supported_color_modes: ['brightness'], brightness: 255})), 100);
  assert.equal(lampDim(light('on', {supported_color_modes: ['color_temp', 'hs'], brightness: 128})), 50);
  // the lowest brightness HA sends is still a lit lamp, not 0 %
  assert.equal(lampDim(light('on', {supported_color_modes: ['brightness'], brightness: 1})), 1);
});

test('an off light shows the brightness it comes back to', () => {
  assert.equal(lampDim(light('off', {supported_color_modes: ['brightness']}), 40), 40);
  assert.equal(lampDim(light('off', {supported_color_modes: ['brightness']})), 100);
  // on, but no brightness yet (HA's first report after a restart): the last one seen
  assert.equal(lampDim(light('on', {supported_color_modes: ['brightness']}), 70), 70);
});

test('a lamp that is only on or off has no dimmer', () => {
  assert.equal(lampDim(light('on', {supported_color_modes: ['onoff']})), null);
  // a switch.* relay has no color modes at all
  assert.equal(lampDim(light('on', {})), null);
  assert.equal(lampDim(null), null);
});
