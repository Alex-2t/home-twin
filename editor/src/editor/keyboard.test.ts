import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {editorKeyAllowed, keyTargetOf, nextRovingIndex} from './keyboard.ts';
import {typedOutlineSize, OUTLINE_LIVING_SHARE} from './wizard-state.ts';

// A stand-in for a focused element: which selectors it sits inside (closest), and its tag.
function fakeElement(tagName: string, inside: string[]): Element {
  const closest = (selector: string): object | null =>
    selector.split(',').some(part => inside.includes(part.trim())) ? {} : null;
  return {tagName, closest} as unknown as Element;
}

test('a focused field or popup keeps every key; a focused button keeps only its own keys', () => {
  assert.equal(editorKeyAllowed('field', 'Escape'), false);
  assert.equal(editorKeyAllowed('field', 'v'), false);
  assert.equal(editorKeyAllowed('popup', 'Delete'), false);
  for (const own of ['Enter', ' ', 'Tab', 'ArrowDown', 'ArrowLeft', 'Home', 'End'])
    assert.equal(editorKeyAllowed('control', own), false, own);
  // the editor's keys work from a focused button: a keyboard user's focus is always on one
  for (const editorKey of ['Escape', 'v', 'r', 'Delete', 'z', '?', '\\'])
    assert.equal(editorKeyAllowed('control', editorKey), true, editorKey);
  assert.equal(editorKeyAllowed('page', 'Tab'), true);
  assert.equal(editorKeyAllowed('page', 'Enter'), true);
});

test('the focused element is sorted into field, popup, control or page', () => {
  assert.equal(keyTargetOf(null), 'page');
  assert.equal(keyTargetOf(fakeElement('INPUT', ['input'])), 'field');
  // a field inside a menu is still a field: typing goes into it
  assert.equal(keyTargetOf(fakeElement('SELECT', ['select', '.menu'])), 'field');
  assert.equal(keyTargetOf(fakeElement('BUTTON', ['button', '.menu'])), 'popup');
  assert.equal(keyTargetOf(fakeElement('BUTTON', ['button', '[role=dialog]'])), 'popup');
  assert.equal(keyTargetOf(fakeElement('BUTTON', ['button'])), 'control');
  assert.equal(keyTargetOf(fakeElement('DIV', ['[tabindex]'])), 'control');
  // the plan's canvas takes focus (tabindex -1) but is the page: Tab, Enter and the drawing keys work there
  assert.equal(keyTargetOf(fakeElement('CANVAS', ['[tabindex]'])), 'page');
  assert.equal(keyTargetOf(fakeElement('BODY', [])), 'page');
});

test('the arrows move along a list and stop at its ends', () => {
  assert.equal(nextRovingIndex(0, 5, 'ArrowDown'), 1);
  assert.equal(nextRovingIndex(4, 5, 'ArrowDown'), 4);
  assert.equal(nextRovingIndex(0, 5, 'ArrowUp'), 0);
  assert.equal(nextRovingIndex(3, 5, 'ArrowUp'), 2);
  assert.equal(nextRovingIndex(3, 5, 'Home'), 0);
  assert.equal(nextRovingIndex(1, 5, 'End'), 4);
  // a list does not move sideways, and other keys do not move at all
  assert.equal(nextRovingIndex(2, 5, 'ArrowRight'), null);
  assert.equal(nextRovingIndex(2, 5, 'a'), null);
  assert.equal(nextRovingIndex(0, 0, 'ArrowDown'), null);
  // the focus was not in the list: Down goes to the first item
  assert.equal(nextRovingIndex(-1, 5, 'ArrowDown'), 0);
});

test('in a grid Up and Down jump a row, Left and Right a card', () => {
  const columns = 3;
  assert.equal(nextRovingIndex(1, 10, 'ArrowDown', columns), 4);
  assert.equal(nextRovingIndex(4, 10, 'ArrowUp', columns), 1);
  assert.equal(nextRovingIndex(1, 10, 'ArrowUp', columns), 0);
  assert.equal(nextRovingIndex(8, 10, 'ArrowDown', columns), 9);
  assert.equal(nextRovingIndex(4, 10, 'ArrowRight', columns), 5);
  assert.equal(nextRovingIndex(4, 10, 'ArrowLeft', columns), 3);
});

test('the outline typed from the keyboard is offered so the documented area fits it', () => {
  const docArea = 62;
  const offered = typedOutlineSize(docArea);
  // the same share of the rectangle as fitArea counts as living area, within the 10 cm rounding
  const living = offered.width * offered.depth * OUTLINE_LIVING_SHARE;
  assert.ok(Math.abs(living - docArea) < 1, `living ${living}`);
  assert.ok(offered.width > offered.depth);
  assert.ok(Math.abs(offered.width * 10 - Math.round(offered.width * 10)) < 1e-9);
  // a width typed by hand: the depth that goes with it
  const narrow = typedOutlineSize(docArea, {width: 6});
  assert.equal(narrow.width, 6);
  assert.ok(Math.abs(6 * narrow.depth * OUTLINE_LIVING_SHARE - docArea) < 1);
  // no documented area: the frame of “Draw from scratch”; a further room is 3 × 3 m
  assert.deepEqual(typedOutlineSize(undefined), {width: 10, depth: 7});
  assert.deepEqual(typedOutlineSize(docArea, {first: false}), {width: 3, depth: 3});
});

// A dialog's markup in a file: the dialog class the editor's dialogs share, a dialog role, the AI build's sheet.
const DIALOG_MARKUP = /class="keys[ "]|role="dialog"|class="aib-veil"/;

test('every dialog holds the focus: the page under it sleeps, Escape closes it, the focus goes back (D-096)', () => {
  const folder = new URL('.', import.meta.url).pathname;
  const missing: string[] = [];
  for (const name of fs.readdirSync(folder)) {
    if (!name.endsWith('.ts') || name.endsWith('.test.ts')) continue;
    const source = fs.readFileSync(path.join(folder, name), 'utf8');
    if (DIALOG_MARKUP.test(source) && !source.includes('holdFocus(')) missing.push(name);
  }
  // the shortcuts dialog is in shell.html; app.ts opens it
  const app = fs.readFileSync(path.join(folder, 'app.ts'), 'utf8');
  if (!/holdFocus\(keysBox/.test(app)) missing.push('app.ts (the shortcuts dialog)');
  assert.deepEqual(missing, []);
});
