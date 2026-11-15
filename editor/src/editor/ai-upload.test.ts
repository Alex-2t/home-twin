// The AI build's upload in chunks (ai-upload.ts) against a stand-in for the service that keeps its rules: a chunk only at the
// end of what it has, a damaged one refused. No request carries more than a chunk; the bar only grows; a broken chunk is
// sent again from where the service has got to; a stopped upload goes on from there.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {UploadFailed, uploadBuild} from './ai-upload.ts';
import type {ServiceAnswer, UploadJob, UploadTransport} from './ai-upload.ts';

// The stand-in's chunk size: small, so a small file goes in many chunks.
const CHUNK_BYTES = 1000;

/** What happens to the stand-in's next chunk requests, in order: each is taken off as a chunk comes. */
type ChunkTrouble = 'lost-before' | 'lost-after' | 'damaged' | 'busy';

/** The service as the upload sees it, kept in memory, with the troubles a connection has. */
class ServiceStandIn {
  files: Uint8Array[] = [];
  sizes: number[] = [];
  /** Each request's body size, chunks and JSON alike. */
  requestBytes: number[] = [];
  troubles: ChunkTrouble[] = [];
  refuseCreate: number | null = null;
  chunks = 0;
  finished = false;

  transport(): UploadTransport {
    return {
      json: async (method, url, body) => this.json(method, url, body),
      chunk: async (url, bytes, headers, onSent) => this.chunk(url, bytes, headers, onSent),
      digest: async bytes =>
        createHash('sha256')
          .update(new Uint8Array(await bytes.arrayBuffer()))
          .digest('hex'),
      pause: async () => {},
    };
  }

  state(): ServiceAnswer {
    const files = this.sizes.map((size, index) => ({size, received: this.files[index].length}));
    return {status: 200, body: {id: 'u1', chunkBytes: CHUNK_BYTES, files}};
  }

  async json(method: string, url: string, body?: unknown): Promise<ServiceAnswer> {
    this.requestBytes.push(body === undefined ? 0 : JSON.stringify(body).length);
    if (method === 'POST' && url.endsWith('/api/uploads')) {
      if (this.refuseCreate) return {status: this.refuseCreate, body: {error: 'SIGNED_OUT'}};
      const announced = (body as {files: {size: number}[]}).files;
      this.sizes = announced.map(file => file.size);
      this.files = announced.map(() => new Uint8Array(0));
      return {...this.state(), status: 201};
    }
    if (method === 'POST' && url.endsWith('/finish')) {
      const whole = this.sizes.every((size, index) => this.files[index].length === size);
      if (!whole) return {status: 409, body: {error: 'INCOMPLETE'}};
      this.finished = true;
      return {status: 201, body: {id: 'home-1'}};
    }
    return this.state();
  }

  async chunk(
    url: string,
    bytes: Blob,
    headers: Record<string, string>,
    onSent: (sentBytes: number) => void,
  ): Promise<ServiceAnswer> {
    this.chunks++;
    this.requestBytes.push(bytes.size);
    const match = /\/(\d+)\?offset=(\d+)$/.exec(url)!;
    const index = Number(match[1]);
    const offset = Number(match[2]);
    const trouble = this.troubles.shift();
    // Half the bytes go, then the connection drops before the service has any of them.
    onSent(bytes.size / 2);
    if (trouble === 'lost-before') throw new Error('connection lost');
    if (trouble === 'busy') return {status: 503, body: {}};
    onSent(bytes.size);
    const data = new Uint8Array(await bytes.arrayBuffer());
    const received = this.files[index].length;
    if (offset !== received) return {status: 409, body: {error: 'OFFSET', received}};
    const checksum = createHash('sha256')
      .update(trouble === 'damaged' ? data.subarray(1) : data)
      .digest('hex');
    if (checksum !== headers['x-chunk-sha256']) return {status: 400, body: {error: 'CHECKSUM', received}};
    const grown = new Uint8Array(received + data.length);
    grown.set(this.files[index]);
    grown.set(data, received);
    this.files[index] = grown;
    // The service has it, but its answer never comes back.
    if (trouble === 'lost-after') throw new Error('connection lost');
    return {status: 200, body: {received: grown.length}};
  }
}

/** A file whose bytes differ from place to place. */
function patternedFile(name: string, size: number): File {
  const bytes = new Uint8Array(size);
  for (let i = 0; i < size; i++) bytes[i] = (i * 13 + name.length) % 256;
  return new File([bytes], name);
}

const plan = patternedFile('plan.jpg', 700);
const videos = [patternedFile('walk.mp4', 4500), patternedFile('more.mp4', 1200)];
const request = {api: '', plan, videos, photos: [] as File[], lang: 'en'};

