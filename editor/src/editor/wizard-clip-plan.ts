// The paper plan under the step clips (D-110): a phone photo of a printed floor plan, as people upload in step 0, drawn in code
// from the repository's typical demo flat (demo/typical.ts, a three-room flat of about 78 m²; nobody's home). Thick black
// walls, door swings, window marks, room names in the user's language, areas and a few dimensions, on slightly tilted paper
// with uneven light and grain. It is one static picture (an SVG turned into an image once per language), so the clips'
// frames redraw only the editor's overlay above it, never the grain.
import {t, num, locale} from '../i18n/i18n.ts';
import {esc} from './ui.ts';
import type {Point} from '../core/types.ts';

// ---------- the flat (a copy of demo/typical.ts; wizard-clips.test.ts keeps them the same) ----------

/** A room of the drawn flat: its outline in metres (x east, y north) and where its name is written. */
export interface PaperRoom {
  id: string;
  polygon: Point[];
  label: Point;
}

/** A window or a door of the drawn flat: its two ends on the wall's middle line, in metres. */
export interface PaperOpening {
  a: Point;
  b: Point;
  kind: 'door' | 'window';
  /** A door's leaf: which end it hangs on and to which side of the wall it opens (+1: towards +x or +y). None: an archway. */
  leaf?: {hinge: 'a' | 'b'; side: 1 | -1};
}

export const PAPER_ROOMS: PaperRoom[] = [
  {
    id: 'hall',
    polygon: [
      [5.4, 0],
      [6.9, 0],
      [6.9, 3.7],
      [4.5, 3.7],
      [4.5, 5],
      [3.5, 5],
      [3.5, 2],
      [5.4, 2],
    ],
    label: [6.15, 1.75],
  },
  {
    id: 'living',
    polygon: [
      [4.6, 3.8],
      [10.4, 3.8],
      [10.4, 7.6],
      [3.5, 7.6],
      [3.5, 5.1],
      [4.6, 5.1],
    ],
    label: [7.5, 6.35],
  },
  {
    id: 'bedroom',
    polygon: [
      [0, 3.8],
      [3.4, 3.8],
      [3.4, 7.6],
      [0, 7.6],
    ],
    label: [1.7, 5.75],
  },
  {
    id: 'kids',
    polygon: [
      [0, 0],
      [3.4, 0],
      [3.4, 3.7],
      [0, 3.7],
    ],
    label: [1.7, 1.9],
  },
  {
    id: 'kitchen',
    polygon: [
      [7, 0],
      [10.4, 0],
      [10.4, 3.7],
      [7, 3.7],
    ],
    label: [8.7, 1.95],
  },
  {
    id: 'bathroom',
    polygon: [
      [3.5, 0],
      [5.3, 0],
      [5.3, 1.9],
      [3.5, 1.9],
    ],
    label: [4.4, 0.9],
  },
  {
    id: 'balcony',
    polygon: [
      [5.5, 7.85],
      [9, 7.85],
      [9, 8.95],
      [5.5, 8.95],
    ],
    label: [7.25, 8.4],
  },
];

export const PAPER_OPENINGS: PaperOpening[] = [
  {a: [5.75, 0], b: [6.65, 0], kind: 'door', leaf: {hinge: 'a', side: 1}}, // front door
  {a: [4.15, 1.95], b: [4.85, 1.95], kind: 'door', leaf: {hinge: 'a', side: -1}}, // hallway ↔ bathroom
  {a: [3.45, 2.4], b: [3.45, 3.2], kind: 'door', leaf: {hinge: 'a', side: -1}}, // hallway ↔ kids' room
  {a: [3.45, 4.05], b: [3.45, 4.85], kind: 'door', leaf: {hinge: 'b', side: -1}}, // corridor ↔ bedroom
  {a: [5.2, 3.75], b: [6.5, 3.75], kind: 'door'}, // hallway ↔ living room, a wide archway
  {a: [6.95, 2.5], b: [6.95, 3.3], kind: 'door', leaf: {hinge: 'b', side: 1}}, // hallway ↔ kitchen
  {a: [6, 7.725], b: [6.8, 7.725], kind: 'door', leaf: {hinge: 'a', side: -1}}, // living room ↔ balcony
  {a: [7.1, 7.725], b: [8.7, 7.725], kind: 'window'}, // living room, onto the balcony
  {a: [3.9, 7.6], b: [5.2, 7.6], kind: 'window'}, // living room, to the outside
  {a: [0.8, 7.6], b: [2.6, 7.6], kind: 'window'}, // bedroom
  {a: [0.8, 0], b: [2.6, 0], kind: 'window'}, // kids' room
  {a: [7.9, 0], b: [9.5, 0], kind: 'window'}, // kitchen
  {a: [5.6, 8.95], b: [8.9, 8.95], kind: 'window'}, // balcony glazing
  {a: [9, 7.95], b: [9, 8.85], kind: 'window'},
  {a: [5.5, 7.95], b: [5.5, 8.85], kind: 'window'},
];

