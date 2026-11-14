// The AI build's upload in chunks (D-NEXT). The build service is reached through Cloudflare's tunnel, which refuses a request
// body over 100 MB, and a phone's video of a home is often 100–500 MB: sent in one request it failed in production. So the
// plan photo and each video go in chunks of the size the service names (16 MB), one after another, each with its SHA-256:
//   POST <api>/api/uploads                  {files: [{kind, name, size}], lang} → {id, chunkBytes, files: [{received}]}
//                                           401 SIGNED_OUT, 402 BALANCE_EMPTY before any byte is sent
//   PUT  <api>/api/uploads/<id>/<n>?offset= a chunk of file n (0: the plan photo) → {received}; 409 {received}: go on there
//   GET  <api>/api/uploads/<id>             how much of each file the service has: where a resume goes on from
//   POST <api>/api/uploads/<id>/finish      every file whole → {id} of the build that starts
// A chunk that breaks on the way is sent again after a pause, from where the service says it has got to; when the
// connection stays away the upload stops, and the build button goes on from there (the job keeps the upload's id).
// The share shown only grows: a chunk sent again does not take the bar back.

/** A file the service is told of before its bytes come. */
interface AnnouncedFile {
  kind: 'plan' | 'video';
  name: string;
  size: number;
}

/** How much of each file the service has (GET <api>/api/uploads/<id>). */
interface UploadState {
  id: string;
  chunkBytes: number;
  received: number[];
}

/** An answer of the service: its status and its JSON body (unknown until checked). */
export interface ServiceAnswer {
  status: number;
  body: unknown;
}

/** How the upload reaches the service; the page's is browserTransport, a test gives its own. */
export interface UploadTransport {
  /** A JSON request; rejects when no answer came (no connection). */
  json(method: 'GET' | 'POST', url: string, body?: unknown): Promise<ServiceAnswer>;
  /** A chunk's bytes, telling how many have gone so far; rejects when no answer came. */
  chunk(
    url: string,
    bytes: Blob,
    headers: Record<string, string>,
    onSent: (sentBytes: number) => void,
  ): Promise<ServiceAnswer>;
  /** The hex SHA-256 of the bytes, or null where the browser cannot (an insecure page): the chunk goes without one. */
  digest(bytes: Blob): Promise<string | null>;
  pause(ms: number): Promise<void>;
}

/** What is uploaded for a new build. */
export interface UploadRequest {
  /** The service's address ('' on the page it serves). */
  api: string;
  plan: File;
  videos: File[];
  /** The language the owner reads: the build names the rooms and the furniture in it. */
  lang: string;
}

/** An upload under way, kept by the page: pressed again with the same files, the build button goes on from there. */
export interface UploadJob {
  /** The service's id for it, once created. */
  id: string | null;
}

/** Why an upload stopped: the service's status (0: no answer came) and its error code. */
export class UploadFailed extends Error {
  status: number;
  code: string | null;

