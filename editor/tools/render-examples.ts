// Renders each built-in example (demo/homes.ts) once into a small WebP picture for its card on the start screen and in the
// gallery (D-113): assets/renders/<id>.webp, about 640 × 400 and under 60 KB. Run it again after an example changes:
//   node tools/render-examples.ts [--only loft,studio]
//   node tools/render-examples.ts --gallery <dir>   (a published gallery's homes: <dir>/index.json, each <id>.webp rewritten)
// It builds the editor with the typical demo, opens each example in headless Chrome, shows the home alone in 3D from its home
// view (the same camera and framing as the AI build's editor-3d.png, so the AI-built homes' renders match these) in the light
// a home is shown in (D-116, core/evening.ts: a small home by day, the others at night with a couple of rooms lit) and takes a screenshot, made small in the page
// itself (no image library needed). A gallery's homes open from a local server that gives the folder at /gallery/, as the
// editor's own server does. Chrome: CHROME_PATH, or the usual macOS place.
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {execFileSync, spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {HOMES} from '../demo/homes.ts';

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT_DIR = 'assets/renders';
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
// The night's light and shadows are drawn over a few frames after the lamps change.
const EVENING_SETTLE_MS = 1500;
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

/** One home opened at this address in its own browser context (fresh storage), shown alone in 3D, and its WebP picture's bytes. */
async function renderHome(devTools: DevTools, address: string): Promise<Buffer> {
  const {browserContextId} = await devTools.call('Target.createBrowserContext');
  const {targetId} = await devTools.call('Target.createTarget', {url: 'about:blank', browserContextId});
  const {sessionId} = (await devTools.call('Target.attachToTarget', {targetId, flatten: true})) as {
    sessionId: string;
  };
  try {
    await devTools.call(
      'Emulation.setDeviceMetricsOverride',
      {width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT, deviceScaleFactor: 1, mobile: false},
      sessionId,
    );
    await devTools.call('Page.enable', {}, sessionId);
    await devTools.call('Page.navigate', {url: address}, sessionId);
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
        ed.showcaseLight();
        ed.view.home();
        return true;
      })()`,
    );
    if (!bare) throw new Error('this editor has no bare 3D view');
    await pause(EVENING_SETTLE_MS);
    await viewStill(devTools, sessionId);
    await pause(SETTLE_MS);
    const shot = (await devTools.call('Page.captureScreenshot', {format: 'png'}, sessionId)) as {
      data: string;
    };
    const webpBase64 = await evaluate<string>(
      devTools,
      sessionId,
      `(${SHRINK_IN_PAGE})(${JSON.stringify(shot.data)}, ${RENDER_WIDTH}, ${RENDER_HEIGHT}, ${MAX_BYTES}, ${FIRST_QUALITY}, ${QUALITY_STEP}, ${LOWEST_QUALITY})`,
    );
    return Buffer.from(webpBase64, 'base64');
  } finally {
    await devTools.call('Target.closeTarget', {targetId});
    await devTools.call('Target.disposeBrowserContext', {browserContextId});
  }
}

/** A local server for a gallery's homes: the built editor at /, the gallery's folder at /gallery/. */
function serveGallery(galleryDir: string): Promise<{base: string; stop: () => void}> {
  const types: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.json': 'application/json',
    '.webp': 'image/webp',
  };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://local');
    const name = path.basename(url.pathname);
    const inGallery = url.pathname.startsWith('/gallery/');
    const file = inGallery ? path.join(galleryDir, name) : path.resolve('dist', name || 'index.html');
    if (!fs.existsSync(file)) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, {'content-type': types[path.extname(file)] || 'application/octet-stream'});
    res.end(fs.readFileSync(file));
  });
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      const {port} = server.address() as {port: number};
      resolve({base: `http://127.0.0.1:${port}`, stop: () => server.close()});
    });
  });
}

/** What is rendered: each one's address and the file its picture goes to. */
interface RenderJob {
  name: string;
  address: string;
  file: string;
}

async function main(): Promise<void> {
  const galleryIndex = process.argv.indexOf('--gallery');
  const galleryDir = galleryIndex > 0 ? path.resolve(process.argv[galleryIndex + 1]) : null;
  const onlyIndex = process.argv.indexOf('--only');
  const only = onlyIndex > 0 ? process.argv[onlyIndex + 1].split(',') : null;
  const ids = HOMES.map(home => home.id).filter(id => !only || only.includes(id));
  console.log('building the editor with the typical demo…');
  execFileSync(process.execPath, ['build.ts', '--demo=typical'], {stdio: 'inherit'});
  fs.mkdirSync(OUT_DIR, {recursive: true});
  const pageUrl = pathToFileURL(path.resolve('dist/index.html')).href;
  const gallery = galleryDir ? await serveGallery(galleryDir) : null;
  let jobs: RenderJob[];
  if (galleryDir && gallery) {
    const entries = JSON.parse(fs.readFileSync(path.join(galleryDir, 'index.json'), 'utf8')) as Array<{
      id: string;
      render: string;
    }>;
    jobs = entries
      .filter(entry => !only || only.includes(entry.id))
      .map(entry => ({
        name: entry.id,
        address: `${gallery.base}/index.html?render=1#/home/${entry.id}`,
        file: path.join(galleryDir, entry.render),
      }));
  } else
    jobs = ids.map(id => ({
      name: id,
      address: `${pageUrl}?render=${id}#/example/${id}/`,
      file: path.join(OUT_DIR, `${id}.webp`),
    }));
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'render-examples-'));
  const chrome = await startChrome(profileDir);
  const devTools = await connect(chrome.socketUrl);
  let failed = 0;
  try {
    for (const job of jobs) {
      try {
        const picture = await renderHome(devTools, job.address);
        const file = job.file;
        fs.writeFileSync(file, picture);
        const kilobytes = (picture.length / 1024).toFixed(1);
        const tooLarge = picture.length > MAX_BYTES ? ' (over the limit)' : '';
        console.log(`${file}: ${kilobytes} KB${tooLarge}`);
      } catch (error) {
        failed += 1;
        console.error(`${job.name}: not rendered: ${(error as Error).message}`);
      }
    }
  } finally {
    devTools.close();
    gallery?.stop();
    await chrome.stop();
    fs.rmSync(profileDir, {recursive: true, force: true});
  }
  if (failed) process.exit(1);
}

await main();
