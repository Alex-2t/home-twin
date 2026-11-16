// Headless Chrome driven over its DevTools protocol, for the tools that open the built editor (render-examples.ts, i18n-shown.ts).
// Chrome: CHROME_PATH, or the usual macOS place.
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const POLL_MS = 100;

export const pause = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/** A message from Chrome's DevTools protocol: an answer to a call (id) or an event (method). */
interface DevToolsMessage {
  id?: number;
  method?: string;
  sessionId?: string;
  result?: Record<string, unknown>;
  error?: {message: string};
}

/** One connection to Chrome: call(method, params, session) answers with the call's result. */
export interface DevTools {
  call(
    method: string,
    params?: Record<string, unknown>,
    sessionId?: string,
  ): Promise<Record<string, unknown>>;
  close(): void;
}

/** Starts headless Chrome with a fresh profile and gives the address of its DevTools socket. */
export async function startChrome(
  profileDir: string,
  width: number,
  height: number,
): Promise<{socketUrl: string; stop: () => Promise<void>}> {
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
      `--window-size=${width},${height}`,
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
export async function connect(socketUrl: string): Promise<DevTools> {
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
export async function evaluate<T>(devTools: DevTools, sessionId: string, expression: string): Promise<T> {
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
export async function waitFor(
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
