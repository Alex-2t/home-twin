// Code swallowed by a line comment: when dense code was spread over lines, a statement written after a `//` on the same line
// became part of the comment and silently stopped running (the floor and table lamps' shades in scene.ts, D-061 to
// 2026-11-14). Prettier writes one statement per line, so a `);` followed straight by a name inside a comment is such code.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const editorRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SWALLOWED = /\/\/.*\);[A-Za-z_]/;

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'gen' ? [] : sourceFiles(file);
    return entry.name.endsWith('.ts') ? [file] : [];
  });
}

test('no code is left inside a line comment', () => {
  const found: string[] = [];
  for (const file of [
    ...sourceFiles(path.join(editorRoot, 'src')),
    ...sourceFiles(path.join(editorRoot, 'demo')),
  ]) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (SWALLOWED.test(line)) found.push(`${path.relative(editorRoot, file)}:${i + 1}`);
    });
  }
  assert.deepEqual(found, []);
});
