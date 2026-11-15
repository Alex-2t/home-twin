// Renders each built-in example (demo/homes.ts) once into a small WebP picture for its card on the start screen and in the
// gallery (D-113): assets/renders/<id>.webp, about 640 × 400 and under 60 KB. Run it again after an example changes:
//   node tools/render-examples.ts [--only loft,studio]
// It builds the editor with the typical demo, opens each example in headless Chrome, shows the home alone in 3D from its home
// view (the same camera and framing as the AI build's editor-3d.png, so the AI-built homes' renders match these) and takes a
// screenshot, made small in the page itself (no image library needed). Chrome: CHROME_PATH, or the usual macOS place.
//   node tools/render-examples.ts --turntable --only loft,studio [--sheets a,b,c] [--lights day,night]
// The turntable of a card (D-114): the home from 72 angles round it (every 5°) at the still render's height, by day and at
// night with only the rooms chosen in demo/homes.ts lit, each light in three sheets of 24: a — 0°, 15°, 30° …, b — 5°,
// 20° …, c — 10°, 25° … (assets/turntable/<id>-<light>.webp, -b.webp, -c.webp; turntable-math.ts their layout). All the
// sheets share sheet a's frame size, so --sheets b,c adds the in-between angles to sheets made before.
// The home turns round its own middle at one frame size that holds it at every angle, so the still render
// (assets/renders/<id>.webp) is written again from sheet a's frame 0 in the light the card starts in: it starts turning from
// the picture it shows.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync, spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {HOMES} from '../demo/homes.ts';
import type {TurntableLight, TurntableLook} from '../demo/homes.ts';
import {
  TURNTABLE_COLUMNS,
  TURNTABLE_FRAMES,
  TURNTABLE_SHEETS,
  sheetSuffix,
  TURNTABLE_FRAME_HEIGHT,
  TURNTABLE_FRAME_WIDTH,
  TURNTABLE_ROWS,
} from '../src/editor/turntable-math.ts';

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT_DIR = 'assets/renders';
const TURNTABLE_DIR = 'assets/turntable';
// A sheet's size limit, and the quality it starts at (the steps down as for the still render).
const SHEET_MAX_BYTES = 400 * 1024;
const SHEET_FIRST_QUALITY = 0.86;
// frame() in the editor's scene puts the look-at point this high before it centres the silhouette (core/scene.ts).
const FRAME_TARGET_HEIGHT = 0.8;
// After the night is switched on, its lamps fade in.
const NIGHT_SETTLE_MS = 2500;
// The page as the AI build's screenshots take it (its tools/shot.ts): 1600 × 1000, then made 640 × 400.
const VIEWPORT_WIDTH = 1600;
const VIEWPORT_HEIGHT = 1000;
const RENDER_WIDTH = 640;
const RENDER_HEIGHT = 400;
const MAX_BYTES = 60 * 1024;
// WebP quality: the first try, the step down while the picture is too large, and the lowest tried.
const FIRST_QUALITY = 0.86;
const QUALITY_STEP = 0.06;
const LOWEST_QUALITY = 0.4;
const DRAWN_TIMEOUT_MS = 90000;
const STILL_TIMEOUT_MS = 20000;
const STILL_LOOK_MS = 250;
const SETTLE_MS = 1000;
const POLL_MS = 100;

/** A message from Chrome's DevTools protocol: an answer to a call (id) or an event (method). */
interface DevToolsMessage {
  id?: number;
  method?: string;
  sessionId?: string;
  result?: Record<string, unknown>;
  error?: {message: string};
}

/** One connection to Chrome: call(method, params, session) answers with the call's result. */
interface DevTools {
  call(
    method: string,
    params?: Record<string, unknown>,
    sessionId?: string,
  ): Promise<Record<string, unknown>>;
  close(): void;
}

const pause = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/** Starts headless Chrome with a fresh profile and gives the address of its DevTools socket. */
async function startChrome(profileDir: string): Promise<{socketUrl: string; stop: () => Promise<void>}> {
  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${profileDir}`,
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--no-first-run',
      '--no-default-browser-check',
      '--allow-file-access-from-files',
      '--hide-scrollbars',
      `--window-size=${VIEWPORT_WIDTH},${VIEWPORT_HEIGHT}`,
    ],
    {stdio: 'ignore'},
  );
  const portFile = path.join(profileDir, 'DevToolsActivePort');
  const until = Date.now() + 30000;
  while (!fs.existsSync(portFile) || !fs.readFileSync(portFile, 'utf8').includes('\n')) {
    if (Date.now() > until) {
      chrome.kill();
      throw new Error('Chrome did not start: set CHROME_PATH');
    }
    await pause(POLL_MS);
  }
  const [port, socketPath] = fs.readFileSync(portFile, 'utf8').trim().split('\n');
  // Stopped and waited for: its profile can only be removed once it no longer writes there.
  const stop = async (): Promise<void> => {
    const exited = new Promise(resolve => chrome.once('exit', resolve));
    chrome.kill();
    await exited;
  };
  return {socketUrl: `ws://127.0.0.1:${port}${socketPath}`, stop};
}

