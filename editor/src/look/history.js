// Mini charts under the indoor-climate numbers — carried over from 3d_floor/apartment/smart-home/web/src/history.js (D-049):
// downsampling, a smooth curve (monotone spline), a threshold color scale. History comes from the HA layer (ha.history); the demo has its own.
import {N} from '../i18n/i18n.js';
const MAX_POINTS = 36;

export function downsample(values, limit = MAX_POINTS) {
  if (values.length <= limit) return values.slice();
  const step = values.length / limit;
  const out = [];
  for (let i = 0; i < limit; i++) out.push(values[Math.min(values.length - 1, Math.round(i * step))]);
  // Keep the last measurement exact: the chart must agree with the number next to it.
  out[out.length - 1] = values[values.length - 1];
  return out;
}

export function sparkline(values, {width = 104, height = 26, pad = 2, span = 0} = {}) {
  const points = downsample(values);
  if (points.length < 2) return null;
  const min = Math.min(...points), max = Math.max(...points);
  // The window is no narrower than span: a tenth-of-a-degree wobble is not stretched over the full
  // height. A flat line runs through the middle instead of sticking to an edge.
  const need = Math.max(span, max - min > 1e-9 ? 0 : Math.max(Math.abs(max) * 0.04, 1));
  const mid = (min + max) / 2, low = max - min < need ? mid - need / 2 : min, high = max - min < need ? mid + need / 2 : max;
  const inner = height - pad * 2;
  const xy = points.map((v, i) => [(i / (points.length - 1)) * width, pad + inner - ((v - low) / (high - low)) * inner]);
  const line = smoothPath(xy);
  const area = `${line} L${width} ${height} L0 ${height} Z`;
  return {line, area, min, max, points: points.length};
}

const f = n => +n.toFixed(1);
/**
 * A smooth curve through the points — a monotone cubic spline (like
 * curveMonotoneX in d3): it bends between points but never goes above the
 * maximum or below the minimum of its neighbours, i.e. it does not invent peaks.
 */
function smoothPath(xy) {
  const n = xy.length, d = [], m = [];
  for (let i = 0; i < n - 1; i++) d.push((xy[i + 1][1] - xy[i][1]) / (xy[i + 1][0] - xy[i][0]));
  for (let i = 0; i < n; i++) {
    if (i === 0) m.push(d[0]);
    else if (i === n - 1) m.push(d[n - 2]);
    else m.push(d[i - 1] * d[i] <= 0 ? 0 : (Math.sign(d[i - 1]) + Math.sign(d[i])) * Math.min(Math.abs(d[i - 1]), Math.abs(d[i]), Math.abs(d[i - 1] + d[i]) / 4));
  }
  let path = `M${f(xy[0][0])} ${f(xy[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = xy[i], [x1, y1] = xy[i + 1], h = (x1 - x0) / 3;
    path += ` C${f(x0 + h)} ${f(y0 + m[i] * h)} ${f(x1 - h)} ${f(y1 - m[i + 1] * h)} ${f(x1)} ${f(y1)}`;
  }
  return path;
}

/** Which entities a room needs: the same ones whose readings are written on the wall. */

export const METRICS = {
  temperature: {label: N('Temperature'), unit: '°C', icon: 'thermometer', color: '#4285f4', span: 1},
  humidity: {label: N('Humidity'), unit: '%', icon: 'droplet', span: 5, thresholds: [
    [0, '#db4437'], [30, '#f4b400'], [40, '#0f9d58'], [60, '#f4b400'], [70, '#db4437']]},
  co2: {label: 'CO₂', unit: 'ppm', icon: 'eye', span: 150, thresholds: [
    [0, '#0f9d58'], [800, '#f4b400'], [1000, '#db4437'], [1500, '#a52714']]},
};

const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));

/** The value's color on the threshold scale, linearly blended between neighbours. */
export function thresholdColor(value, thresholds) {
  if (!thresholds?.length) return null;
  if (value <= thresholds[0][0]) return thresholds[0][1];
  for (let i = 1; i < thresholds.length; i++) {
    const [to, toColor] = thresholds[i];
    if (value > to) continue;
    const [from, fromColor] = thresholds[i - 1];
    const t = to === from ? 0 : (value - from) / (to - from);
    const a = hex(fromColor), b = hex(toColor);
    return 'rgb(' + a.map((v, k) => Math.round(v + (b[k] - v) * t)).join(', ') + ')';
  }
  return thresholds.at(-1)[1];
}

export function metricColor(key, value) {
  const spec = METRICS[key];
  if (!spec) return 'currentColor';
  return spec.color || thresholdColor(Number(value), spec.thresholds) || 'currentColor';
}