// The flat's outer walls, outside the rooms' outlines (the editor adds them the same way): 25 cm thick.
export const OUTER_WALL = 0.25;
// The inner walls are the 10 cm gaps between rooms; the balcony's thin parapet is as thick.
export const INNER_WALL = 0.1;
// The rooms inside the outer walls (the balcony is outside them).
export const FLAT_BOX = {left: 0, bottom: 0, right: 10.4, top: 7.6};

// ---------- where the plan sits in the clip ----------

// The clip's view: 16 : 10, in its own units.
export const VIEW_WIDTH = 320;
export const VIEW_HEIGHT = 200;
// The paper lies a little turned on the table, as on a quick phone photo; the editor's overlay turns with it.
export const PAPER_TURN_DEGREES = -1.6;
const PIVOT_X = VIEW_WIDTH / 2;
const PIVOT_Y = VIEW_HEIGHT / 2;
// Clip units per metre, and the plan's middle (metres) at the paper's middle.
export const SCALE = 17.5;
const PLAN_MIDDLE: Point = [5.2, 4.35];
const PAPER_MIDDLE: Point = [160, 101];

/** A plan point (metres) on the paper, before the paper's turn: y grows down, north is up. */
export function toPaper(point: Point): Point {
  const x = PAPER_MIDDLE[0] + (point[0] - PLAN_MIDDLE[0]) * SCALE;
  const y = PAPER_MIDDLE[1] - (point[1] - PLAN_MIDDLE[1]) * SCALE;
  return [x, y];
}

/** A paper point turned with the paper: where it is seen in the clip. */
export function paperToView(point: Point): Point {
  const angle = (PAPER_TURN_DEGREES * Math.PI) / 180;
  const dx = point[0] - PIVOT_X;
  const dy = point[1] - PIVOT_Y;
  return [
    PIVOT_X + dx * Math.cos(angle) - dy * Math.sin(angle),
    PIVOT_Y + dx * Math.sin(angle) + dy * Math.cos(angle),
  ];
}

/** A point of the clip's view on the turned paper (the reverse of paperToView). */
export function viewToPaper(point: Point): Point {
  const angle = (-PAPER_TURN_DEGREES * Math.PI) / 180;
  const dx = point[0] - PIVOT_X;
  const dy = point[1] - PIVOT_Y;
  return [
    PIVOT_X + dx * Math.cos(angle) - dy * Math.sin(angle),
    PIVOT_Y + dx * Math.sin(angle) + dy * Math.cos(angle),
  ];
}

/** A plan point (metres) where it is seen in the clip. */
export const planToView = (point: Point): Point => paperToView(toPaper(point));

/** The SVG transform that turns a group with the paper. */
export const PAPER_TURN = `rotate(${PAPER_TURN_DEGREES} ${PIVOT_X} ${PIVOT_Y})`;

// ---------- drawing helpers ----------

const fixed = (value: number): string => value.toFixed(2);

/** A closed path through plan points, in paper units. */
export function planPath(points: Point[]): string {
  const paper = points.map(toPaper);
  return 'M' + paper.map(([x, y]) => `${fixed(x)} ${fixed(y)}`).join('L') + 'Z';
}