/** Connects to Chrome's DevTools socket. */
async function connect(socketUrl: string): Promise<DevTools> {
  const socket = new WebSocket(socketUrl);
  await new Promise<void>((resolve, reject) => {
    socket.onopen = () => resolve();
    socket.onerror = () => reject(new Error('no DevTools connection'));
  });
  let lastId = 0;
  const waiting = new Map<
    number,
    {resolve: (result: Record<string, unknown>) => void; reject: (error: Error) => void}
  >();
  socket.onmessage = event => {
    const message = JSON.parse(String(event.data)) as DevToolsMessage;
    if (message.id === undefined) return;
    const call = waiting.get(message.id);
    waiting.delete(message.id);
    if (message.error) call?.reject(new Error(message.error.message));
    else call?.resolve(message.result || {});
  };
  return {
    call: (method, params = {}, sessionId) =>
      new Promise((resolve, reject) => {
        lastId += 1;
        waiting.set(lastId, {resolve, reject});
        socket.send(JSON.stringify({id: lastId, method, params, sessionId}));
      }),
    close: () => socket.close(),
  };
}

/** Runs an expression in the page and gives its value (a promise is awaited). */
async function evaluate<T>(devTools: DevTools, sessionId: string, expression: string): Promise<T> {
  const answer = await devTools.call(
    'Runtime.evaluate',
    {expression, awaitPromise: true, returnByValue: true},
    sessionId,
  );
  const result = answer.result as {value?: T};
  if (answer.exceptionDetails) throw new Error(`page error in: ${expression.slice(0, 80)}`);
  return result.value as T;
}

/** Asks the page until the expression is true; throws after the timeout. */
async function waitFor(
  devTools: DevTools,
  sessionId: string,
  expression: string,
  timeoutMs: number,
): Promise<void> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (await evaluate<boolean>(devTools, sessionId, expression).catch(() => false)) return;
    await pause(POLL_MS);
  }
  throw new Error(`timed out waiting for: ${expression}`);
}

/** Waits until the 3D camera has stopped moving (it flies to the home view). */
async function viewStill(devTools: DevTools, sessionId: string): Promise<void> {
  const until = Date.now() + STILL_TIMEOUT_MS;
  let lastView = '';
  while (Date.now() < until) {
    const view = await evaluate<string>(
      devTools,
      sessionId,
      'JSON.stringify(window.editor?.ed?.view.getView?.() ?? null)',
    );
    if (view === lastView) return;
    lastView = view;
    await pause(STILL_LOOK_MS);
  }
  throw new Error('the 3D view did not come to rest');
}

// In the page: the screenshot drawn small on a canvas and encoded as WebP, a quality lower each time it is too large.
const SHRINK_IN_PAGE = `async (pngBase64, width, height, maxBytes, first, step, lowest) => {
  const image = new Image();
  image.src = 'data:image/png;base64,' + pngBase64;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, width, height);
  let quality = first;
  let url = canvas.toDataURL('image/webp', quality);
  while (url.length * 0.75 > maxBytes && quality - step >= lowest) {
    quality -= step;
    url = canvas.toDataURL('image/webp', quality);
  }
  return url.slice(url.indexOf(',') + 1);
}`;

/** A page of the editor in its own browser context: the DevTools session that drives it, and how to close it. */
interface OpenPage {
  sessionId: string;
  close: () => Promise<void>;
}

