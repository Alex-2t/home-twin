// The source itself: no code hides at the end of a line comment. When the TypeScript move reflowed the dense old lines, a
// comment swallowed the code after it on its line: from 2026-11-10 a floor or table lamp drew only its stand, no shade and no
// bulb (scene.ts), and nothing failed — the colour check of 2026-11-14 found it by looking.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {stripTypeScriptTypes} from 'node:module';
import * as acorn from 'acorn';
import type {Comment} from 'acorn';

const EDITOR_ROOT = new URL('../..', import.meta.url).pathname;
const SOURCE_FOLDERS = ['src', 'demo', 'tools'];
// Code glued on after a comment: a call or a declaration right after `);`, with no space, as minified code reads — prose
// puts a space after a semicolon.
const CODE_IN_COMMENT = /\);(?:[A-Za-z_$][\w$.]*\(|const |let |if\(|for\()/;

/** Every TypeScript file under a folder, except type declarations. */
function sourceFiles(folder: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(folder, {withFileTypes: true})) {
    const full = path.join(folder, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(full));
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) files.push(full);
  }
  return files;
}

/** A file's line comments, as the parser sees them (a `//` inside a string or a regular expression is none). */
function lineComments(file: string): Comment[] {
  const source = stripTypeScriptTypes(fs.readFileSync(file, 'utf8'), {mode: 'strip'});
  const comments: Comment[] = [];
  acorn.parse(source, {ecmaVersion: 'latest', sourceType: 'module', locations: true, onComment: comments});
  return comments.filter(comment => comment.type === 'Line');
}

test('no code hides at the end of a line comment', () => {
  const found: string[] = [];
  for (const folder of SOURCE_FOLDERS)
    for (const file of sourceFiles(path.join(EDITOR_ROOT, folder)))
      for (const comment of lineComments(file))
        if (CODE_IN_COMMENT.test(comment.value))
          found.push(
            `${path.relative(EDITOR_ROOT, file)}:${comment.loc?.start.line} ${comment.value.trim()}`,
          );
  assert.deepEqual(found, []);
});
