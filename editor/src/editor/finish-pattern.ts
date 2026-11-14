// A finish's pattern by hand (D-089): in the finish popup, under the swatches, the sizes and colours of the chosen finish's
// pattern — a plank's width and length, a tile's size, joint, grout and layout, a stripe's width and second colour — only those
// it has (surfaces.ts patternSpec), and Reset to its own look. The AI build sets the same fields from the video.
import {t} from '../i18n/i18n.ts';
import {hasPattern} from '../core/pieces.ts';
import {el, esc} from './ui.ts';
import type {PatternSize, PatternSpec} from '../core/surfaces.ts';
import type {FinishPattern, TileLayout} from '../core/types.ts';

/** One change made in the popup: a size (metres), the joint (metres), a colour, the layout. */
export type PatternChange =
  | {width: number}
  | {height: number}
  | {joint: number}
  | {grout: string}
  | {tint2: string}
  | {lay: TileLayout};

const clamp = (value: number, range: PatternSize): number => Math.max(range.min, Math.min(range.max, value));
// Sizes are kept to the millimetre, as a person measures them.
const toMillimetre = (metres: number): number => Math.round(metres * 1000) / 1000;

/**
 * The pattern after one change: the size kept inside the finish's range, the tile written whole (both sides, the finish's own
 * for the one not set yet), and a value equal to the finish's own left out — so a pattern set back to the finish's own look is
 * none again and the file stays as it was.
 */
export function editPattern(pattern: FinishPattern, spec: PatternSpec, change: PatternChange): FinishPattern {
  const next: FinishPattern = {...pattern};
  if ('width' in change && spec.width) {
    const height = pattern.tile?.[1] ?? spec.height?.own ?? spec.width.own;
    next.tile = [toMillimetre(clamp(change.width, spec.width)), height];
  }
  if ('height' in change && spec.height) {
    const width = pattern.tile?.[0] ?? spec.width?.own ?? spec.height.own;
    next.tile = [width, toMillimetre(clamp(change.height, spec.height))];
  }
  if ('joint' in change && spec.joint)
    next.joint = Math.round(clamp(change.joint, spec.joint) * 10000) / 10000;
  if ('grout' in change && spec.grout) next.grout = change.grout;
  if ('tint2' in change && spec.tint2) next.tint2 = change.tint2;
  if ('lay' in change && spec.lay) next.lay = change.lay;
  return withoutOwn(next, spec);
}

/** The pattern without the values that are the finish's own (a tile both of whose sides are, the own layout, the own colours). */
function withoutOwn(pattern: FinishPattern, spec: PatternSpec): FinishPattern {
  const kept: FinishPattern = {...pattern};
  const near = (first: number, second: number): boolean => Math.abs(first - second) < 0.0005;
  if (kept.tile && spec.width) {
    const ownHeight = spec.height?.own;
    const heightOwn = !spec.height || ownHeight == null || near(kept.tile[1], ownHeight);
    if (near(kept.tile[0], spec.width.own) && heightOwn) delete kept.tile;
  }
  if (kept.joint != null && spec.joint && Math.abs(kept.joint - spec.joint.own) < 0.00005) delete kept.joint;
  if (kept.grout && kept.grout.toLowerCase() === spec.grout?.toLowerCase()) delete kept.grout;
  if (kept.tint2 && kept.tint2.toLowerCase() === spec.tint2?.toLowerCase()) delete kept.tint2;
  if (kept.lay && kept.lay === spec.lay) delete kept.lay;
  return kept;
}

// What the inputs show: centimetres to half a centimetre, millimetres to half a millimetre.
const centimetres = (metres: number): number => Math.round(metres * 200) / 2;
const millimetres = (metres: number): number => Math.round(metres * 2000) / 2;

/** A number input in centimetres (or millimetres) for one size; Enter or leaving it sets it. */
function sizeInput(
  metres: number,
  range: PatternSize,
  unit: 'cm' | 'mm',
  title: string,
  set: (metres: number) => void,
): HTMLInputElement {
  const perMetre = unit === 'cm' ? 100 : 1000;
  const shown = unit === 'cm' ? centimetres(metres) : millimetres(metres);
  const input = el<HTMLInputElement>(
    `<input type="number" step="0.5" min="${range.min * perMetre}" max="${range.max * perMetre}" value="${shown}" title="${esc(title)}">`,
  );
  input.onkeydown = event => {
    event.stopPropagation();
    if (event.key === 'Enter') input.blur();
  };
  input.onchange = () => {
    const value = parseFloat(input.value.replace(',', '.'));
    if (Number.isFinite(value)) set(value / perMetre);
  };
  return input;
}