/** Whether the service ended up with exactly the files' bytes. */
async function sameBytes(service: ServiceStandIn): Promise<boolean> {
  const files = [plan, ...videos];
  for (let index = 0; index < files.length; index++) {
    const sent = new Uint8Array(await files[index].arrayBuffer());
    if (Buffer.compare(Buffer.from(sent), Buffer.from(service.files[index])) !== 0) return false;
  }
  return true;
}

test('the files go in chunks no bigger than the service names; the bar only grows, to the end', async () => {
  const service = new ServiceStandIn();
  const shares: number[] = [];
  const build = await uploadBuild(request, {id: null}, service.transport(), share => shares.push(share));
  assert.equal(build, 'home-1');
  assert.ok(await sameBytes(service));
  assert.ok(Math.max(...service.requestBytes) <= CHUNK_BYTES, 'no request carries more than a chunk');
  // 700 + 4500 + 1200 bytes in chunks of 1000: 1 + 5 + 2.
  assert.equal(service.chunks, 8);
  assert.deepEqual(
    shares,
    [...shares].sort((a, b) => a - b),
  );
  assert.equal(shares.at(-1), 1);
  // Half a chunk at a time: the bar moves in small steps, none larger than a chunk of the whole.
  const steps = shares.map((share, i) => share - (shares[i - 1] ?? 0));
  assert.ok(Math.max(...steps) <= CHUNK_BYTES / (700 + 4500 + 1200) + 1e-9);
});

test('a chunk that breaks is sent again from where the service has got to, and the bar never goes back', async () => {
  const service = new ServiceStandIn();
  // A dropped connection before and after the service has the chunk, a damaged chunk, a service busy for a moment.
  service.troubles = [
    'lost-before',
    'lost-after',
    'damaged',
    'busy',
    'lost-after',
    'lost-before',
    'lost-before',
  ];
  const shares: number[] = [];
  const build = await uploadBuild(request, {id: null}, service.transport(), share => shares.push(share));
  assert.equal(build, 'home-1');
  assert.ok(await sameBytes(service), 'nothing missing, nothing twice');
  assert.deepEqual(
    shares,
    [...shares].sort((a, b) => a - b),
  );
  assert.ok(Math.max(...service.requestBytes) <= CHUNK_BYTES);
});

test('the connection staying away stops the upload; pressed again, it goes on from what the service has', async () => {
  const service = new ServiceStandIn();
  // Three chunks go, then the connection is gone for longer than all the retries.
  const job: UploadJob = {id: null};
  const failing = service.transport();
  let sent = 0;
  failing.chunk = async (url, bytes, headers, onSent) => {
    if (sent++ >= 3) throw new Error('offline');
    return service.chunk(url, bytes, headers, onSent);
  };
  const stopped = await uploadBuild(request, job, failing, () => {}).catch((error: unknown) => error);
  assert.ok(stopped instanceof UploadFailed);
  assert.equal(stopped.status, 0, 'no connection');
  assert.equal(job.id, 'u1', 'the job keeps the upload');
  const before = service.chunks;
  const build = await uploadBuild(request, job, service.transport(), () => {});
  assert.equal(build, 'home-1');
  assert.ok(await sameBytes(service));
  // The plan (1) and two chunks of the video were there: only the other 5 go.
  assert.equal(service.chunks - before, 5);
  assert.equal(job.id, null, 'a finished upload is not resumed');
});

test('signed out or with nothing left, the upload stops before any byte goes', async () => {
  const service = new ServiceStandIn();
  service.refuseCreate = 401;
  const refused = await uploadBuild(request, {id: null}, service.transport(), () => {}).catch(
    (error: unknown) => error,
  );
  assert.ok(refused instanceof UploadFailed);
  assert.equal(refused.status, 401);
  assert.equal(refused.code, 'SIGNED_OUT');
  assert.equal(service.chunks, 0);
});

test('photos of the rooms go after the plan and the videos, each announced as a photo', async () => {
  const service = new ServiceStandIn();
  const announced: string[] = [];
  const transport = service.transport();
  const watched: UploadTransport = {
    ...transport,
    json: async (method, url, body) => {
      const files = (body as {files?: {kind: string}[]} | undefined)?.files;
      if (files) announced.push(...files.map(file => file.kind));
      return transport.json(method, url, body);
    },
  };
  const photos = [patternedFile('IMG_0001.HEIC', 300), patternedFile('kitchen.jpg', 1500)];
  const build = await uploadBuild({...request, videos: [], photos}, {id: null}, watched, () => {});
  assert.equal(build, 'home-1');
  assert.deepEqual(announced, ['plan', 'photo', 'photo']);
  // 700 + 300 + 1500 bytes in chunks of 1000: 1 + 1 + 2.
  assert.equal(service.chunks, 4);
});
