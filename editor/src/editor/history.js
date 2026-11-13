// Edit history and plan autosave in the browser.
// The latest plan state lives in localStorage. Undo steps (up to 200) also go to storage (IndexedDB) per project: ⌘Z
// works after a reload too, and for a plan restored from the backup slot. Writes are debounced, new steps only.
// In storage: hist:<project> — {ns: step numbers in order, pos, seq}; hist:<project>:<n> — {plan, extra, at};
// hist:index — projects, most recent first: history is kept for the last six, the rest lose their steps and versions.
const KEY = 'home-twin-editor:plan',
  MAX = 200,
  PLANS = 6;
export function createHistory(onChange, {capture, restore, store = null, now = () => Date.now()} = {}) {
  let stack = [],
    pos = -1,
    seq = 0,
    pid = null,
    saved = new Set(),
    timer = 0,
    fresh = false;
  // fresh — nothing has changed since reset: the project's history from storage can then be adopted as a whole
  const entry = plan => ({
    n: ++seq,
    plan: JSON.stringify(plan),
    extra: capture?.() ?? null,
    at: now(),
    dirty: true,
  });
  const key = (id, n) => `hist:${id}:${n}`;
  const jump = i => {
    onChange?.();
    pos = i;
    const p = JSON.parse(stack[pos].plan);
    restore?.(stack[pos].extra);
    h.save(p);
    touch();
    return p;
  };
  // what to write: new and changed steps, delete dropped ones, step numbers and position — always
  function ops() {
    const out = [],
      keep = new Set(stack.map(e => e.n));
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
  function flush() {
    clearTimeout(timer);
    timer = 0;
    if (!store || !pid || !stack.length) return Promise.resolve();
    return store.batch(ops()).catch(() => {});
  }
  // keep — not a new step (the current one was amended, photo placement): history from storage can still be adopted
  function touch(keep = false) {
    if (!keep) fresh = false;
    if (!store || !pid || fresh) return;
    clearTimeout(timer);
    timer = setTimeout(flush, 400);
  }
  // the project goes first in the recent list; those beyond six are erased: steps, their list and versions (versions.js)
  async function recent(id) {
    const list = (await store.get('hist:index').catch(() => null)) || [],
      next = [id, ...list.filter(x => x !== id)],
      drop = next.slice(PLANS);
    const ops = [['put', 'hist:index', next.slice(0, PLANS)]];
    for (const x of drop) {
      const m = await store.get('hist:' + x).catch(() => null);
      for (const n of m?.ns || []) ops.push(['del', key(x, n)]);
      ops.push(['del', 'hist:' + x], ['del', 'ver:' + x]);
    }
    await store.batch(ops).catch(() => {});
  }
  const h = {
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
      const meta = await store.get('hist:' + id).catch(() => null);
      await recent(id);
      if (pid !== id) return;
      if (!meta?.ns?.length) {
        touch();
        return;
      } // no history of its own — start writing from this step
      const got = fresh ? await Promise.all(meta.ns.map(n => store.get(key(id, n)).catch(() => null))) : [];
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
        .map(
          (n, i) =>
            got[i] && {n, plan: got[i].plan, extra: got[i].extra ?? null, at: got[i].at, dirty: false},
        )
        .filter(Boolean);
      if (!list.length) {
        touch();
        return;
      }
      const p = Math.min(Math.max(0, meta.pos ?? list.length - 1), list.length - 1),
        cur = stack[0];
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