/** One example opened in its own browser context (fresh storage) and shown alone in 3D from its home view, at rest. */
async function openExampleBare(devTools: DevTools, pageUrl: string, id: string): Promise<OpenPage> {
  const {browserContextId} = await devTools.call('Target.createBrowserContext');
  const {targetId} = await devTools.call('Target.createTarget', {url: 'about:blank', browserContextId});
  const {sessionId} = (await devTools.call('Target.attachToTarget', {targetId, flatten: true})) as {
    sessionId: string;
  };
  const close = async (): Promise<void> => {
    await devTools.call('Target.closeTarget', {targetId});
    await devTools.call('Target.disposeBrowserContext', {browserContextId});
  };
  try {
    await devTools.call(
      'Emulation.setDeviceMetricsOverride',
      {width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT, deviceScaleFactor: 1, mobile: false},
      sessionId,
    );
    await devTools.call('Page.enable', {}, sessionId);
    await devTools.call('Page.navigate', {url: `${pageUrl}?render=${id}#/example/${id}/`}, sessionId);
    await waitFor(
      devTools,
      sessionId,
      "document.body?.dataset.ready === 'true' && !!document.getElementById('loading')?.hidden",
      DRAWN_TIMEOUT_MS,
    );
    const bare = await evaluate<boolean>(
      devTools,
      sessionId,
      `(() => {
        const ed = window.editor?.ed;
        if (!ed?.setBare) return false;
        ed.setBare('3d');
        ed.view.setNight(false);
        ed.view.home();
        return true;
      })()`,
    );
    if (!bare) throw new Error('this editor has no bare 3D view');
    await viewStill(devTools, sessionId);
    await pause(SETTLE_MS);
    return {sessionId, close};
  } catch (error) {
    await close();
    throw error;
  }
}

/** The page as it is now, a PNG in base64. */
async function screenshot(devTools: DevTools, sessionId: string): Promise<string> {
  const shot = (await devTools.call('Page.captureScreenshot', {format: 'png'}, sessionId)) as {data: string};
  return shot.data;
}

/** A screenshot made the still render's size and WebP (SHRINK_IN_PAGE). */
async function stillFrom(devTools: DevTools, sessionId: string, pngBase64: string): Promise<Buffer> {
  const webpBase64 = await evaluate<string>(
    devTools,
    sessionId,
    `(${SHRINK_IN_PAGE})(${JSON.stringify(pngBase64)}, ${RENDER_WIDTH}, ${RENDER_HEIGHT}, ${MAX_BYTES}, ${FIRST_QUALITY}, ${QUALITY_STEP}, ${LOWEST_QUALITY})`,
  );
  return Buffer.from(webpBase64, 'base64');
}

/** One example's still render: its home view, as the AI build's pictures are taken. */
async function renderExample(devTools: DevTools, pageUrl: string, id: string): Promise<Buffer> {
  const page = await openExampleBare(devTools, pageUrl, id);
  try {
    return await stillFrom(devTools, page.sessionId, await screenshot(devTools, page.sessionId));
  } finally {
    await page.close();
  }
}

/** The editor's camera view (scene.ts getView): the look-at point, the angles round and down, the half frame in metres. */
interface CameraView {
  t: [number, number, number];
  theta: number;
  phi: number;
  fit: [number, number];
}

/** Half the size of the rooms' outline on the plan, metres: along x and along y (the 3D view's z). */
interface PlanHalfSize {
  x: number;
  y: number;
}

/**
 * The turntable's views: the home's middle and a frame size that holds the home at every angle, from its home view (the
 * editor fits that one to the silhouette, core/scene.ts frame). The editor's camera looks at the look-at point from
 * (sin φ sin θ, cos φ, sin φ cos θ); its right is (cos θ, 0, −sin θ) and its up (−cos φ sin θ, sin φ, −cos φ cos θ). frame()
 * puts the look-at point at the model box's middle at FRAME_TARGET_HEIGHT and moves it up the screen to the silhouette's
 * middle; a box's silhouette is centred on its middle, so that middle is found again, and the box's half sizes from the
 * plan's outline (plus the walls, found from the frame's width) and the frame's height. Frame k looks from θ0 − k · 15°.
 */
export function turntableViews(
  home: CameraView,
  plan: PlanHalfSize,
  frames: number = TURNTABLE_FRAMES,
  sheet: number = 0,
): CameraView[] {
  const {theta, phi} = home;
  const [tx, ty, tz] = home.t;
  const up = [-Math.cos(phi) * Math.sin(theta), Math.sin(phi), -Math.cos(phi) * Math.cos(theta)];
  const shiftUp = (ty - FRAME_TARGET_HEIGHT) / up[1];
  const middle: [number, number, number] = [
    tx - shiftUp * up[0],
    FRAME_TARGET_HEIGHT + shiftUp / Math.sin(phi),
    tz - shiftUp * up[2],
  ];
  const across = Math.abs(Math.cos(theta)) + Math.abs(Math.sin(theta));
  const walls =
    (home.fit[0] - plan.x * Math.abs(Math.cos(theta)) - plan.y * Math.abs(Math.sin(theta))) / across;
  const halfX = plan.x + Math.max(0, walls);
  const halfZ = plan.y + Math.max(0, walls);
  const deep = (angle: number): number =>
    halfX * Math.abs(Math.sin(angle)) + halfZ * Math.abs(Math.cos(angle));
  const halfY = Math.max(0, (home.fit[1] - Math.cos(phi) * deep(theta)) / Math.sin(phi));
  // backwards round: as the frames go on, the near side of the home moves right, as a drag to the right turns it
  const step = (2 * Math.PI) / frames;
  const angles = Array.from({length: frames}, (_, k) => theta - k * step);
  // the frame size from sheet a's angles, so every sheet has the one size (the in-between angles hardly differ)
  const widths = angles.map(angle => halfX * Math.abs(Math.cos(angle)) + halfZ * Math.abs(Math.sin(angle)));
  const heights = angles.map(angle => halfY * Math.sin(phi) + Math.cos(phi) * deep(angle));
  const fit: [number, number] = [Math.max(home.fit[0], ...widths), Math.max(home.fit[1], ...heights)];
  const offset = (sheet * step) / TURNTABLE_SHEETS;
  return angles.map(angle => ({t: middle, theta: angle - offset, phi, fit}));
}