  constructor(status: number, code: string | null, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// The chunk size when the service names none, and the most taken from it: far under the tunnel's 100 MB a request.
export const DEFAULT_CHUNK_BYTES = 16 * 1024 * 1024;
const MOST_CHUNK_BYTES = 32 * 1024 * 1024;
// A chunk that breaks is sent again after each of these pauses; after the last, the upload stops (about a minute in all).
const RETRY_PAUSES_MS = [1000, 2000, 4000, 8000, 15000, 30000];
// A chunk that sends nothing more for this long is given up and sent again: the connection has gone quiet.
const STALL_MS = 60_000;
// Statuses worth sending again: the request timed out, too many at once, or the service or the tunnel failed for a moment.
const PASSING_STATUS = new Set([408, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524]);
const STATUS_CREATED = 201;
const STATUS_OK = 200;
const STATUS_CONFLICT = 409;

/** The body's field, if it is a string. */
function textField(body: unknown, field: string): string | null {
  const value = (body as Record<string, unknown> | null)?.[field];
  return typeof value === 'string' ? value : null;
}

/** The body's field, if it is a whole number of bytes. */
function bytesField(body: unknown, field: string): number | null {
  const value = (body as Record<string, unknown> | null)?.[field];
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/** Why the service refused, as the page shows it. */
function failureOf(answer: ServiceAnswer | null): UploadFailed {
  if (!answer) return new UploadFailed(0, null, 'no connection');
  const code = textField(answer.body, 'error');
  const message = textField(answer.body, 'message') || code || `status ${answer.status}`;
  return new UploadFailed(answer.status, code, message);
}

/** Whether a failed chunk is worth sending again: no answer, a passing failure, or a chunk damaged on the way. */
function worthAgain(answer: ServiceAnswer | null): boolean {
  if (!answer) return true;
  if (PASSING_STATUS.has(answer.status)) return true;
  return textField(answer.body, 'error') === 'CHECKSUM';
}

/** An upload's state from the service's answer, or null when it is not one. */
function stateOf(body: unknown, files: number): UploadState | null {
  const id = textField(body, 'id');
  const list = (body as {files?: unknown} | null)?.files;
  if (!id || !Array.isArray(list) || list.length !== files) return null;
  const received = list.map(file => bytesField(file, 'received') ?? 0);
  const named = bytesField(body, 'chunkBytes');
  const chunkBytes = named ? Math.min(named, MOST_CHUNK_BYTES) : DEFAULT_CHUNK_BYTES;
  return {id, chunkBytes, received};
}

/**
 * The plan photo and the videos uploaded in chunks → the id of the build that starts. `onShare` is told the share sent so
 * far (0 to 1), only ever growing. Throws UploadFailed: 401 or 402 before any byte, 0 when the connection stays away.
 */
export async function uploadBuild(
  request: UploadRequest,
  job: UploadJob,
  transport: UploadTransport,
  onShare: (share: number) => void,
): Promise<string> {
  const files = [request.plan, ...request.videos];
  const announced: AnnouncedFile[] = files.map((file, index) => ({
    kind: index === 0 ? 'plan' : 'video',
    name: file.name,
    size: file.size,
  }));
  const total = files.reduce((sum, file) => sum + file.size, 0);
  const uploads = `${request.api}/api/uploads`;
  let shown = 0;
  /** The bar moves on to `doneBytes` of all, never back. */
  const reach = (doneBytes: number): void => {
    const share = total ? Math.min(1, doneBytes / total) : 1;
    if (share <= shown) return;
    shown = share;
    onShare(shown);
  };

  /** What the service has of this upload now; null when it does not answer or no longer has it. */
  const askState = async (id: string): Promise<UploadState | null> => {
    const answer = await transport.json('GET', `${uploads}/${id}`).catch(() => null);
    return answer?.status === STATUS_OK ? stateOf(answer.body, files.length) : null;
  };

  /** A new upload of these files; the service checks the sign-in and the money here, before any byte. */
  const create = async (): Promise<UploadState> => {
    const answer = await transport
      .json('POST', uploads, {files: announced, lang: request.lang})
      .catch(() => null);
    const state = answer?.status === STATUS_CREATED ? stateOf(answer.body, files.length) : null;
    if (!state) throw failureOf(answer);
    return state;
  };

  // Pressed again after a stop: on from what the service has; else (or when it has swept it) a new upload.
  const state = (job.id ? await askState(job.id) : null) ?? (await create());
  job.id = state.id;
  const received = [...state.received];
  const doneBefore = (index: number): number =>
    received.reduce((sum, bytes, i) => (i === index ? sum : sum + bytes), 0);
  reach(received.reduce((sum, bytes) => sum + bytes, 0));

  /** One chunk of file `index` at `offset`, sent again while it breaks → how much of the file the service has now. */
  const sendChunk = async (index: number, offset: number): Promise<number> => {
    const file = files[index];
    const bytes = file.slice(offset, Math.min(file.size, offset + state.chunkBytes));
    const checksum = await transport.digest(bytes);
    const headers: Record<string, string> = {'content-type': 'application/octet-stream'};
    if (checksum) headers['x-chunk-sha256'] = checksum;
    const url = `${uploads}/${state.id}/${index}?offset=${offset}`;
    for (let attempt = 0; ; attempt++) {
      const answer = await transport
        .chunk(url, bytes, headers, sent => reach(doneBefore(index) + offset + Math.min(sent, bytes.size)))
        .catch(() => null);
      const there = answer ? bytesField(answer.body, 'received') : null;
      if (answer?.status === STATUS_OK && there !== null) return there;
      // Not where the service is (this chunk arrived though its answer did not): on from where it is.
      if (answer?.status === STATUS_CONFLICT && there !== null) return there;
      if (!worthAgain(answer) || attempt >= RETRY_PAUSES_MS.length) throw failureOf(answer);
      await transport.pause(RETRY_PAUSES_MS[attempt]);
      const now = (await askState(state.id))?.received[index];
      if (now !== undefined && now !== offset) return now;
    }
  };

  for (let index = 0; index < files.length; index++) {
    while (received[index] < files[index].size) {
      received[index] = await sendChunk(index, received[index]);
      reach(doneBefore(index) + received[index]);
    }
  }

  // Every byte is there: the build starts. A finish whose answer was lost is sent again; the service answers the same build.
  for (let attempt = 0; ; attempt++) {
    const answer = await transport.json('POST', `${uploads}/${state.id}/finish`).catch(() => null);
    const build = answer?.status === STATUS_CREATED ? textField(answer.body, 'id') : null;
    if (build) {
      job.id = null;
      return build;
    }
    if (answer || attempt >= RETRY_PAUSES_MS.length) throw failureOf(answer);
    await transport.pause(RETRY_PAUSES_MS[attempt]);
  }
}

/** The body of an answer as JSON, or an empty object when it is not JSON. */
function parsed(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {};
  }
}

/** The hex form of a hash's bytes. */
function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

/** The page's way to the service: fetch for JSON, XMLHttpRequest for a chunk (fetch tells nothing of an upload's progress). */
export function browserTransport(): UploadTransport {
  return {
    async json(method: 'GET' | 'POST', url: string, body?: unknown): Promise<ServiceAnswer> {
      const res = await fetch(url, {
        method,
        cache: 'no-store',
        ...(body === undefined
          ? {}
          : {headers: {'content-type': 'application/json'}, body: JSON.stringify(body)}),
      });
      return {status: res.status, body: parsed(await res.text())};
    },
    chunk(
      url: string,
      bytes: Blob,
      headers: Record<string, string>,
      onSent: (sentBytes: number) => void,
    ): Promise<ServiceAnswer> {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        let stall = 0;
        // Each piece that goes puts off the moment a quiet connection is given up.
        const watch = (): void => {
          clearTimeout(stall);
          stall = window.setTimeout(() => xhr.abort(), STALL_MS);
        };
        xhr.open('PUT', url);
        for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
        xhr.upload.onprogress = e => {
          watch();
          onSent(e.loaded);
        };
        xhr.onload = () => {
          clearTimeout(stall);
          resolve({status: xhr.status, body: parsed(xhr.responseText)});
        };
        xhr.onerror = () => {
          clearTimeout(stall);
          reject(new Error('no connection'));
        };
        xhr.onabort = xhr.onerror;
        watch();
        xhr.send(bytes);
      });
    },
    async digest(bytes: Blob): Promise<string | null> {
      // crypto.subtle is there only on a secure page (https, localhost).
      if (!globalThis.crypto?.subtle) return null;
      return hex(await crypto.subtle.digest('SHA-256', await bytes.arrayBuffer()));
    },
    pause: (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms)),
  };
}