/** A colour input (a swatch that opens the picker) for the joints or the second colour. */
function colourInput(value: string, title: string, set: (hex: string) => void): HTMLElement {
  const label = el(
    `<label class="fcol" title="${esc(title)}"><input type="color" value="${esc(value)}"></label>`,
  );
  const input = label.querySelector('input')!; // in the markup above
  input.onchange = () => set(input.value);
  return label;
}

/** Straight or offset: two buttons, the current one on. */
function layoutSwitch(current: TileLayout, set: (lay: TileLayout) => void): HTMLElement {
  const box = el(`<div class="seg"></div>`);
  for (const [lay, label] of [
    ['grid', t('Straight')],
    ['bond', t('Offset')],
  ] as const) {
    const button = el(`<button class="${lay === current ? 'on' : ''}">${esc(label)}</button>`);
    button.onclick = () => {
      if (lay !== current) set(lay);
    };
    box.append(button);
  }
  return box;
}

/**
 * The pattern's block in the finish popup: the sizes, then the joint, its colour, the second colour and the layout, then a
 * one-phrase hint and Reset when anything is set. None when the finish has no pattern to set (paint, plaster, carpet…).
 */
export function patternBlock(
  type: 'floor' | 'wall',
  spec: PatternSpec,
  pattern: FinishPattern,
  setPattern: (pattern: FinishPattern) => void,
): HTMLElement | null {
  const hasSizes = spec.width || spec.joint;
  if (!hasSizes && !spec.grout && !spec.tint2 && !spec.lay) return null;
  const change = (edit: PatternChange): void => setPattern(editPattern(pattern, spec, edit));
  const box = el(`<div class="fpat"></div>`);
  if (spec.width) {
    const width = pattern.tile?.[0] ?? spec.width.own;
    const line = el(`<div class="fpl"><span>${esc(spec.width.label)}</span></div>`);
    line.append(sizeInput(width, spec.width, 'cm', t('Width'), value => change({width: value})));
    if (spec.height) {
      const height = pattern.tile?.[1] ?? spec.height.own;
      line.append(el(spec.height.named ? `<span>${esc(spec.height.label)}</span>` : `<i>×</i>`));
      // a plank or a floor tile is as long as it is wide; a wall's tile is as high
      const title = spec.height.named ? spec.height.label : type === 'floor' ? t('Length') : t('Height');
      line.append(sizeInput(height, spec.height, 'cm', title, value => change({height: value})));
    }
    line.append(el(`<small>${t('cm')}</small>`));
    box.append(line);
  }
  const extras = el(`<div class="fpl"></div>`);
  if (spec.joint) {
    extras.append(el(`<span>${esc(spec.joint.label)}</span>`));
    extras.append(
      sizeInput(pattern.joint ?? spec.joint.own, spec.joint, 'mm', spec.joint.label, value =>
        change({joint: value}),
      ),
    );
    extras.append(el(`<small>${t('mm')}</small>`));
  }
  if (spec.grout)
    extras.append(colourInput(pattern.grout ?? spec.grout, t('Joint color'), hex => change({grout: hex})));
  if (spec.tint2) {
    extras.append(el(`<span>${t('Second color')}</span>`));
    extras.append(colourInput(pattern.tint2 ?? spec.tint2, t('Second color'), hex => change({tint2: hex})));
  }
  if (spec.lay) extras.append(layoutSwitch(pattern.lay ?? spec.lay, lay => change({lay})));
  if (extras.childNodes.length) box.append(extras);
  const foot = el(
    `<div class="fpl foot"><small>${t('Match your room — Reset brings it back.')}</small></div>`,
  );
  if (hasPattern(pattern)) {
    const reset = el(`<button class="soft" title="${t('The finish as it was')}">${t('Reset')}</button>`);
    reset.onclick = () => setPattern({});
    foot.append(reset);
  }
  box.append(foot);
  return box;
}
