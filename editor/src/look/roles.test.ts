// A non-administrator in the dashboard card sees and controls the home but is offered nothing that writes the plan (look/roles.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ADMIN_ONLY_ACTIONS, NOT_ADMIN_CSS} from './roles.ts';

const LOOK = fs.readFileSync(new URL('../editor/look.ts', import.meta.url), 'utf8');
const CARD = fs.readFileSync(new URL('../card-main.ts', import.meta.url), 'utf8');

/** The actions of look.ts's click handler whose branch opens a settings editor (openLayout, openScene). */
function editorActions(): string[] {
  const branches = LOOK.split("a === '").slice(1);
  return branches
    .filter(branch => /\bopen(Layout|Scene)\(/.test(branch.split("a === '")[0]))
    .map(branch => branch.slice(0, branch.indexOf("'")));
}

test('every action that opens a settings editor is hidden from non-administrators', () => {
  const actions = editorActions();
  assert.ok(actions.includes('layout-edit') && actions.includes('scene-edit'), 'the click handler was found');
  for (const action of actions) {
    assert.ok(ADMIN_ONLY_ACTIONS.includes(action), `${action} opens an editor but is not admin-only`);
    assert.ok(NOT_ADMIN_CSS.includes(`[data-action=${action}]`), `${action} is not hidden`);
  }
});

test('the button at the top of a room screen, which turns into “Customize panel”, is hidden by its action', () => {
  // look.ts gives the round button its action as the screen changes: by class it would stay visible
  assert.match(LOOK, /end\.dataset\.action = gear \? 'layout-edit' : 'home'/);
  assert.ok(NOT_ADMIN_CSS.startsWith('[data-action=layout-edit]'));
});

test('the card applies the rules for a user who is not an administrator', () => {
  assert.match(CARD, /hass\.user\?\.is_admin \? '' : NOT_ADMIN_CSS/);
});
