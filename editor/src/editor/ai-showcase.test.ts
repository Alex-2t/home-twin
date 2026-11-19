// What the AI build's upload page shows of the homes to try (ai-showcase.ts): which examples the row takes.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseShowcaseExamples} from './ai-showcase.ts';

const BASE = 'https://twin.example/showcase/examples.json';

const example = (id: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  id,
  name: {en: `${id} en`, ru: `${id} ru`},
  area: 50,
  rooms: 2,
  kind: 'apartment',
  render: `${id}-abc.webp`,
  open: `#/example/${id}/`,
  ...extra,
});

test('the examples: only those asked for, in the order asked, with their render beside the list', () => {
  const list = [example('studio'), example('loft'), example('family'), example('altbau')];
  const homes = parseShowcaseExamples(list, BASE, ['loft', 'studio', 'altbau']);
  assert.deepEqual(
    homes.map(home => home.id),
    ['loft', 'studio', 'altbau'],
  );
  assert.equal(homes[0].name, 'loft en');
  assert.equal(homes[0].render, 'https://twin.example/showcase/loft-abc.webp');
  assert.equal(homes[0].open, '#/example/loft/');
});

test('the examples: an entry not well formed, or opening elsewhere, is left out; no list is no cards', () => {
  const list = [
    example('loft', {open: 'https://elsewhere.example/'}),
    example('studio', {render: '../secret.webp'}),
    example('altbau', {area: 'big'}),
  ];
  const homes = parseShowcaseExamples(list, BASE, ['loft', 'studio', 'altbau']);
  assert.deepEqual(
    homes.map(home => [home.id, home.render]),
    [['studio', null]],
  );
  assert.deepEqual(parseShowcaseExamples({}, BASE, ['loft']), []);
});