/** A rectangle given by two plan corners, as an SVG rect's attributes in paper units. */
export function planRect(a: Point, b: Point): string {
  const [ax, ay] = toPaper(a);
  const [bx, by] = toPaper(b);
  const x = Math.min(ax, bx);
  const y = Math.min(ay, by);
  return `x="${fixed(x)}" y="${fixed(y)}" width="${fixed(Math.abs(bx - ax))}" height="${fixed(Math.abs(by - ay))}"`;
}

/** The flat's walls as one shape: the outer box with every room cut out, so the gaps between rooms are the inner walls. */
export function wallsPath(): string {
  const {left, bottom, right, top} = FLAT_BOX;
  const outer: Point[] = [
    [left - OUTER_WALL, bottom - OUTER_WALL],
    [right + OUTER_WALL, bottom - OUTER_WALL],
    [right + OUTER_WALL, top + OUTER_WALL],
    [left - OUTER_WALL, top + OUTER_WALL],
  ];
  const rooms = PAPER_ROOMS.filter(room => room.id !== 'balcony');
  return planPath(outer) + rooms.map(room => planPath(room.polygon)).join('');
}

/** Whether an opening runs along x (a wall seen from the north or the south). */
const runsAlongX = (opening: PaperOpening): boolean => opening.a[1] === opening.b[1];

/** The wall an opening is in, across its thickness: from and to, in metres, on the axis across the wall. */
export function wallBand(opening: PaperOpening): [number, number] {
  const across = runsAlongX(opening) ? opening.a[1] : opening.a[0];
  const {left, bottom, right, top} = FLAT_BOX;
  const outerBands: Array<[number, number]> = runsAlongX(opening)
    ? [
        [bottom - OUTER_WALL, bottom],
        [top, top + OUTER_WALL],
      ]
    : [
        [left - OUTER_WALL, left],
        [right, right + OUTER_WALL],
      ];
  const outer = outerBands.find(([from, to]) => across >= from - 1e-6 && across <= to + 1e-6);
  return outer || [across - INNER_WALL / 2, across + INNER_WALL / 2];
}

/** A plan point given along an opening's wall and across it (metres). */
function onWall(opening: PaperOpening, along: number, across: number): Point {
  return runsAlongX(opening) ? [along, across] : [across, along];
}

/** How far along its wall a plan point is: its x on a wall along x, else its y. */
function alongWall(opening: PaperOpening, point: Point): number {
  return runsAlongX(opening) ? point[0] : point[1];
}

/** An opening's span along its wall, in metres. */
function span(opening: PaperOpening): [number, number] {
  const axis = runsAlongX(opening) ? 0 : 1;
  return [Math.min(opening.a[axis], opening.b[axis]), Math.max(opening.a[axis], opening.b[axis])];
}

/** The gap an opening leaves in its wall: a rect's attributes in paper units, a hair longer so no ink is left at its ends. */
export function openingGap(opening: PaperOpening, grow = 0.01): string {
  const [from, to] = span(opening);
  const [inside, outside] = wallBand(opening);
  return planRect(onWall(opening, from, inside - grow), onWall(opening, to, outside + grow));
}

/** A window's marks, as on a printed plan: the wall's two faces and the glass between them. */
function windowMarks(opening: PaperOpening): string {
  const [from, to] = span(opening);
  const [inside, outside] = wallBand(opening);
  const middle = (inside + outside) / 2;
  const line = (across: number): string => {
    const [x1, y1] = toPaper(onWall(opening, from, across));
    const [x2, y2] = toPaper(onWall(opening, to, across));
    return `M${fixed(x1)} ${fixed(y1)}L${fixed(x2)} ${fixed(y2)}`;
  };
  return line(inside) + line(outside) + line(middle);
}

