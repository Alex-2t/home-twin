// The gallery of homes (D-113): the server's list read safely, the cards' facts, the examples' renders.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fetchGallery, factsLine, homeFacts, homesOf, parseGalleryIndex} from './gallery.ts';
import {HOMES} from '../../demo/homes.ts';
import type {GalleryHome} from './gallery.ts';
import type {Outline} from '../core/types.ts';

const BASE = 'https://twin.example/gallery/index.json';

const square = (x: number, y: number, w: number, h: number): Outline => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];

const good = {
  id: 'two-bed-flat',
  name: 'Two-bed flat',
  area: 61.5,
  rooms: 2,
  kind: 'apartment',
  aiBuilt: true,
  render: 'two-bed-flat.webp',
  plan: 'two-bed-flat.json',
};

test("the server's list: files beside it, the AI-built mark kept", () => {
  const [home] = parseGalleryIndex([good], BASE);
  assert.equal(home.render, 'https://twin.example/gallery/two-bed-flat.webp');
  assert.equal(home.plan, 'https://twin.example/gallery/two-bed-flat.json');
  assert.deepEqual(
    [home.id, home.name, home.area, home.rooms, home.kind, home.aiBuilt],
    ['two-bed-flat', 'Two-bed flat', 61.5, 2, 'apartment', true],
  );
});

test('an entry that is not well formed, or names a file elsewhere, is left out; a list that is not one gives nothing', () => {
  const bad = [
    {...good, id: '../x'},
    {...good, id: 'Upper'},
    {...good, name: ' '},
    {...good, area: -1},
    {...good, area: 'big'},
    {...good, rooms: 1.5},
    {...good, kind: 'castle'},
    {...good, kind: 'designer'},
    {...good, plan: 'https://elsewhere.example/x.json'},
    {...good, plan: '../secret.json'},
    {...good, plan: 'two-bed-flat.webp'},
    null,
    'x',
  ];
  assert.deepEqual(parseGalleryIndex(bad, BASE), []);
  for (const notAList of [null, {}, 'x', 3]) assert.deepEqual(parseGalleryIndex(notAList, BASE), []);
  // a render elsewhere is not shown, the home still is (its outline is not known: no picture)
  const [home] = parseGalleryIndex([{...good, render: 'javascript:alert(1)'}], BASE);
  assert.equal(home.render, null);
  // the same id twice: the first
  assert.equal(parseGalleryIndex([good, {...good, name: 'Again'}], BASE).length, 1);
});

test('no list (offline, local work, a server without a gallery answering with its page): no homes and no error', async () => {
  const realFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => {
      throw new TypeError('Failed to fetch');
    };
    assert.deepEqual(await fetchGallery(BASE), []);
    globalThis.fetch = async () => new Response('<!doctype html><title>editor</title>', {status: 200});
    assert.deepEqual(await fetchGallery(BASE), []);
    globalThis.fetch = async () => new Response('not found', {status: 404});
    assert.deepEqual(await fetchGallery(BASE), []);
    globalThis.fetch = async () => new Response(JSON.stringify([good]), {status: 200});
    assert.equal((await fetchGallery(BASE)).length, 1);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("a card's facts: the area indoors without the balcony, the rooms lived in, a wardrobe not one", () => {
  const facts = homeFacts([
    {name: 'Living room', polygon: square(0, 0, 5, 4)},
    {name: 'Bedroom', polygon: square(5, 0, 3, 4)},
    {name: 'Wardrobe', polygon: square(8, 0, 1, 2)},
    {name: 'Bathroom', polygon: square(8, 2, 2, 2)},
    {name: 'Balcony', polygon: square(0, 4, 5, 1)},
  ]);
  assert.deepEqual(facts, {area: 38, rooms: 2});
  // a kitchen-living room is lived in, a small kitchen is not
  const open = homeFacts([
    {name: 'Kitchen-living room', polygon: square(0, 0, 6, 4)},
    {name: 'Kitchen', polygon: square(6, 0, 3, 3)},
    {name: 'Bedroom', polygon: square(0, 4, 4, 3)},
  ]);
  assert.equal(open.rooms, 2);
  assert.equal(factsLine({area: 38, rooms: 2}), '38 m² · 2 rooms');
  assert.equal(factsLine({area: 38.4, rooms: 0, note: 'ground floor'}), '38 m² · ground floor');
});

test('the chips: every home, or one kind', () => {
  const homes = [
    {kind: 'apartment'},
    {kind: 'house'},
    {kind: 'designer'},
    {kind: 'apartment'},
  ] as GalleryHome[];
  assert.equal(homesOf(homes, 'all').length, 4);
  assert.equal(homesOf(homes, 'apartment').length, 2);
  assert.equal(homesOf(homes, 'house').length, 1);
});

test('every example has its render, small, 640 × 400 (tools/render-examples.ts)', () => {
  for (const home of HOMES) {
    const file = new URL(`../../assets/renders/${home.id}.webp`, import.meta.url);
    assert.ok(fs.existsSync(file), `${home.id}: run node tools/render-examples.ts --only ${home.id}`);
    const bytes = fs.readFileSync(file);
    assert.ok(bytes.length < 60 * 1024, `${home.id}: ${bytes.length} bytes`);
    assert.equal(bytes.subarray(0, 4).toString('latin1'), 'RIFF', home.id);
    assert.equal(bytes.subarray(8, 12).toString('latin1'), 'WEBP', home.id);
    // the canvas's lossy WebP: VP8, its frame size 14 bits each after the start code
    const vp8 = bytes.indexOf(Buffer.from([0x9d, 0x01, 0x2a]));
    assert.ok(vp8 > 0, `${home.id}: a lossy WebP`);
    const width = bytes.readUInt16LE(vp8 + 3) & 0x3fff;
    const height = bytes.readUInt16LE(vp8 + 5) & 0x3fff;
    assert.deepEqual([width, height], [640, 400], home.id);
  }
});
