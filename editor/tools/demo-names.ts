// Writes src/i18n/demo/keys.json: every name the examples hold (rooms, lamps, sensors, devices, scenes; src/i18n/demo-names.ts
// says which), each with the examples it is in. Translators fill src/i18n/demo/<lang>.json from it (D-120).
//   node tools/demo-names.ts
import fs from 'node:fs';
import {HOMES} from '../demo/homes.ts';
import {demoNames} from '../src/i18n/demo-names.ts';

const where = new Map<string, string[]>();
for (const home of HOMES) {
  const data = await home.load();
  for (const name of demoNames(data)) where.set(name, [...(where.get(name) || []), home.id]);
}
const sorted = Object.fromEntries([...where].sort(([a], [b]) => a.localeCompare(b, 'en')));
fs.writeFileSync('src/i18n/demo/keys.json', JSON.stringify(sorted, null, 1) + '\n');
console.log(`src/i18n/demo/keys.json: ${where.size} names`);