/** A door's leaf, opened square, and the quarter circle it sweeps; an archway has neither. */
function doorSwing(opening: PaperOpening): string {
  if (!opening.leaf) return '';
  const [from, to] = span(opening);
  const [inside, outside] = wallBand(opening);
  const face = opening.leaf.side > 0 ? outside : inside;
  const width = to - from;
  const hingeEnd = opening.leaf.hinge === 'a' ? opening.a : opening.b;
  const hingeAlong = alongWall(opening, hingeEnd);
  const freeAlong = hingeAlong === from ? to : from;
  const leafEnd = toPaper(onWall(opening, hingeAlong, face + opening.leaf.side * width));
  const hinge = toPaper(onWall(opening, hingeAlong, face));
  // the sweep as a few short lines, so its direction needs no arc flags
  const sweep: string[] = [];
  const steps = 10;
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * (Math.PI / 2);
    const along = hingeAlong + (freeAlong - hingeAlong) * Math.sin(angle);
    const across = face + opening.leaf.side * width * Math.cos(angle);
    const [x, y] = toPaper(onWall(opening, along, across));
    sweep.push(`${fixed(x)} ${fixed(y)}`);
  }
  return (
    `<path class="leaf" d="M${fixed(hinge[0])} ${fixed(hinge[1])}L${fixed(leafEnd[0])} ${fixed(leafEnd[1])}"/>` +
    `<path class="sweep" d="M${sweep.join('L')}"/>`
  );
}

// ---------- the photo ----------

/** Room names as written on the plan, in the user's language. */
function roomNames(): Record<string, string> {
  return {
    hall: t('Hallway'),
    living: t('Living room'),
    bedroom: t('Bedroom'),
    kids: t("Kids' room"),
    kitchen: t('Kitchen'),
    bathroom: t('Bathroom'),
    balcony: t('Balcony'),
  };
}

/** A polygon's area in square metres. */
function polygonArea(points: Point[]): number {
  let twice = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    twice += x1 * y2 - x2 * y1;
  }
  return Math.abs(twice) / 2;
}

/** The room's width at its label, in metres: the name's letters are made small enough to fit it. */
function roomWidth(room: PaperRoom): number {
  const xs = room.polygon.map(point => point[0]);
  return room.id === 'hall' ? 1.5 : Math.max(...xs) - Math.min(...xs);
}

/** A room's name in capitals and its area below, as printed. */
function roomLabel(room: PaperRoom, name: string): string {
  const [x, y] = toPaper(room.label);
  const text = name.toLocaleUpperCase(locale());
  const widthUnits = roomWidth(room) * SCALE * 0.84;
  const size = Math.min(5.6, widthUnits / Math.max(1, text.length * 0.64));
  const area = num(polygonArea(room.polygon), 1) + t(' m²');
  return (
    `<text x="${fixed(x)}" y="${fixed(y)}" font-size="${size.toFixed(2)}" class="name">${esc(text)}</text>` +
    `<text x="${fixed(x)}" y="${fixed(y + 6.2)}" font-size="4.4" class="area">${esc(area)}</text>`
  );
}

/** A dimension line along the bottom or the left of the plan: its ticks at the given walls and each length written. */
function dimensionLine(side: 'bottom' | 'left', stops: number[]): string {
  const offset = -0.85;
  const at = (value: number): Point => (side === 'bottom' ? [value, offset] : [offset, value]);
  const parts: string[] = [];
  const [x1, y1] = toPaper(at(stops[0]));
  const [x2, y2] = toPaper(at(stops[stops.length - 1]));
  parts.push(`<path class="dim" d="M${fixed(x1)} ${fixed(y1)}L${fixed(x2)} ${fixed(y2)}"/>`);
  for (const stop of stops) {
    const [x, y] = toPaper(at(stop));
    parts.push(
      `<path class="dim" d="M${fixed(x - 1.6)} ${fixed(y + 1.6)}L${fixed(x + 1.6)} ${fixed(y - 1.6)}"/>`,
    );
  }
  for (let i = 0; i + 1 < stops.length; i++) {
    const middle = (stops[i] + stops[i + 1]) / 2;
    const length = num(stops[i + 1] - stops[i], 2);
    const [x, y] = toPaper(at(middle));
    const placed =
      side === 'bottom'
        ? `x="${fixed(x)}" y="${fixed(y - 1.6)}"`
        : `x="0" y="0" transform="translate(${fixed(x - 1.6)} ${fixed(y)}) rotate(-90)"`;
    parts.push(`<text ${placed} font-size="4.6" class="len">${esc(length)}</text>`);
  }
  return parts.join('');
}

