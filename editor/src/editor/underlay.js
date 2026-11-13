// Underlay: the plan image beneath the rooms. A similarity “world = a·z + b”, where z = (u, −v) is an image pixel.
// Where it is kept is up to a store: in the standalone app — this browser (browserPhotos), in the HA panel — Home Assistant (ha-live.js: hassPhotos, D-058).
const KEY = 'home-twin-editor:underlay';
import {idb} from './idb.js';
export {idb};

// A photo store: load() → {src, place} | null; put(src) — a new image; place({a, b, opacity, visible}) — where it sits
// (often: while dragging); clear() — no photo. In this browser: the image in IndexedDB (it is large), its placement in localStorage (where()).
export const browserPhotos = {
  where() {
    try {
      return JSON.parse(localStorage.getItem(KEY) || 'null');
    } catch {
      return null;
    }
  },
  async load() {
    const place = browserPhotos.where(),
      src = place && (await idb('get', 'underlay').catch(() => null));
    return src ? {src, place} : null;
  },
  put: src => idb('put', 'underlay', src).catch(() => {}),
  place(s) {
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
      return true;
    } catch {
      return false;
    }
  },
  clear() {
    localStorage.removeItem(KEY);
    return idb('del', 'underlay').catch(() => {});
  },
};

// A new photo bigger than needed is shrunk before it is placed: the plan shows at most 2400 px of it anyway (inkMask),
// and Home Assistant takes up to 16 MB in one request. Smaller ones stay as they are.
export const PHOTO_MAX_SIDE = 4096,
  PHOTO_MAX_CHARS = 12e6;
export async function fitPhoto(src) {
  const img = new Image();
  img.src = src;
  try {
    await img.decode();
  } catch {
    return src;
  }
  const side = Math.max(img.width, img.height);
  if (side <= PHOTO_MAX_SIDE && src.length <= PHOTO_MAX_CHARS) return src;
  const k = Math.min(1, PHOTO_MAX_SIDE / side),
    c = document.createElement('canvas');
  c.width = Math.round(img.width * k);
  c.height = Math.round(img.height * k);
  const x = c.getContext('2d');
  x.fillStyle = '#fff';
  x.fillRect(0, 0, c.width, c.height);
  x.drawImage(img, 0, 0, c.width, c.height); // transparent PNG — on white paper
  return c.toDataURL('image/jpeg', 0.9);
}