// In the page: the sheet's canvas (made on the first frame), a screenshot drawn small into a cell, and the sheet as WebP.
const SHEET_IN_PAGE = `{
  cell: async (pngBase64, index, columns, rows, width, height) => {
    if (!window.__sheet || index === 0) {
      const canvas = document.createElement('canvas');
      canvas.width = columns * width;
      canvas.height = rows * height;
      window.__sheet = canvas;
    }
    const image = new Image();
    image.src = 'data:image/png;base64,' + pngBase64;
    await image.decode();
    const context = window.__sheet.getContext('2d');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    const column = index % columns;
    const row = Math.floor(index / columns);
    context.drawImage(image, column * width, row * height, width, height);
    return true;
  },
  encode: (maxBytes, first, step, lowest) => {
    let quality = first;
    let url = window.__sheet.toDataURL('image/webp', quality);
    while (url.length * 0.75 > maxBytes && quality - step >= lowest) {
      quality -= step;
      url = window.__sheet.toDataURL('image/webp', quality);
    }
    return url.slice(url.indexOf(',') + 1);
  },
}`;

/** The turntable's frames painted into the sheet, flying the camera to each view in turn. Gives frame 0's screenshot. */
async function paintSheet(devTools: DevTools, sessionId: string, views: CameraView[]): Promise<string> {
  let first = '';
  for (const [index, view] of views.entries()) {
    await evaluate(devTools, sessionId, `window.editor.ed.view.flyTo(${JSON.stringify(view)})`);
    await viewStill(devTools, sessionId);
    await pause(SETTLE_MS);
    const png = await screenshot(devTools, sessionId);
    if (index === 0) first = png;
    await evaluate(
      devTools,
      sessionId,
      `(${SHEET_IN_PAGE}).cell(${JSON.stringify(png)}, ${index}, ${TURNTABLE_COLUMNS}, ${TURNTABLE_ROWS}, ${TURNTABLE_FRAME_WIDTH}, ${TURNTABLE_FRAME_HEIGHT})`,
    );
  }
  return first;
}

/** The sheet painted so far, as WebP bytes under the limit. */
async function encodeSheet(devTools: DevTools, sessionId: string): Promise<Buffer> {
  const webpBase64 = await evaluate<string>(
    devTools,
    sessionId,
    `(${SHEET_IN_PAGE}).encode(${SHEET_MAX_BYTES}, ${SHEET_FIRST_QUALITY}, ${QUALITY_STEP}, ${LOWEST_QUALITY})`,
  );
  return Buffer.from(webpBase64, 'base64');
}

/** A turntable's sheets as rendered, by light: the sheets asked for (0: a, 1: b, 2: c); and the still render. */
interface TurntableRender {
  sheets: Record<TurntableLight, Map<number, Buffer>>;
  still: Buffer | null;
}

/**
 * An example's turntable (demo/homes.ts `turntable`): the sheets asked for in the lights asked for — by day, and at night
 * with only the lights of its chosen rooms on (`litAtNight`). The still render from sheet a's frame 0 in its start light.
 */
