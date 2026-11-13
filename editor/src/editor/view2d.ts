// 2D plan view: metres to pixels, pan and zoom, a crisp canvas on Retina.
import type {Point} from '../core/types.ts';
import type {CanvasPoint} from './editor-types.ts';

/** The pixels at the canvas's edges covered by floating panels: left, right, top, bottom. */
export interface ViewInsets {
  l?: number;
  r?: number;
  t?: number;
  b?: number;
}

/** The plan canvas: metres to pixels, pan and zoom. */
export interface PlanView2d {
  cv: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /** Pixels per metre, and where the plan's origin is on the canvas. */
  sc: number;
  ox: number;
  oy: number;
  /** The device pixel ratio the canvas is drawn at (at most 2). */
  dpr: number;
  /** The canvas size in CSS pixels. */
  w: number;
  h: number;
  /** Set by app.ts: the view shows the whole plan (fit), and the zoom it had then (100% on the zoom label). */
  fitted?: boolean;
  fitSc?: number;
  /** Plan metres to canvas pixels, and back. */
  S(p: Point): CanvasPoint;
  W(px: CanvasPoint): Point;
  /** A pointer tolerance in metres for this many pixels (none: 8). */
  tol(px?: number): number;
  resize(): void;
  /** Fits the points with a margin, leaving the insets free; returns the new scale. */
  fit(points: Point[], pad?: number, insets?: ViewInsets): number;
  zoomAt(X: number, Y: number, k: number): void;
  /** Resets the canvas transform to CSS pixels. */
  base(): void;
  /** Starts a path through plan points (closed unless close is false). */
  path(points: Point[], close?: boolean): void;
  dot(p: Point, r: number, fill?: string | null, stroke?: string | null, lw?: number): void;
}

export function createView2d(cv: HTMLCanvasElement): PlanView2d {
  // The plan canvas gets no other kind of context, so a 2D one is always there.
  const ctx = cv.getContext('2d') as CanvasRenderingContext2D;
  const v: PlanView2d = {
    cv,
    ctx,
    sc: 60,
    ox: 60,
    oy: 400,
    dpr: 1,
    w: 0,
    h: 0,
    S: ([x, y]) => [v.ox + x * v.sc, v.oy - y * v.sc],
    W: ([X, Y]) => [(X - v.ox) / v.sc, (v.oy - Y) / v.sc],
    tol: (px = 8) => px / v.sc,
    resize() {
      const r = cv.getBoundingClientRect();
      v.dpr = Math.min(devicePixelRatio || 1, 2);
      v.w = r.width;
      v.h = r.height;
      cv.width = Math.round(r.width * v.dpr);
      cv.height = Math.round(r.height * v.dpr);
    },
    // Fit points into the window with margins; ins — how many pixels at the edges are covered by floating panels.
    fit(points, pad = 50, {l = 0, r = 0, t = 0, b = 0} = {}) {
      const xs = points.map(p => p[0]);
      const ys = points.map(p => p[1]);
      const [x0, x1, y0, y1] = xs.length
        ? [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
        : [0, 10, 0, 6];
      const W = Math.max(40, v.w - l - r);
      const H = Math.max(40, v.h - t - b);
      const p = Math.min(pad, W / 6, H / 6);
      v.sc = Math.max(5, Math.min(300, Math.min((W - 2 * p) / (x1 - x0 || 1), (H - 2 * p) / (y1 - y0 || 1))));
      v.ox = l + (W - (x1 - x0) * v.sc) / 2 - x0 * v.sc;
      v.oy = t + (H + (y1 - y0) * v.sc) / 2 + y0 * v.sc;
      return v.sc;
    },
    zoomAt(X, Y, k) {
      const [x, y] = v.W([X, Y]);
      v.sc = Math.max(10, Math.min(600, v.sc * k));
      v.ox = X - x * v.sc;
      v.oy = Y + y * v.sc;
    },
    base() {
      ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    },
    path(points, close = true) {
      ctx.beginPath();
      points.forEach((p, i) => {
        const [X, Y] = v.S(p);
        i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
      });
      if (close) ctx.closePath();
    },
    dot(p, r, fill, stroke, lw = 1.5) {
      const [X, Y] = v.S(p);
      ctx.beginPath();
      ctx.arc(X, Y, r, 0, 7);
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fill();
      }
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lw;
        ctx.stroke();
      }
    },
  };
  return v;
}
