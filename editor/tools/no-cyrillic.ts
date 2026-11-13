// @ts-nocheck
// The repository is English-only. Lists Cyrillic in every tracked file and exits with 1 if any is found.
//   node editor/tools/no-cyrillic.ts   (from the repository root; CI runs it)
// Allowed: the Russian UI translations (ru.json); in JavaScript — words inside regex literals, re('…') and new RegExp(…)
// (they match names coming from Home Assistant in many languages) and lines marked "allow-cyrillic".
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';
import {stripTypeScriptTypes} from 'node:module';

const CYR = /[Ѐ-ӿ]/,
  ALLOWED_FILES = /(^|\/)ru\.json$/,
  TEXT = /\.(m?js|ts|py|md|html|css|json|ya?ml|txt|sh)$|(^|\/)(LICENSE|\.gitignore)$/;
const root = execFileSync('git', ['rev-parse', '--show-toplevel'], {encoding: 'utf8'}).trim();
const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], {cwd: root, encoding: 'utf8'})
  .split('\n')
  .filter(f => f && TEXT.test(f) && !ALLOWED_FILES.test(f) && fs.existsSync(root + '/' + f));
const bad = [];
for (const f of files) {
  const src = fs.readFileSync(root + '/' + f, 'utf8');
  if (!CYR.test(src)) continue;
  const lines = src.split('\n'),
    allowed = n => /allow-cyrillic/.test(lines[n - 1] || '');
  if (!/\.(m?js|ts)$/.test(f)) {
    lines.forEach((l, i) => {
      if (CYR.test(l)) bad.push(`${f}:${i + 1}: ${l.trim().slice(0, 80)}`);
    });
    continue;
  }
  const comments = [];
  let ast;
  // TypeScript: the types become spaces, so every line and column stays where it was
  const code = /\.ts$/.test(f) ? stripTypeScriptTypes(src, {mode: 'strip'}) : src;
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
    if (CYR.test(c.value) && !allowed(c.loc.start.line))
      bad.push(`${f}:${c.loc.start.line}: comment ${c.value.trim().slice(0, 60)}`);
  walk.fullAncestor(ast, (node, _s, anc) => {
    if (node.regex) return;
    const pattern = anc.some(
      a =>
        (a.type === 'CallExpression' && a.callee.type === 'Identifier' && a.callee.name === 're') ||
        (a.type === 'NewExpression' && a.callee.name === 'RegExp'),
    );
    if (pattern || allowed(node.loc.start.line)) return;
    if (node.type === 'Literal' && typeof node.value === 'string' && CYR.test(node.value))
      bad.push(`${f}:${node.loc.start.line}: ${node.value.slice(0, 60)}`);
    else if (node.type === 'TemplateLiteral' && node.quasis.some(q => CYR.test(q.value.cooked ?? '')))
      bad.push(`${f}:${node.loc.start.line}: template`);
  });
}
for (const b of bad) console.log(b);
console.log(bad.length ? `Cyrillic found: ${bad.length}` : 'No Cyrillic.');
process.exit(bad.length ? 1 : 0);
