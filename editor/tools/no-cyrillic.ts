// The repository is English-only. Lists Cyrillic in every tracked file and exits with 1 if any is found.
//   node editor/tools/no-cyrillic.ts   (from the repository root; CI runs it)
// Allowed: the Russian UI translations (ru.json); in JavaScript — words inside regex literals, re('…') and new RegExp(…)
// (they match names coming from Home Assistant in many languages) and lines marked "allow-cyrillic".
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';
import {stripTypeScriptTypes} from 'node:module';
import type {Comment, Node, Program} from 'acorn';

// Node says on stderr that stripTypeScriptTypes is experimental, the first time it is called. That line is not something the check
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

const CYR = /[Ѐ-ӿ]/;
const ALLOWED_FILES = /(^|\/)ru\.json$/;
const TEXT = /\.(m?js|ts|py|md|html|css|json|ya?ml|txt|sh)$|(^|\/)(LICENSE|\.gitignore)$/;
const root = execFileSync('git', ['rev-parse', '--show-toplevel'], {encoding: 'utf8'}).trim();
const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], {cwd: root, encoding: 'utf8'})
  .split('\n')
  .filter(f => f && TEXT.test(f) && !ALLOWED_FILES.test(f) && fs.existsSync(root + '/' + f));
const bad: string[] = [];
// The parse keeps locations (locations: true), so every node and comment has its loc.
const lineOf = (n: Node | Comment): number => n.loc!.start.line;
for (const f of files) {
  const src = fs.readFileSync(root + '/' + f, 'utf8');
  if (!CYR.test(src)) continue;
  const lines = src.split('\n');
  const allowed = (n: number): boolean => /allow-cyrillic/.test(lines[n - 1] || '');
  if (!/\.(m?js|ts)$/.test(f)) {
    lines.forEach((l, i) => {
      if (CYR.test(l)) bad.push(`${f}:${i + 1}: ${l.trim().slice(0, 80)}`);
    });
    continue;
  }
  const comments: Comment[] = [];
  let ast: Program;
  // TypeScript: the types become spaces, so every line and column stays where it was
  const code = /\.ts$/.test(f) ? stripTypes(src) : src;
  try {
    ast = acorn.parse(code, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      locations: true,
      onComment: comments,
      allowHashBang: true,
    });
  } catch {
    lines.forEach((l, i) => {
      if (CYR.test(l) && !allowed(i + 1)) bad.push(`${f}:${i + 1}: ${l.trim().slice(0, 80)}`);
    });
    continue;
  }
  for (const c of comments)
    if (CYR.test(c.value) && !allowed(lineOf(c)))
      bad.push(`${f}:${lineOf(c)}: comment ${c.value.trim().slice(0, 60)}`);
  walk.fullAncestor(ast, (node, _s, anc) => {
    if (node.type === 'Literal' && node.regex) return;
    const pattern = anc.some(
      a =>
        (a.type === 'CallExpression' && a.callee.type === 'Identifier' && a.callee.name === 're') ||
        (a.type === 'NewExpression' && a.callee.type === 'Identifier' && a.callee.name === 'RegExp'),
    );
    if (pattern || allowed(lineOf(node))) return;
    if (node.type === 'Literal' && typeof node.value === 'string' && CYR.test(node.value))
      bad.push(`${f}:${lineOf(node)}: ${node.value.slice(0, 60)}`);
    else if (node.type === 'TemplateLiteral' && node.quasis.some(q => CYR.test(q.value.cooked ?? '')))
      bad.push(`${f}:${lineOf(node)}: template`);
  });
}
for (const b of bad) console.log(b);
console.log(bad.length ? `Cyrillic found: ${bad.length}` : 'No Cyrillic.');
process.exit(bad.length ? 1 : 0);
