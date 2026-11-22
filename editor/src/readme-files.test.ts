// The READMEs name the files of the repository: the editor's "What is where" map, the paths in the text, the links from the
// integration's page. Renamed files (the move from .js to .ts, D-087) left them pointing at files that were gone for weeks, so
// every path they name is checked here against the disk.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const editorRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.join(editorRoot, '..');
const EDITOR_README = path.join(editorRoot, 'README.md');
const INTEGRATION_README = path.join(repoRoot, 'integration', 'README.md');
// a file the text names with its folder: src/core/plan.ts, demo/homes.ts, docs/plan-format.md
const PATH_IN_TEXT =
  /\b(?:src|demo|tools|assets|docs|integration|custom_components)\/[A-Za-z0-9_@./-]+\.[a-z]+\b/g;
// a Markdown link to a file of the repository: [name](../editor/src/ha-panel.ts)
const RELATIVE_LINK = /\]\((\.\.?\/[^)#]+)\)/g;
// a line of the "What is where" map: names (one or several, comma-separated), then the description
const MAP_LINE = /^( *)((?:[A-Za-z0-9_@./-]+)(?:, [A-Za-z0-9_@./-]+)*)(?:\s{2,}|\s*$)/;
const FILE_NAME = /^[A-Za-z0-9_@.-]+\.[a-z]+$/;
const NOT_IN_GIT = new Set(['src/gen/']);

const integrationRoot = path.join(repoRoot, 'integration');
// a path in the text is written from the folder its README is about, or from the repository's root
const ROOTS = [editorRoot, integrationRoot, repoRoot];

function missing(files: string[], roots: string[]): string[] {
  const unique = [...new Set(files)];
  return unique.filter(file => !roots.some(root => fs.existsSync(path.join(root, file))));
}

/** The files named in the text, apart from the build's outputs and the folders not in git. */
function pathsInText(readme: string): string[] {
  return [...readme.matchAll(PATH_IN_TEXT)]
    .map(match => match[0])
    .filter(
      file =>
        !file.startsWith('src/gen/') && !file.includes('/frontend/') && !file.startsWith('integration/dev/'),
    );
}

/** Every file the editor's "What is where" map names, with its folder from the lines above it. */
function mapEntries(readme: string): string[] {
  const start = readme.indexOf('## What is where');
  const block = readme.slice(readme.indexOf('```', start) + 3);
  const lines = block.slice(0, block.indexOf('```')).split('\n');
  const folders: {indent: number; folder: string}[] = [];
  const files: string[] = [];
  for (const line of lines) {
    const match = MAP_LINE.exec(line);
    if (!match) continue;
    const indent = match[1].length;
    while (folders.length > 0 && folders[folders.length - 1].indent >= indent) folders.pop();
    const parent = folders.length > 0 ? folders[folders.length - 1].folder : '';
    const names = match[2].split(', ');
    for (const name of names) {
      // "src/ha-panel.ts, ha-app.ts": the names after the first live in the first one's folder
      const full =
        name.includes('/') || names.indexOf(name) === 0
          ? parent + name
          : parent + path.dirname(names[0]) + '/' + name;
      const entry = full.replace(/^\.\//, '').replace(/\/\.\//g, '/');
      if (entry.endsWith('/')) {
        if (!NOT_IN_GIT.has(entry)) files.push(entry);
        folders.push({indent, folder: entry});
      } else if (FILE_NAME.test(path.basename(entry))) {
        files.push(entry);
      }
    }
  }
  return files;
}

test('the editor README names only files that exist', () => {
  const readme = fs.readFileSync(EDITOR_README, 'utf8');
  assert.deepEqual(missing(pathsInText(readme), ROOTS), []);
  assert.deepEqual(missing(mapEntries(readme), [editorRoot]), []);
});

test('the integration README names and links only files that exist', () => {
  const readme = fs.readFileSync(INTEGRATION_README, 'utf8');
  const links = [...readme.matchAll(RELATIVE_LINK)].map(match => match[1]);
  assert.deepEqual(missing(links, [integrationRoot]), []);
  assert.deepEqual(missing(pathsInText(readme), ROOTS), []);
});
