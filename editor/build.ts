// @ts-nocheck
// Builds the editor into a single file dist/index.html. node build.ts [--serve] [--demo=<module>]
// The demo apartment is embedded into src/gen/ (in .gitignore): demo/own.ts is the owner's apartment, local only (.gitignore), and it
// is used if the file exists; otherwise demo/typical.ts, the typical three-room apartment from the repository. --demo=<name> takes
// demo/<name>.ts instead (--demo=typical, --demo=homes/studio). The ten typical homes (demo/homes.ts, D-030) go in too: the start
// screen's examples (D-062).
import fs from 'node:fs';
import * as esbuild from 'esbuild';
import {execFile} from 'node:child_process';

fs.mkdirSync('src/gen', {recursive: true});
fs.mkdirSync('dist', {recursive: true});

// Kenney models (CC0)
const models = Object.fromEntries(
  fs
    .readdirSync('assets/kenney')
    .filter(f => f.endsWith('.glb'))
    .map(f => [f.slice(0, -4), fs.readFileSync('assets/kenney/' + f).toString('base64')]),
);
fs.writeFileSync('src/gen/models.gen.js', 'export const MODELS=' + JSON.stringify(models) + ';\n');

// Demo (D-033 sensors, D-048 devices, D-049 favorites, “Statistics”, weather) — in the apartment module, shared parts in demo/kit.ts
const demoArg = process.argv.find(a => a.startsWith('--demo='));
const demoName = demoArg?.slice(7) || (fs.existsSync('demo/own.ts') ? 'own' : 'typical');
async function genDemo() {
  const {HA, DEMO, DEMO_UNDERLAY} = await (await import(`./demo/${demoName}.ts`)).default();
  fs.writeFileSync(
    'src/gen/demo.gen.js',
    `export const DEMO_NAME=${JSON.stringify(demoName)};\nexport const HA=${JSON.stringify(HA)};\nexport const DEMO=${JSON.stringify(DEMO)};\nexport const DEMO_UNDERLAY=${JSON.stringify(DEMO_UNDERLAY)};\n`,
  );
  console.log('demo:', demoName);
  const {HOMES} = await import('./demo/homes.ts');
  // a home whose module fails to load (being written) is left out with a warning, the build goes on
  const examples = (
    await Promise.all(
      HOMES.map(async h => {
        try {
          const d = await h.load();
          return {id: h.id, HA: d.HA, DEMO: d.DEMO};
        } catch (e) {
          console.warn('example left out:', h.id, '—', e.message.split('\n')[0]);
          return null;
        }
      }),
    )
  ).filter(Boolean);
  fs.writeFileSync('src/gen/examples.gen.js', 'export const EXAMPLES=' + JSON.stringify(examples) + ';\n');
}
await genDemo();
// --gen-demo: only the demo files (the dev server runs it in a fresh process when demo/ changes: imported modules are cached)
if (process.argv.includes('--gen-demo')) process.exit(0);

// styles and the shell are read on every build: with --serve they can be edited without a restart (styles used to be read once at
// startup, and a rebuild after a code edit overwrote the new styles with the old ones)
const html = js =>
  fs
    .readFileSync('src/shell.html', 'utf8')
    .replace('/*STYLES*/', () => fs.readFileSync('src/styles.css', 'utf8'))
    .replace('/*BUNDLE*/', () => js.replace(/<\/script/g, '<\\/script'));