// Plan photo “as a scan”: even out the lighting (shadow on the paper, phone vignetting) and keep only the lines.
// Paper background is the local brightness maximum over 8×8 blocks, smoothed; ink is how much darker a pixel is than the background.
// The output is an ink mask: the paper is transparent, so the canvas shows through in any theme.
function inkMask(img, rgb) {
  const k = Math.min(1, 2400 / Math.max(img.width, img.height)),
    W = Math.max(1, Math.round(img.width * k)),
    H = Math.max(1, Math.round(img.height * k));
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d', {willReadFrequently: true});
  x.drawImage(img, 0, 0, W, H);
  const d = x.getImageData(0, 0, W, H),
    px = d.data,
    B = 8,
    sw = Math.ceil(W / B),
    sh = Math.ceil(H / B),
    g = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) g[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
  let bg = new Float32Array(sw * sh);
  for (let y = 0; y < H; y++)
    for (let X = 0; X < W; X++) {
      const j = ((y / B) | 0) * sw + ((X / B) | 0),
        v = g[y * W + X];
      if (v > bg[j]) bg[j] = v;
    }
  for (let pass = 0; pass < 3; pass++) {
    const o = new Float32Array(sw * sh);
    for (let y = 0; y < sh; y++)
      for (let X = 0; X < sw; X++) {
        let s = 0,
          n = 0;
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++) {
            const yy = y + dy,
              xx = X + dx;
            if (yy >= 0 && yy < sh && xx >= 0 && xx < sw) {
              s += bg[yy * sw + xx];
              n++;
            }
          }
        o[y * sw + X] = s / n;
      }
    bg = o;
  }
  const at = (X, y) => {
    const fx = Math.min(sw - 1.001, Math.max(0, X / B - 0.5)),
      fy = Math.min(sh - 1.001, Math.max(0, y / B - 0.5)),
      x0 = fx | 0,
      y0 = fy | 0,
      tx = fx - x0,
      ty = fy - y0,
      a = bg[y0 * sw + x0],
      b = bg[y0 * sw + x0 + 1] ?? a,
      cc = bg[(y0 + 1) * sw + x0] ?? a,
      dd = bg[(y0 + 1) * sw + x0 + 1] ?? a;
    return (a * (1 - tx) + b * tx) * (1 - ty) + (cc * (1 - tx) + dd * tx) * ty;
  };
  for (let y = 0; y < H; y++)
    for (let X = 0; X < W; X++) {
      const i = y * W + X,
        r = g[i] / Math.max(30, at(X, y)),
        ink = Math.max(0, Math.min(1, (0.9 - r) / 0.45));
      px[i * 4] = rgb[0];
      px[i * 4 + 1] = rgb[1];
      px[i * 4 + 2] = rgb[2];
      px[i * 4 + 3] = Math.round(255 * ink ** 0.85);
    }
  x.putImageData(d, 0, 0);
  return c;
}
// Plan photo tilt (D-040). Only thin dark lines count — walls, dimension lines, text: a point darker than its neighbours
// on both sides (horizontally or vertically) — a “trough”. Sheet edges, hands, a pen, shadows are wide blobs and steps,
// light on one side only, so they don't count. Then find the angle at which these points, rotated back, gather
// into the narrowest rows and columns (sum of squared projections, as in scan deskewing): long straight walls give
// high peaks and outweigh letters. Try all angles (modulo 90°) in 0.5° steps, then ±0.6° in 0.02° steps.
// Tilt is in image coordinates (y down, “+” is clockwise). Too few lines or no distinct angle — null.
export function tiltOf(img) {
  const k = Math.min(1, 1200 / Math.max(img.width, img.height)),
    w = Math.max(16, Math.round(img.width * k)),
    h = Math.max(16, Math.round(img.height * k));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d', {willReadFrequently: true});
  x.drawImage(img, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h).data,
    g = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = 0.299 * d[4 * i] + 0.587 * d[4 * i + 1] + 0.114 * d[4 * i + 2];
  const px = [],
    py = [],
    pw = [];
  for (let y = 3; y < h - 3; y++)
    for (let X = 3; X < w - 3; X++) {
      const i = y * w + X,
        v = g[i];
      let best = 0;
      for (const s of [2, 3]) {
        const hz = Math.min(g[i - s], g[i + s]) - v,
          vt = Math.min(g[i - s * w], g[i + s * w]) - v;
        best = Math.max(best, hz, vt);
      }
      if (best > 16) {
        px.push(X);
        py.push(y);
        pw.push(Math.min(best, 80));
      }
    }
  const n = px.length;
  if (n < 200) return null;
  const step = Math.max(1, Math.floor(n / 60000)),
    D = Math.ceil(Math.hypot(w, h)) + 2,
    rows = new Float64Array(2 * D),
    cols = new Float64Array(2 * D);
  const score = th => {
    rows.fill(0);
    cols.fill(0);
    const cs = Math.cos(th),
      sn = Math.sin(th);
    for (let i = 0; i < n; i += step) {
      const X = px[i],
        Y = py[i],
        v = pw[i];
      rows[Math.round(-X * sn + Y * cs) + D] += v;
      cols[Math.round(X * cs + Y * sn) + D] += v;
    }
    let s = 0;
    for (let i = 0; i < 2 * D; i++) s += rows[i] * rows[i] + cols[i] * cols[i];
    return s;
  };
  const R = Math.PI / 180;
  let best = 0,
    bs = -1,
    sum = 0,
    cnt = 0;
  for (let t = -45; t < 45; t += 0.5) {
    const v = score(t * R);
    sum += v;
    cnt++;
    if (v > bs) {
      bs = v;
      best = t;
    }
  }
  if (bs < (sum / cnt) * 1.15) return null; // no angle stands out — no plan lines visible
  let fine = best,
    fs = bs;
  for (let t = best - 0.6; t <= best + 0.6001; t += 0.02) {
    const v = score(t * R);
    if (v > fs) {
      fs = v;
      fine = t;
    }
  }
  return fine * R;
}

// image fingerprint: length and tail of the data URL — different photos won't collide
const photoId = src => (src ? src.length + ':' + src.slice(-32) : '');

