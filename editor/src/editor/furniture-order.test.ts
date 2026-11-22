// The plan's furniture as drawn and as picked: what shows on top is what a click takes.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {furnitureDrawOrder} from './draw.ts';
import type {FurnitureItem} from '../core/types.ts';

const thing = (id: string, model: string, w: number, d: number, h: number): FurnitureItem =>
  ({id, model, x: 0, y: 0, w, d, h, rot: 0}) as FurnitureItem;

test('rugs first, then the bigger footprint below the smaller: a fridge on a rug and a chair at a table are on top', () => {
  const furniture = [
    thing('fridge', 'kitchenTall', 0.6, 0.6, 2.4),
    thing('rug', 'rug', 1.4, 2, 0.01),
    thing('chair', 'chair', 0.45, 0.5, 0.9),
    thing('table', 'diningTable', 1.4, 0.8, 0.75),
  ];
  assert.deepEqual(
    furnitureDrawOrder(furniture).map(item => item.id),
    ['rug', 'table', 'fridge', 'chair'],
  );
});

test("things of one footprint keep the plan's order", () => {
  const furniture = [thing('a', 'chair', 0.5, 0.5, 0.9), thing('b', 'chair', 0.5, 0.5, 0.9)];
  assert.deepEqual(
    furnitureDrawOrder(furniture).map(item => item.id),
    ['a', 'b'],
  );
});
