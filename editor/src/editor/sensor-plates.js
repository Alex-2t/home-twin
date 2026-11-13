// Spread out on-screen plates, including on adjacent walls at a corner.
// First along their own wall within its extent; if there is no room — into the depth of the room.
// All already placed neighbours are checked at once, with no limit on the number of attempts.
export function separatePlates(blocks, gap = 2) {
  const placed = [],
    dot = (p, v) => p[0] * v[0] + p[1] * v[1];
  const overlaps = (a, b) => a[0] < b[2] + gap && b[0] < a[2] + gap && a[1] < b[3] + gap && b[1] < a[3] + gap;
  const shift = (box, v, lo, hi) => {
    // Ranges of shifts along v at which the plate overlaps a neighbour.
    const intervals = placed.flatMap(b => {
      let l = -Infinity,
        h = Infinity;
      for (let j = 0; j < 2; j++) {
        if (Math.abs(v[j]) < 1e-9) {
          if (box[j] >= b[j + 2] + gap || b[j] >= box[j + 2] + gap) return [];
          continue;
        }
        const t = [(b[j] - gap - box[j + 2]) / v[j], (b[j + 2] + gap - box[j]) / v[j]].sort((a, b) => a - b);
        l = Math.max(l, t[0]);
        h = Math.min(h, t[1]);
      }
      return l < h ? [[l, h]] : [];
    });
    return [Math.max(lo, Math.min(hi, 0)), ...intervals.flat()]
      .filter(
        t =>
          Number.isFinite(t) &&
          t >= lo &&
          t <= hi &&
          intervals.every(([a, b]) => t <= a + 1e-7 || t >= b - 1e-7),
      )
      .sort((a, b) => Math.abs(a) - Math.abs(b))[0];
  };
  for (const B of blocks) {
    let box = B.box();
    if (placed.some(b => overlaps(box, b))) {
      const [a, b] = B.wall,
        len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1,
        u = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
      const ps = [
        [box[0], box[1]],
        [box[0], box[3]],
        [box[2], box[1]],
        [box[2], box[3]],
      ].map(p => dot(p, u));
      const lo = dot(a, u) + gap - Math.min(...ps),
        hi = dot(b, u) - gap - Math.max(...ps);
      let v = u,
        t = lo <= hi ? shift(box, u, lo, hi) : undefined;
      if (t === undefined) {
        v = B.n;
        t = shift(box, v, 0, Infinity);
      }
      if (t !== undefined) {
        B.o[0] += v[0] * t;
        B.o[1] += v[1] * t;
        box = B.box();
      }
    }
    placed.push(box);
  }
}