/** The ink of the plan: walls, openings, the balcony, names and dimensions, in paper units. */
function planInk(): string {
  const names = roomNames();
  const balcony = PAPER_ROOMS.find(room => room.id === 'balcony')!; // in the list above
  const gaps = PAPER_OPENINGS.map(opening => `<rect class="gap" ${openingGap(opening)}/>`).join('');
  const windows = PAPER_OPENINGS.filter(opening => opening.kind === 'window')
    .map(windowMarks)
    .join('');
  const doors = PAPER_OPENINGS.map(doorSwing).join('');
  return (
    `<path class="wall" fill-rule="evenodd" d="${wallsPath()}"/>` +
    `<path class="parapet" d="${planPath(balcony.polygon)}"/>` +
    gaps +
    `<path class="mark" d="${windows}"/>` +
    doors +
    PAPER_ROOMS.map(room => roomLabel(room, names[room.id])).join('') +
    dimensionLine('bottom', [0, 3.45, 6.95, 10.4]) +
    dimensionLine('left', [0, 3.75, 7.6]) +
    `<text x="268" y="192" font-size="4.6" class="len">1:100</text>`
  );
}

/** The photo as SVG markup: a table, the turned paper with its shadow and the plan, then the room's light and the grain. */
export function planPhotoMarkup(): string {
  const ink = '#1f1f22';
  const paper = '#f3efe6';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}">` +
    `<defs>` +
    `<linearGradient id="table" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8b8173"/><stop offset="1" stop-color="#5f574d"/></linearGradient>` +
    `<linearGradient id="paper" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f7f4ec"/><stop offset="1" stop-color="#e6e0d2"/></linearGradient>` +
    `<radialGradient id="light" cx=".34" cy=".22" r=".95"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".26"/></radialGradient>` +
    `<filter id="shadow" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="3.2"/></filter>` +
    `<filter id="soft"><feGaussianBlur stdDeviation=".18"/></filter>` +
    `<filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="7" stitchTiles="stitch"/>` +
    `<feColorMatrix values="0 0 0 0 .2  0 0 0 0 .18  0 0 0 0 .15  .32 0 0 0 -.1"/></filter>` +
    `</defs>` +
    `<rect width="${VIEW_WIDTH}" height="${VIEW_HEIGHT}" fill="url(#table)"/>` +
    `<g transform="${PAPER_TURN}">` +
    `<rect x="37" y="-18" width="252" height="250" fill="#000" opacity=".42" filter="url(#shadow)"/>` +
    `<rect x="34" y="-24" width="252" height="250" fill="url(#paper)"/>` +
    `<g filter="url(#soft)" font-family="'Arial Narrow','Helvetica Neue',Arial,sans-serif" text-anchor="middle">` +
    `<style>.wall{fill:${ink}}.gap{fill:${paper}}.parapet{fill:none;stroke:${ink};stroke-width:${fixed(INNER_WALL * SCALE)}}` +
    `.mark,.leaf,.sweep,.dim{fill:none;stroke:${ink};stroke-width:.5}.sweep{stroke-width:.4}.leaf{stroke-width:.8}` +
    `.name{fill:${ink};font-weight:600;letter-spacing:.25px}.area,.len{fill:#3a3a3e}</style>` +
    planInk() +
    `</g></g>` +
    `<rect width="${VIEW_WIDTH}" height="${VIEW_HEIGHT}" fill="url(#light)"/>` +
    `<rect width="${VIEW_WIDTH}" height="${VIEW_HEIGHT}" filter="url(#grain)"/>` +
    `</svg>`
  );
}

// One picture per language (the names and numbers are written in it).
const photoUrls = new Map<string, string>();

/** The photo as an image address, made once per language. */
export function planPhotoUrl(): string {
  const key = locale();
  let url = photoUrls.get(key);
  if (!url) {
    url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(planPhotoMarkup());
    photoUrls.set(key, url);
  }
  return url;
}