// .css imported from JS as text: the apartment card styles (src/look/card.css) go into its Shadow DOM
const opts = {
  entryPoints: ['src/main.ts'],
  outfile: 'dist/bundle.js',
  bundle: true,
  format: 'esm',
  minify: true,
  write: false,
  target: 'es2022',
  logLevel: 'warning',
  loader: {'.css': 'text'},
  charset: 'utf8',
};
const write = r => {
  const out = html(r.outputFiles[0].text);
  fs.writeFileSync('dist/index.html', out);
  console.log('dist/index.html', (out.length / 1024).toFixed(0), 'KB');
};
// The Home Assistant panel (the custom_components/home_twin integration): a single module frontend/panel.js with the styles and
// shell inside (src/gen/shell.gen.js), without the demo apartment or personal data. Non-ASCII text (e.g. Cyrillic) stays as is (charset utf8):
// module scripts are always UTF-8, and \uXXXX escapes bloated the bundle by a third.
const PANEL = '../custom_components/home_twin/frontend/panel.js';
function shellGen() {
  const src = fs.readFileSync('src/shell.html', 'utf8'),
    m = src.match(/<body([^>]*)>([\s\S]*?)<script type="module">/);
  const body = [...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(x => [x[1], x[2]]);
  // inline scripts of the page (the example cover) do not run in the panel: left out
  fs.writeFileSync(
    'src/gen/shell.gen.js',
    `export const SHELL=${JSON.stringify(m[2].replace(/<script>[\s\S]*?<\/script>\n?/g, ''))};\nexport const BODY=${JSON.stringify(body)};\nexport const STYLES=${JSON.stringify(fs.readFileSync('src/styles.css', 'utf8'))};\n`,
  );
}
shellGen();
fs.mkdirSync('../custom_components/home_twin/frontend', {recursive: true});
const panelOpts = {...opts, entryPoints: ['src/ha-panel.ts'], outfile: PANEL, write: true};
const panelDone = () => console.log('panel.js', (fs.statSync(PANEL).size / 1024).toFixed(0), 'KB');
// The dashboard card (D-059): card.js — a small file HA loads on every page (no imports); card-app.js — the 3D and the home panel,
// loaded only where a card is shown
const FRONT = '../custom_components/home_twin/frontend/';
const cardOpts = ['card', 'card-app'].map(n => ({
  ...opts,
  entryPoints: [`src/${n}.ts`],
  outfile: FRONT + n + '.js',
  write: true,
  plugins: [
    {
      name: 'done',
      setup(b) {
        b.onEnd(r => {
          if (!r.errors.length)
            console.log(n + '.js', (fs.statSync(FRONT + n + '.js').size / 1024).toFixed(0), 'KB');
        });
      },
    },
  ],
}));
if (process.argv.includes('--serve')) {
  const ctx = await esbuild.context({
    ...opts,
    plugins: [
      {
        name: 'html',
        setup(b) {
          b.onEnd(r => {
            if (!r.errors.length) write(r);
          });
        },
      },
    ],
  });
  await ctx.watch();
  const {port} = await ctx.serve({servedir: 'dist', port: 8766});
  console.log(`http://localhost:${port}/`);
  // styles and the shell are not in esbuild's module graph — watch them ourselves
  const pctx = await esbuild.context({
    ...panelOpts,
    plugins: [
      {
        name: 'done',
        setup(b) {
          b.onEnd(r => {
            if (!r.errors.length) panelDone();
          });
        },
      },
    ],
  });
  await pctx.watch();
  for (const o of cardOpts) await (await esbuild.context(o)).watch();
  // watch the folder, not the files: editors save by replacing the file, and a watch on the old file then goes silent on macOS
  let t = 0;
  fs.watch('src', (_e, f) => {
    if (!['styles.css', 'shell.html'].includes(String(f))) return;
    clearTimeout(t);
    t = setTimeout(() => {
      shellGen();
      ctx.rebuild().catch(() => {});
    }, 80);
  });
  // the demo homes (demo/): regenerated in a child process, esbuild then sees src/gen/ change and rebuilds
  let dt = 0;
  fs.watch('demo', {recursive: true}, (_e, f) => {
    if (!String(f).endsWith('.mjs')) return;
    clearTimeout(dt);
    dt = setTimeout(() => {
      execFile(process.execPath, ['build.ts', '--gen-demo', ...(demoArg ? [demoArg] : [])], (e, out, err) => {
        process.stdout.write(out);
        process.stderr.write(err);
      });
    }, 250);
  });
} else {
  write(await esbuild.build(opts));
  await esbuild.build(panelOpts);
  panelDone();
  for (const o of cardOpts) await esbuild.build(o);
}