export function createUnderlay(onChange, store = browserPhotos) {
  const u = {
    img: null,
    src: null,
    a: null,
    b: null,
    opacity: 0.45,
    visible: true,
    ink: {},
    // photo placement for undo and versions: without the image itself (it is large), with a fingerprint of whose placement it is
    snapshot() {
      return u.ready ? {ph: photoId(u.src), a: [...u.a], b: [...u.b]} : null;
    },
    restore(s) {
      if (!s || s.ph !== photoId(u.src) || !u.ready) return;
      u.a = [...s.a];
      u.b = [...s.b];
      u.save();
    },
    // ink mask for the theme: dark lines on a light canvas, light ones on a dark canvas; computed once per image
    // thumbnail for the panel
    thumb() {
      if (!u.img) return '';
      if (u._thumb) return u._thumb;
      const c = document.createElement('canvas'),
        k = Math.min(96 / u.img.width, 64 / u.img.height);
      c.width = Math.round(u.img.width * k);
      c.height = Math.round(u.img.height * k);
      c.getContext('2d').drawImage(u.img, 0, 0, c.width, c.height);
      return (u._thumb = c.toDataURL('image/jpeg', 0.7));
    },
    inkFor(dark) {
      if (!u.img) return null;
      const k = dark ? 'd' : 'l';
      return (u.ink[k] ||= inkMask(u.img, dark ? [226, 229, 236] : [24, 26, 32]));
    },
    get ready() {
      return !!(u.img && u.img.complete && u.a);
    },
    toWorld([x, y]) {
      return [u.a[0] * x - u.a[1] * -y + u.b[0], u.a[1] * x + u.a[0] * -y + u.b[1]];
    },
    toImage([x, y]) {
      const a = u.a,
        d = a[0] * a[0] + a[1] * a[1],
        X = x - u.b[0],
        Y = y - u.b[1];
      return [(a[0] * X + a[1] * Y) / d, -(a[0] * Y - a[1] * X) / d];
    },
    // From two “pixel → metres” pairs.
    match(z1, w1, z2, w2) {
      const zx = z2[0] - z1[0],
        zy = -(z2[1] - z1[1]),
        wx = w2[0] - w1[0],
        wy = w2[1] - w1[1],
        d = zx * zx + zy * zy;
      u.a = [(wx * zx + wy * zy) / d, (wy * zx - wx * zy) / d];
      u.b = [w1[0] - (u.a[0] * z1[0] - u.a[1] * -z1[1]), w1[1] - (u.a[1] * z1[0] + u.a[0] * -z1[1])];
    },
    // Scale from a known distance between two image points; the first point stays in place.
    calibrate(z1, z2, metres) {
      const w1 = u.toWorld(z1),
        w2 = u.toWorld(z2),
        k = metres / Math.hypot(w2[0] - w1[0], w2[1] - w1[1]);
      u.a = [u.a[0] * k, u.a[1] * k];
      const n1 = u.toWorld(z1);
      u.b = [u.b[0] + w1[0] - n1[0], u.b[1] + w1[1] - n1[1]];
      u.save();
    },
    moveBy(dx, dy) {
      u.b = [u.b[0] + dx, u.b[1] + dy];
    },
    // Rotate by θ and scale by k around point c (in metres): a' = a·k·e^{iθ}, b' = c + k·e^{iθ}·(b − c).
    turn(c, th, k = 1) {
      const cs = Math.cos(th) * k,
        sn = Math.sin(th) * k,
        [a0, a1] = u.a,
        [b0, b1] = [u.b[0] - c[0], u.b[1] - c[1]];
      u.a = [a0 * cs - a1 * sn, a0 * sn + a1 * cs];
      u.b = [c[0] + b0 * cs - b1 * sn, c[1] + b0 * sn + b1 * cs];
    },
    angle() {
      return Math.atan2(u.a[1], u.a[0]);
    },
    corners() {
      const {width: w, height: h} = u.img;
      return [
        [0, 0],
        [w, 0],
        [w, h],
        [0, h],
      ].map(u.toWorld);
    },
    center() {
      return u.toWorld([u.img.width / 2, u.img.height / 2]);
    },
    // Straighten: the line between image points z1, z2 becomes level (snapped to the nearest axis). Returns the rotation angle.
    straighten(z1, z2) {
      const w1 = u.toWorld(z1),
        w2 = u.toWorld(z2),
        al = Math.atan2(w2[1] - w1[1], w2[0] - w1[0]),
        q = (Math.round(al / (Math.PI / 2)) * Math.PI) / 2,
        th = q - al;
      if (Math.abs(th) > 1e-4) u.turn(u.center(), th);
      return th;
    },
    async set(src, {place, save = true} = {}) {
      const img = new Image();
      img.src = src;
      await img.decode();
      u.img = img;
      u.src = src;
      u.ink = {};
      u._thumb = null;
      if (place) place(img);
      if (save) {
        await store.put(src);
        u.save();
      }
      onChange?.();
    },
    async clear() {
      u.img = null;
      u.src = null;
      u.a = null;
      u.ink = {};
      await store.clear();
      onChange?.();
    },
    save() {
      return store.place({a: u.a, b: u.b, opacity: u.opacity, visible: u.visible});
    },
    async load() {
      const r = await store.load().catch(() => null),
        s = r?.place;
      if (
        !s ||
        ![s.a, s.b].every(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)) ||
        !Math.hypot(...s.a)
      )
        return false;
      const img = new Image();
      img.src = r.src;
      try {
        await img.decode();
      } catch {
        return false;
      }
      Object.assign(u, {a: s.a, b: s.b, opacity: s.opacity ?? u.opacity, visible: s.visible ?? true});
      u.img = img;
      u.src = r.src;
      u.ink = {};
      u._thumb = null;
      return true;
    },
    draw(v, dark) {
      if (!u.visible || !u.ready) return;
      const {ctx, sc, ox, oy, dpr} = v,
        a = u.a,
        b = u.b;
      ctx.globalAlpha = u.opacity;
      ctx.setTransform(
        dpr * sc * a[0],
        -dpr * sc * a[1],
        dpr * sc * a[1],
        dpr * sc * a[0],
        dpr * (ox + sc * b[0]),
        dpr * (oy - sc * b[1]),
      );
      ctx.drawImage(u.inkFor(dark) || u.img, 0, 0, u.img.width, u.img.height);
      ctx.globalAlpha = 1;
      v.base();
    },
  };
  return u;
}
