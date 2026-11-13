// Mini charts under the indoor-climate numbers — carried over from 3d_floor/apartment/smart-home/web/src/history.js (D-049):
// downsampling, a smooth curve (monotone spline), a threshold color scale. History comes from the HA layer (ha.history); the demo has its own.
import {N} from '../i18n/i18n.ts';
import type {Point} from '../core/types.ts';
const MAX_POINTS = 36;

/** A chart's curve, its filled area below (SVG paths), the lowest and highest value and how many points it has. */
export interface Sparkline {
  line: string;
  area: string;
  min: number;
  max: number;
  points: number;
}

/** A metric's look on the room screen: its caption, unit, icon; a fixed colour or a colour scale [from value, colour]; span: see sparkline. */
export interface MetricLook {
  label: string;
  unit: string;
  icon: string;
  color?: string;
  span: number;
  thresholds?: Array<[number, string]>;
}

export function downsample(values: number[], limit = MAX_POINTS): number[] {
  if (values.length <= limit) return values.slice();
  const step = values.length / limit;
  const out: number[] = [];
  for (let i = 0; i < limit; i++) out.push(values[Math.min(values.length - 1, Math.round(i * step))]);
  // Keep the last measurement exact: the chart must agree with the number next to it.
  out[out.length - 1] = values[values.length - 1];
  return out;
}

export function sparkline(
  values: number[],
  {
    width = 104,
    height = 26,
    pad = 2,
    span = 0,
  }: {width?: number; height?: number; pad?: number; span?: number} = {},
): Sparkline | null {
  const points = downsample(values);
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  // The window is no narrower than span: a tenth-of-a-degree wobble is not stretched over the full
  // height. A flat line runs through the middle instead of sticking to an edge.
  const need = Math.max(span, max - min > 1e-9 ? 0 : Math.max(Math.abs(max) * 0.04, 1));
  const mid = (min + max) / 2;
  const low = max - min < need ? mid - need / 2 : min;
  const high = max - min < need ? mid + need / 2 : max;
  const inner = height - pad * 2;
  const xy = points.map((v, i): Point => [
    (i / (points.length - 1)) * width,
    pad + inner - ((v - low) / (high - low)) * inner,
  ]);
  const line = smoothPath(xy);
  const area = `${line} L${width} ${height} L0 ${height} Z`;
  return {line, area, min, max, points: points.length};
}

const f = (n: number): number => +n.toFixed(1);
/**
 * A smooth curve through the points — a monotone cubic spline (like
 * curveMonotoneX in d3): it bends between points but never goes above the
 * maximum or below the minimum of its neighbours, i.e. it does not invent peaks.
 */
function smoothPath(xy: Point[]): string {
  const n = xy.length;
  // the slope of each piece, and the curve's slope at each point
  const d: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((xy[i + 1][1] - xy[i][1]) / (xy[i + 1][0] - xy[i][0]));
  for (let i = 0; i < n; i++) {
    if (i === 0) m.push(d[0]);
    else if (i === n - 1) m.push(d[n - 2]);
    else
      m.push(
        d[i - 1] * d[i] <= 0
          ? 0
          : (Math.sign(d[i - 1]) + Math.sign(d[i])) *
              Math.min(Math.abs(d[i - 1]), Math.abs(d[i]), Math.abs(d[i - 1] + d[i]) / 4),
      );
  }
  let path = `M${f(xy[0][0])} ${f(xy[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = xy[i];
    const [x1, y1] = xy[i + 1];
    const h = (x1 - x0) / 3;
    path += ` C${f(x0 + h)} ${f(y0 + m[i] * h)} ${f(x1 - h)} ${f(y1 - m[i + 1] * h)} ${f(x1)} ${f(y1)}`;
  }
  return path;
}

/** Which entities a room needs: the same ones whose readings are written on the wall. */

/** The room screen's metrics; another key: none. */
export const METRICS: {
  temperature: MetricLook;
  humidity: MetricLook;
  co2: MetricLook;
  [key: string]: MetricLook | undefined;
} = {
  temperature: {label: N('Temperature'), unit: '°C', icon: 'thermometer', color: '#4285f4', span: 1},
  humidity: {
    label: N('Humidity'),
    unit: '%',
    icon: 'droplet',
    span: 5,
    thresholds: [
      [0, '#db4437'],
      [30, '#f4b400'],
      [40, '#0f9d58'],
      [60, '#f4b400'],
      [70, '#db4437'],
    ],
  },
  co2: {
    label: 'CO₂',
    unit: 'ppm',
    icon: 'eye',
    span: 150,
    thresholds: [
      [0, '#0f9d58'],
      [800, '#f4b400'],
      [1000, '#db4437'],
      [1500, '#a52714'],
    ],
  },
};

const hex = (c: string): number[] => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));

/** The value's color on the threshold scale, linearly blended between neighbours. */
export function thresholdColor(
  value: number,
  thresholds: Array<[number, string]> | undefined,
): string | null {
  if (!thresholds?.length) return null;
  if (value <= thresholds[0][0]) return thresholds[0][1];
  for (let i = 1; i < thresholds.length; i++) {
    const [to, toColor] = thresholds[i];
    if (value > to) continue;
    const [from, fromColor] = thresholds[i - 1];
    const t = to === from ? 0 : (value - from) / (to - from);
    const a = hex(fromColor);
    const b = hex(toColor);
    return 'rgb(' + a.map((v, k) => Math.round(v + (b[k] - v) * t)).join(', ') + ')';
  }
  // above the last step: its colour (the list is not empty, checked at the top)
  return thresholds.at(-1)![1];
}

export function metricColor(key: string, value: unknown): string {
  const spec = METRICS[key];
  if (!spec) return 'currentColor';
  return spec.color || thresholdColor(Number(value), spec.thresholds) || 'currentColor';
}
