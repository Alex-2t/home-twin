// A plan PDF of many pages (plan-pages.ts, D-131): which page the picker opens with, what its line says, what is a PDF.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setLang} from '../i18n/i18n.ts';
import {firstPick, isPdfFile, pickerLead, thumbAddress} from './plan-pages.ts';
import type {PlanPages} from './plan-pages.ts';

setLang('en');

const pdf = (guess: PlanPages['guess'], pages = 41, shown = 41): PlanPages => ({
  id: 'p1',
  pages,
  shown,
  guess,
});

test('the picker opens on the page picked before, else on the guess, else on none', () => {
  assert.equal(firstPick(pdf({page: 17, floors: 1}), null), 17);
  assert.equal(firstPick(pdf({page: 17, floors: 1}), 14), 14);
  assert.equal(firstPick(pdf(null), null), null);
  assert.equal(firstPick(pdf({page: null, floors: 1}), null), null);
  // a page past those shown cannot be shown picked
  assert.equal(firstPick(pdf({page: 3, floors: 1}, 80, 60), 70), 3);
});

test('the line says the guess, or that none was found, and what else to know', () => {
  assert.deepEqual(pickerLead(pdf({page: 17, floors: 1})), [
    'We picked page 17. Tap another if it is wrong.',
  ]);
  assert.deepEqual(pickerLead(pdf(null)), ['No plan found here. Tap its page, or add another file.']);
  assert.deepEqual(pickerLead(pdf({page: 2, floors: 2}, 80, 60)), [
    'We picked page 2. Tap another if it is wrong.',
    'Several floors: we build one for now. Pick its plan.',
    'The first 60 of 80 pages',
  ]);
});

test('a PDF by its type or, with none, by its name', () => {
  assert.ok(isPdfFile({name: 'project.PDF', type: ''}));
  assert.ok(isPdfFile({name: 'download', type: 'application/pdf'}));
  assert.ok(!isPdfFile({name: 'plan.jpg', type: 'image/jpeg'}));
});

test('a page’s picture is asked for by the PDF’s id and the page', () => {
  assert.equal(
    thumbAddress('https://twin.example', 'p1', 14),
    'https://twin.example/api/plan-pages/p1/thumb/14',
  );
});
