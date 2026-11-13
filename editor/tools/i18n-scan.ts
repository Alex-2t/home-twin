// Translation scanner (D-036). Collects UI keys — the first argument of t() and N(), and the text of the static markup
// (shell.html) — and finds Cyrillic in code: the repository is English-only, Russian lives in src/i18n/ru.json.
//   node tools/i18n-scan.ts [--keys]  — --keys writes src/i18n/keys.json (key → where it is used), translators work from it.
// Cyrillic is allowed only in patterns that match names coming from Home Assistant in any language (regex literals,
// re('…'), new RegExp(…)) and on lines marked "allow-cyrillic" (language endonyms, Russian grammar rules, samples in tests).
import fs from 'node:fs';
import path from 'node:path';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';
import {stripTypeScriptTypes} from 'node:module';
import type {Comment, Node, Program} from 'acorn';

/** Something to fix: where it is and what it is. */
export interface Finding {
  file: string;
  line: number | undefined;
  text: string;
}

// Node says on stderr that stripTypeScriptTypes is experimental, the first time it is called. That line is not something the scan
// found, so it is left out: only that one warning, and only while the types are stripped.
function stripTypes(source: string): string {
  const emitWarning = process.emitWarning;
  process.emitWarning = (warning: string | Error, ...rest: unknown[]): void => {
    const aboutStripping =
      rest[0] === 'ExperimentalWarning' &&
      typeof warning === 'string' &&
      warning.startsWith('stripTypeScriptTypes ');
    if (!aboutStripping) Reflect.apply(emitWarning, process, [warning, ...rest]);
  };
  try {
    return stripTypeScriptTypes(source, {mode: 'strip'});
  } finally {
    process.emitWarning = emitWarning;
  }
}

const ROOT = new URL('..', import.meta.url).pathname;
const CYR = /[\u0400-\u04FF]/;
// keys are not collected from tests, generated code, the dev panel and the copied card lighting
const NO_KEYS = /\.test\.(js|ts)$|\/gen\/|devpanel\.(js|ts)$|\/card\//;

const files = (dir: string): string[] =>
  fs
    .readdirSync(path.join(ROOT, dir), {withFileTypes: true})
    .flatMap(e =>
      e.isDirectory()
        ? e.name === 'gen'
          ? []
          : files(path.join(dir, e.name))
        : /\.(js|ts)$/.test(e.name) && !e.name.endsWith('.d.ts')
          ? [path.join(dir, e.name)]
          : [],
    );

export function scan(): {keys: Map<string, Set<string>>; bad: Finding[]} {
  const keys = new Map<string, Set<string>>();
  const bad: Finding[] = [];
  const add = (k: string, where: string): void => {
    if (!keys.has(k)) keys.set(k, new Set());
    keys.get(k)!.add(where); // set just above when it was missing
  };
  // The parse keeps locations (locations: true), so every node and comment below has its loc.
  const lineOf = (n: Node | Comment): number => n.loc!.start.line;
  for (const f of files('src')) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const lines = src.split('\n');
    const allowed = (n: number): boolean => /allow-cyrillic/.test(lines[n - 1] || '');
    const comments: Comment[] = [];
    let ast: Program;
    try {
      // TypeScript: the types become spaces, so every line and column stays where it was (a TypeScript syntax error throws here)
      const code = f.endsWith('.ts') ? stripTypes(src) : src;
      ast = acorn.parse(code, {
        ecmaVersion: 'latest',
        sourceType: 'module',
        locations: true,
        onComment: comments,
      });
    } catch (e) {
      // acorn throws a SyntaxError that also says where (loc); stripping the types throws an Error that says it in its message
      const error = e as {loc?: {line: number}; message: string};
      bad.push({file: f, line: error.loc?.line, text: 'cannot parse: ' + error.message});
      continue;
    }
    for (const c of comments)
      if (CYR.test(c.value) && !allowed(lineOf(c)))
        bad.push({file: f, line: lineOf(c), text: 'comment: ' + c.value.trim().slice(0, 60)});
    const keysHere = !NO_KEYS.test(f);
    const where = (n: Node): string => f + ':' + lineOf(n);
    walk.fullAncestor(ast, (node, _s, anc) => {
      const parent = anc[anc.length - 2];
      const inCall =
        parent?.type === 'CallExpression' &&
        parent.arguments[0] === node &&
        parent.callee.type === 'Identifier' &&
        ['t', 'N'].includes(parent.callee.name);
      if (node.type === 'Literal' && typeof node.value === 'string' && inCall && keysHere)
        add(node.value, where(node));
      // a template without a tag always has its cooked text
      if (node.type === 'TemplateLiteral' && inCall && keysHere && !node.expressions.length)
        add(node.quasis[0].value.cooked!, where(node));
      // patterns for names from HA (re('floor lamp|…'), new RegExp, /kid|…/) hold words in every language
      const pattern =
        (node.type === 'Literal' && node.regex) ||
        anc.some(
          a =>
            (a.type === 'CallExpression' && a.callee.type === 'Identifier' && a.callee.name === 're') ||
            (a.type === 'NewExpression' && a.callee.type === 'Identifier' && a.callee.name === 'RegExp'),
        );
      if (pattern || allowed(lineOf(node))) return;
      if (node.type === 'Literal' && typeof node.value === 'string' && CYR.test(node.value))
        bad.push({file: f, line: lineOf(node), text: node.value.slice(0, 60)});
      else if (node.type === 'TemplateLiteral' && node.quasis.some(q => CYR.test(q.value.cooked ?? '')))
        bad.push({
          file: f,
          line: lineOf(node),
          text:
            '`' +
            node.quasis
              .map(q => q.value.cooked)
              .join('${…}')
              .slice(0, 60) +
            '`',
        });
    });
  }
  // static markup: text between tags and tooltips (translateDom translates them at startup); translate="no" — left as is
  const raw = fs.readFileSync(path.join(ROOT, 'src/shell.html'), 'utf8');
  if (CYR.test(raw))
    bad.push({
      file: 'src/shell.html',
      line: raw.split('\n').findIndex(l => CYR.test(l)) + 1,
      text: 'Cyrillic in markup',
    });
  const html = raw
    .replace(/<style>[\s\S]*?<\/style>|<script[\s\S]*?<\/script>|<!--[\s\S]*?-->/g, '')
    .replace(/<(\w+)[^>]*translate="no"[^>]*>[^<]*<\/\1>/g, '');
  for (const m of html.matchAll(/>([^<]+)<|\s(?:title|placeholder|aria-label)="([^"]+)"/g)) {
    const s = (m[1] ?? m[2])
      .trim()
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"');
    if (s && /\p{L}{2}/u.test(s)) add(s, 'src/shell.html');
  }
  return {keys, bad};
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const {keys, bad} = scan();
  // a file the types could not be stripped from has no line
  for (const b of bad) console.log(`${b.file}${b.line === undefined ? '' : ':' + b.line}  ${b.text}`);
  console.log(`keys ${keys.size}, Cyrillic in code: ${bad.length}`);
  if (process.argv.includes('--keys')) {
    const out = Object.fromEntries(
      [...keys]
        .sort((a, b) => a[0].localeCompare(b[0], 'en'))
        .map(([k, w]) => [k, [...w].slice(0, 3).join(' ')]),
    );
    fs.writeFileSync(path.join(ROOT, 'src/i18n/keys.json'), JSON.stringify(out, null, 1) + '\n');
    console.log('src/i18n/keys.json');
  }
}
