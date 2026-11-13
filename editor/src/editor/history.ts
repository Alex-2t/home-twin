// Edit history and plan autosave in the browser.
// The latest plan state lives in localStorage. Undo steps (up to 200) also go to storage (IndexedDB) per project: ⌘Z
// works after a reload too, and for a plan restored from the backup slot. Writes are debounced, new steps only.
// In storage: hist:<project> — {ns: step numbers in order, pos, seq}; hist:<project>:<n> — {plan, extra, at};
// hist:index — projects, most recent first: history is kept for the last six, the rest lose their steps and versions.
import type {Plan} from '../core/types.ts';
import type {UnderlaySnapshot} from './underlay.ts';
import type {KeyValueStore, StoreOp} from './idb.ts';

const KEY = 'home-twin-editor:plan';
const MAX = 200;
const PLANS = 6;

/** What the history needs of a plan: its project id (none: the steps are kept in memory only). */
export interface HistoryPlan {
  id?: string;
}

/** What goes with each step besides the plan: the photo's placement (app.ts), null: none. */
export type HistoryExtra = UnderlaySnapshot | null;

/** The options: the step's extra and how to put it back, the storage for the steps, the clock (ms). */
export interface HistoryOptions {
  capture?: () => HistoryExtra | undefined;
  restore?: (extra: HistoryExtra) => void;
  store?: KeyValueStore | null;
  now?: () => number;
}

/** Undo steps and the plan saved in this browser. SavedPlan: the plan type (the editor's Plan; tests use their own). */
export interface PlanHistory<SavedPlan extends HistoryPlan = Plan> {
  /** What the last save in this browser failed with; null: it worked. */
  error: unknown;
  /** The photo placement goes into the current step. */
  captureExtra(): void;
  /** Another plan: its history starts (from storage, when it has one there). */
  reset(plan: SavedPlan): void;
  commit(plan: SavedPlan): void;
  /** Changes the current step instead of adding one. */
  amend(plan: SavedPlan): void;
  /** The plan one step back or forward; null: none. */
  undo(): SavedPlan | null;
  redo(): SavedPlan | null;
  adopt(plan: SavedPlan): Promise<void>;
  /** The project's steps from storage are read. */
  ready: Promise<void>;
  /** Writes the steps not written yet. */
  flush(): Promise<void>;
  /** When the current step was made, ms; null: none. */
  lastAt(): number | null;
  size(): {steps: number; pos: number};
  /** Saves the plan in this browser; false: it failed. */
  save(plan: SavedPlan): boolean;
  /** The plan saved in this browser, unchecked. */
  load(): unknown;
  clear(): void;
}

/** A step: its number in the project, the plan as JSON, its extra, when it was made, and whether it is still to be written. */
interface HistoryStep {
  n: number;
  plan: string;
  extra: HistoryExtra;
  at: number;
  dirty: boolean;
}

/** A step as it is kept in storage (hist:<project>:<n>). */
interface StoredStep {
  plan: string;
  extra?: HistoryExtra;
  at: number;
}

/** A project's steps in storage (hist:<project>): their numbers in order, the position and the last number. */
interface StoredSteps {
  ns: number[];
  pos?: number;
  seq?: number;
}

