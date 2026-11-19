// What the AI build's upload page shows of the homes it built (ai-showcase.ts): which homes the row takes.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {showcaseHomes} from './ai-showcase.ts';
import type {GalleryHome} from './gallery.ts';

const home = (id: string, kind: GalleryHome['kind'], render: string | null = `${id}.webp`): GalleryHome => ({
  id,
  name: id,
  area: 60,
  rooms: 3,
  kind,
  aiBuilt: true,
  render,
  plan: `${id}.json`,
});

test('the row: three homes with a picture, in the list order, a house last when there is one', () => {
  const homes = [
    home('flat-a', 'apartment'),
    home('flat-b', 'apartment', null),
    home('flat-c', 'apartment'),
    home('flat-d', 'apartment'),
    home('bungalow', 'house'),
  ];
  const ids = showcaseHomes(homes).map(chosen => chosen.id);
  assert.deepEqual(ids, ['flat-a', 'flat-c', 'bungalow']);
});

test('the row without a house: the first three with a picture; no homes: none', () => {
  const homes = ['a', 'b', 'c', 'd'].map(id => home(id, 'apartment'));
  assert.deepEqual(
    showcaseHomes(homes).map(chosen => chosen.id),
    ['a', 'b', 'c'],
  );
  assert.deepEqual(showcaseHomes([]), []);
});
