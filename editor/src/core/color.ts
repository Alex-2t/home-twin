// Custom colors: besides its named swatches (catalog COLORS) an item's color can be any #rrggbb — from the color picker or from
// a plan file (the AI build measures real colors from photos). ΔE is CIE76 in Lab (D65), the same measure the AI build uses.

// A color in CIE Lab: lightness 0–100, then the a and b axes.
export type Lab = [number, number, number];

export const isHex = (x: unknown): x is string => typeof x === 'string' && /^#[0-9a-f]{6}$/i.test(x);
export const hexNum = (x: string): number => parseInt(x.slice(1), 16);
export const cssHex = (n: number): string => '#' + n.toString(16).padStart(6, '0');
const lin = (channel: number): number => {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
export function lab(n: number): Lab {
  const R = lin((n >> 16) & 255);
  const G = lin((n >> 8) & 255);
  const B = lin(n & 255);
  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047);
  const y = f(R * 0.2126 + G * 0.7152 + B * 0.0722);
  const z = f((R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
// darker (k < 1) or lighter in linear light, as the 3D shades a color (furniture3d.js shade)
const enc = (c: number): number =>
  Math.round(255 * Math.min(1, c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055));
export const shadeHex = (n: number, k: number): number =>
  (enc(lin((n >> 16) & 255) * k) << 16) | (enc(lin((n >> 8) & 255) * k) << 8) | enc(lin(n & 255) * k);
export const deltaE = (a: number, b: number): number => {
  const p = lab(a);
  const q = lab(b);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
};
// A picked color that is practically one of the swatches ([key, 0xrrggbb]; ΔE below 3) becomes that swatch: the swatch shows as chosen.
export const SNAP_DE = 3;
export function snapColor(hex: string, swatches: Iterable<readonly [string, number]>): string {
  const n = hexNum(hex);
  let best: string | null = null;
  let bestDelta = SNAP_DE;
  for (const [key, color] of swatches) {
    const d = deltaE(n, color);
    if (d < bestDelta) {
      bestDelta = d;
      best = key;
    }
  }
  return best ?? hex.toLowerCase();
}