export function createHistory<SavedPlan extends HistoryPlan = Plan>(
  onChange?: (() => void) | null,
  {capture, restore, store = null, now = () => Date.now()}: HistoryOptions = {},
): PlanHistory<SavedPlan> {
  let stack: HistoryStep[] = [];
  let pos = -1;
  let seq = 0;
  let pid: string | null = null;
  let saved = new Set<number>();
  let timer: ReturnType<typeof setTimeout> | number = 0;
  let fresh = false;
  // fresh — nothing has changed since reset: the project's history from storage can then be adopted as a whole
  const entry = (plan: SavedPlan): HistoryStep => ({
    n: ++seq,
    plan: JSON.stringify(plan),
    extra: capture?.() ?? null,
    at: now(),
    dirty: true,
  });
  const key = (id: string | null, n: number): string => `hist:${id}:${n}`;
  const jump = (i: number): SavedPlan => {
    onChange?.();
    pos = i;
    // The step holds a plan this history was given.
    const p = JSON.parse(stack[pos].plan) as SavedPlan;
    restore?.(stack[pos].extra);
    h.save(p);
    touch();
    return p;
  };
  // what to write: new and changed steps, delete dropped ones, step numbers and position — always
  function ops(): StoreOp[] {
    const out: StoreOp[] = [];
    const keep = new Set(stack.map(e => e.n));
    for (const e of stack)
      if (e.dirty) {
        out.push(['put', key(pid, e.n), {plan: e.plan, extra: e.extra, at: e.at}]);
        e.dirty = false;
      }
    for (const n of saved) if (!keep.has(n)) out.push(['del', key(pid, n)]);
    saved = keep;
    out.push(['put', 'hist:' + pid, {ns: stack.map(e => e.n), pos, seq}]);
    return out;
  }
  // the list is built right away (before the first await) — the project may change, but what gets written is what was there
  function flush(): Promise<void> {
    clearTimeout(timer);
    timer = 0;
    if (!store || !pid || !stack.length) return Promise.resolve();
    return store.batch(ops()).catch(() => {});
  }
  // keep — not a new step (the current one was amended, photo placement): history from storage can still be adopted
  function touch(keep = false): void {
    if (!keep) fresh = false;
    if (!store || !pid || fresh) return;
    clearTimeout(timer);
    timer = setTimeout(flush, 400);
  }
  // the project goes first in the recent list; those beyond six are erased: steps, their list and versions (versions.js)
  // Called only with a store (adopt checks it).
  async function recent(store: KeyValueStore, id: string): Promise<void> {
    // This module writes the index: a list of project ids.
    const list = ((await store.get('hist:index').catch(() => null)) || []) as string[];
    const next = [id, ...list.filter(x => x !== id)];
    const drop = next.slice(PLANS);
    const ops: StoreOp[] = [['put', 'hist:index', next.slice(0, PLANS)]];
    for (const x of drop) {
      const m = (await store.get('hist:' + x).catch(() => null)) as StoredSteps | null;
      for (const n of m?.ns || []) ops.push(['del', key(x, n)]);
      ops.push(['del', 'hist:' + x], ['del', 'ver:' + x]);
    }
    await store.batch(ops).catch(() => {});
  }
  const h: PlanHistory<SavedPlan> = {
    error: null,
    captureExtra() {
      if (pos >= 0) {
        stack[pos].extra = capture?.() ?? null;
        stack[pos].dirty = true;
        touch(true);
      }
    },
    reset(plan) {
      if (timer) flush(); // finish writing the previous project
      stack = [entry(plan)];
      pos = 0;
      h.save(plan);
      pid = plan?.id || null;
      saved = new Set();
      fresh = true;
      h.ready = h.adopt(plan);
    },
    commit(plan) {
      const e = entry(plan);
      stack = stack.slice(0, pos + 1);
      stack.push(e);
      if (stack.length > MAX) stack.shift();
      pos = stack.length - 1;
      h.save(plan);
      touch();
    },
    // amend the last step without adding a new one: the wizard placed a lamp itself — “Undo” reverts the user's edit, not this
    amend(plan) {
      if (pos < 0) {
        h.reset(plan);
        return;
      }
      stack[pos] = entry(plan);
      h.save(plan);
      touch(true);
    },
    undo() {
      return pos > 0 ? jump(pos - 1) : null;
    },
    redo() {
      return pos >= 0 && pos < stack.length - 1 ? jump(pos + 1) : null;
    },
    // project history from storage: if the last step matches the plan, adopt it as is (“Redo” too); if not
    // (the plan changed without steps being written), the plan becomes a new step after the saved ones. Edited while reading — erase the old steps.
    async adopt(plan) {
      const id = plan?.id;
      if (!store || !id) return;
      // This module writes them (ops above); they are not checked.
      const meta = (await store.get('hist:' + id).catch(() => null)) as StoredSteps | null;
      await recent(store, id);
      if (pid !== id) return;
      if (!meta?.ns?.length) {
        touch();
        return;
      } // no history of its own — start writing from this step
      const got = fresh
        ? ((await Promise.all(
            meta.ns.map(n => store.get(key(id, n)).catch(() => null)),
          )) as Array<StoredStep | null>)
        : [];
      if (pid !== id) return;
      seq = Math.max(seq, meta.seq || 0, ...meta.ns);
      saved = new Set(meta.ns);
      if (!fresh) {
        for (const e of stack) {
          e.n = ++seq;
          e.dirty = true;
        }
        touch();
        return;
      }
      const list = meta.ns
        .map((n, i) => {
          const step = got[i];
          return step && {n, plan: step.plan, extra: step.extra ?? null, at: step.at, dirty: false};
        })
        .filter((step): step is HistoryStep => Boolean(step));
      if (!list.length) {
        touch();
        return;
      }
      const p = Math.min(Math.max(0, meta.pos ?? list.length - 1), list.length - 1);
      const cur = stack[0];
      if (list[p].plan === cur.plan) {
        stack = list;
        pos = p;
      } else {
        cur.n = ++seq;
        stack = [...list.slice(0, p + 1), cur].slice(-MAX);
        pos = stack.length - 1;
      }
      touch();
    },
    ready: Promise.resolve(),
    flush,
    lastAt: () => stack[pos]?.at ?? null,
    size: () => ({steps: stack.length, pos}),
    save(plan) {
      try {
        localStorage.setItem(KEY, JSON.stringify(plan));
        h.error = null;
        return true;
      } catch (error) {
        h.error = error;
        return false;
      }
    },
    load() {
      try {
        return JSON.parse(localStorage.getItem(KEY) || 'null');
      } catch {
        return null;
      }
    },
    clear() {
      localStorage.removeItem(KEY);
    },
  };
  return h;
}