async function renderTurntable(
  devTools: DevTools,
  pageUrl: string,
  id: string,
  sheets: number[],
  lights: TurntableLight[],
  look: TurntableLook,
): Promise<TurntableRender> {
  const page = await openExampleBare(devTools, pageUrl, id);
  const {sessionId} = page;
  try {
    const home = await evaluate<CameraView>(devTools, sessionId, 'window.editor.ed.view.getView()');
    const plan = await evaluate<PlanHalfSize>(
      devTools,
      sessionId,
      `(() => {
        const points = window.editor.ed.plan.rooms.flatMap(room => room.polygon);
        const xs = points.map(point => point[0]);
        const ys = points.map(point => point[1]);
        return {x: (Math.max(...xs) - Math.min(...xs)) / 2, y: (Math.max(...ys) - Math.min(...ys)) / 2};
      })()`,
    );
    const rendered: TurntableRender = {sheets: {day: new Map(), night: new Map()}, still: null};
    // the day first (as the example opens), then the night as the 3D window's night shows it, the chosen rooms lit
    for (const light of (['day', 'night'] as const).filter(each => lights.includes(each))) {
      if (light === 'night') {
        await evaluate(
          devTools,
          sessionId,
          `((lit) => {
            const ed = window.editor.ed;
            for (const lamp of ed.plan.lights) {
              lamp.on = lit.includes(lamp.room);
              ed.view.setLightOn(lamp.id, lamp.on);
            }
            ed.view.setNight(true);
            return true;
          })(${JSON.stringify(look.litAtNight)})`,
        );
        await pause(NIGHT_SETTLE_MS);
      }
      for (const sheet of sheets) {
        const views = turntableViews(home, plan, TURNTABLE_FRAMES, sheet);
        const frame0 = await paintSheet(devTools, sessionId, views);
        rendered.sheets[light].set(sheet, await encodeSheet(devTools, sessionId));
        if (sheet === 0 && light === look.start)
          rendered.still = await stillFrom(devTools, sessionId, frame0);
      }
    }
    return rendered;
  } finally {
    await page.close();
  }
}

/** Writes a file and says its size. */
function writeSaying(file: string, bytes: Buffer, limit: number): void {
  fs.writeFileSync(file, bytes);
  const kilobytes = (bytes.length / 1024).toFixed(1);
  const tooLarge = bytes.length > limit ? ' (over the limit)' : '';
  console.log(`${file}: ${kilobytes} KB${tooLarge}`);
}

async function main(): Promise<void> {
  const onlyIndex = process.argv.indexOf('--only');
  const only = onlyIndex > 0 ? process.argv[onlyIndex + 1].split(',') : null;
  const ids = HOMES.map(home => home.id).filter(id => !only || only.includes(id));
  const turntable = process.argv.includes('--turntable');
  const sheetsIndex = process.argv.indexOf('--sheets');
  const sheetLetters = sheetsIndex > 0 ? process.argv[sheetsIndex + 1].split(',') : ['a', 'b', 'c'];
  const sheets = sheetLetters.map(letter => 'abc'.indexOf(letter)).filter(sheet => sheet >= 0);
  const lightsIndex = process.argv.indexOf('--lights');
  const lightNames = lightsIndex > 0 ? process.argv[lightsIndex + 1].split(',') : ['day', 'night'];
  const lights = (['day', 'night'] as const).filter(light => lightNames.includes(light));
  console.log('building the editor with the typical demo…');
  execFileSync(process.execPath, ['build.ts', '--demo=typical'], {stdio: 'inherit'});
  fs.mkdirSync(OUT_DIR, {recursive: true});
  fs.mkdirSync(TURNTABLE_DIR, {recursive: true});
  const pageUrl = pathToFileURL(path.resolve('dist/index.html')).href;
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'render-examples-'));
  const chrome = await startChrome(profileDir);
  const devTools = await connect(chrome.socketUrl);
  let failed = 0;
  try {
    for (const id of ids) {
      try {
        if (turntable) {
          const look = HOMES.find(home => home.id === id)?.turntable;
          if (!look) throw new Error('no turntable in demo/homes.ts');
          const rendered = await renderTurntable(devTools, pageUrl, id, sheets, lights, look);
          for (const light of lights) {
            for (const [sheet, bytes] of rendered.sheets[light]) {
              const file = path.join(TURNTABLE_DIR, `${id}-${light}${sheetSuffix(sheet)}.webp`);
              writeSaying(file, bytes, SHEET_MAX_BYTES);
            }
          }
          if (rendered.still) writeSaying(path.join(OUT_DIR, `${id}.webp`), rendered.still, MAX_BYTES);
        } else {
          const picture = await renderExample(devTools, pageUrl, id);
          writeSaying(path.join(OUT_DIR, `${id}.webp`), picture, MAX_BYTES);
        }
      } catch (error) {
        failed += 1;
        console.error(`${id}: not rendered: ${(error as Error).message}`);
      }
    }
  } finally {
    devTools.close();
    await chrome.stop();
    fs.rmSync(profileDir, {recursive: true, force: true});
  }
  if (failed) process.exit(1);
}

await main();
