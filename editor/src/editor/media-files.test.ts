// The upload page's files told apart (media-files.ts): by type, else by the name's extension; what the service would refuse
// is left out with a word.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MOST_PHOTOS, MOST_PHOTO_BYTES, isPlanFile, mediaKind, showable, sortMedia} from './media-files.ts';

const file = (name: string, type = '', size = 1000) => ({name, type, size});

test('a file is a video or a photo by its type, else by its extension', () => {
  assert.equal(mediaKind(file('walk.mp4', 'video/mp4')), 'video');
  // Windows gives a .mov no type; Chrome gives an iPhone's HEIC none.
  assert.equal(mediaKind(file('IMG_0001.MOV')), 'video');
  assert.equal(mediaKind(file('IMG_0002.HEIC')), 'photo');
  assert.equal(mediaKind(file('kitchen.jpg', 'image/jpeg')), 'photo');
  assert.equal(mediaKind(file('notes.txt', 'text/plain')), null);
});

test('the plan may be a photo, a scan or a PDF; only common pictures are shown as they are', () => {
  assert.ok(isPlanFile(file('plan.pdf', 'application/pdf')));
  assert.ok(isPlanFile(file('Plan.PDF')));
  assert.ok(isPlanFile(file('plan.heic')));
  assert.ok(!isPlanFile(file('tour.mp4', 'video/mp4')));
  assert.ok(showable(file('plan.png', 'image/png')));
  assert.ok(!showable(file('plan.heic', 'image/heic')));
  assert.ok(!showable(file('plan.pdf', 'application/pdf')));
});

test('a choice is sorted into videos and photos; too many and too big are left out and counted', () => {
  const many = Array.from({length: MOST_PHOTOS + 2}, (_, i) => file(`p${i}.jpg`, 'image/jpeg'));
  const sorted = sortMedia([
    file('walk.mp4', 'video/mp4'),
    file('huge.jpg', 'image/jpeg', MOST_PHOTO_BYTES + 1),
    file('readme.txt', 'text/plain'),
    ...many,
  ]);
  assert.equal(sorted.videos.length, 1);
  assert.equal(sorted.photos.length, MOST_PHOTOS);
  assert.equal(sorted.photos[0].name, 'p0.jpg');
  assert.equal(sorted.tooMany, 2);
  assert.deepEqual(sorted.tooBig, ['huge.jpg']);
});
