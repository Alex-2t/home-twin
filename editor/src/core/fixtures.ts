// What kind of light it is (the lamp's form) and where it goes by default. The form determines the rest: points or lines,
// height, where it shines in 3D. An HA light is one entity; it can have many points (spots on one relay) or pieces
// (a strip along three walls). No three.js, covered by tests.
import {t} from '../i18n/i18n.ts';
import pc from 'polygon-clipping';
import {WALL, pointIn, area, offset, segDist, openingCoords, poly} from './geometry.ts';
import {zoneParts} from './plan.ts';
import {axes, footRects} from './layout.ts';
import {zOf, lArms, byId} from './catalog.ts';
import {isRun, runGeo, runLines} from './runs.ts';
import type {
  FurnitureItem,
  LightForm,
  Opening,
  Outline,
  Plan,
  PlanLight,
  Point,
  Room,
  Segment,
  Vector,
} from './types.ts';

/** A light's cell (lampCell): its room, the part of it where the light goes, and the chord between two areas (null: none). */
export interface LampCell {
  room: Room;
  poly: Outline;
  ch: Segment | null;
}
/** A wall of a cell (cellEdges): its ends, length, direction and the inward normal. */
export interface CellEdge {
  a: Point;
  b: Point;
  l: number;
  u: Vector;
  n: Vector;
}
/** A stretch [from, to], metres along a wall or a strip's contour. */
type Interval = [number, number];
/**
 * A strip's contour in a cell (stripContour): the cell's corners P, the contour C, each corner's distance along it S (S[n] is
 * the whole length), how many sides n, the perimeter per, and where a strip of this kind does not run by itself (gaps).
 */
export interface Contour {
  P: Outline;
  C: Outline;
  S: number[];
  n: number;
  per: number;
  gaps: Interval[];
}
/** Where a strip runs along its contour: runs [s0, s1] (s1 may wrap past the end), or all of it (closed). */
export interface StripRuns {
  runs: Interval[];
  closed: boolean;
}
/** A strip variant on furniture (FURN_STRIP): its names, the models it runs along, and the variant it goes back to without them. */
export interface FurnStripKind {
  name: string;
  tip: string;
  where: string;
  models: string[];
  back: string;
}
/** What placing lights reads of a plan: the rooms, the openings and the furniture. */
type LightPlan = Pick<Plan, 'rooms' | 'openings' | 'furniture'>;
/** A table found for the lights (tableOf): its centre, long axis and length, and the item. */
export interface LightTable {
  c: Point;
  u: Vector;
  len: number;
  f: FurnitureItem;
}

export const FORMS: Array<{id: LightForm; name: string; tip: string}> = [
  {id: 'ceiling', name: t('Ceiling light'), tip: t('Chandelier, ceiling lamp or panel')},
  {id: 'pendant', name: t('Pendant'), tip: t('Hanging light over a table, island or bed')},
  {id: 'spots', name: t('Spots'), tip: t('Spotlights — several on one light')},
  {id: 'line', name: t('Linear'), tip: t('Linear light or track on the ceiling')},
  {id: 'strip', name: t('Strip'), tip: t('LED strip along the walls')},
  {id: 'wall', name: t('Wall lamp'), tip: t('Sconce, mirror or picture light')},
  {id: 'lamp', name: t('Floor lamp'), tip: t('Floor lamp, table lamp, night light')},
];
export const lineForm = (f: LightForm | null | undefined): boolean => f === 'line' || f === 'strip';
// old plans without a form: a high point is a ceiling light, a low one a sconce; a strip is a strip
// (no height counts as 0, as the comparison read it)
// A form this editor draws; one it does not know (a newer editor's, a broken file's) is guessed from the light's name, as the
// lights panel guesses one for a light it places.
export const isForm = (form: unknown): form is LightForm => FORMS.some(f => f.id === form);
export const formFor = (
  L: Pick<PlanLight, 'form' | 'kind' | 'h' | 'name' | 'entity' | 'model'>,
): LightForm => {
  if (isForm(L.form)) return L.form;
  if (L.form != null) return guessForm(L).form;
  return L.kind === 'strip' ? 'strip' : (L.h ?? 0) > 2 ? 'ceiling' : 'wall';
};
const CEIL = WALL.height;
export const HEIGHTS = {
  ceiling: CEIL - 0.05,
  pendant: CEIL - 0.6,
  spots: CEIL - 0.02,
  line: CEIL - 0.02,
  wall: 1.6,
};
// A strip is at the ceiling or at the floor (or on furniture, FURN_STRIP below). Old strips with opt 'cab' (1.4 m) keep their height.
export const STRIP: Record<string, {h: number; name: string; tip: string}> = {
  top: {h: 2.5, name: t('Ceiling'), tip: t('2.5 m: cove, floating ceiling, niche — light down the walls')},
  floor: {h: 0.1, name: t('Floor'), tip: t('10 cm: baseboard, under the bed, stairs — light onto the floor')},
};
export const LAMP: Record<string, {h: number; name: string}> = {
  floor: {h: 1.5, name: t('Floor lamp')},
  table: {h: 0.75, name: t('Table lamp')},
};
export const SPOTS: Record<string, string> = {grid: t('Grid'), row: t('Row'), ring: t('Perimeter')};
export const LINES: Record<string, string> = {along: t('Along'), across: t('Across'), frame: t('Frame')};
// A pendant's shade (L.shade): opal glass dome, black metal dome, glass globe, rattan bell. None set: guessed from the name, else the dome.
export const SHADES: Record<string, string> = {
  dome: t('Opal dome'),
  metal: t('Black metal'),
  globe: t('Glass globe'),
  woven: t('Rattan'),
};
// A light's shade, housing or furniture strip from a plan file is a key of its table only as an own key ('toString' is on
// every object, but is none of them). No key (a light without a shade) is none either.
const ownKey = (table: object, k: string | null | undefined): k is string =>
  k != null && Object.hasOwn(table, k);
const SHADE_RE: Array<[string, RegExp]> = [
  [
    'woven',
    /rattan|wicker|woven|paper|bamboo|jute|ротанг|плетён|плетен|бумажн|бамбук|rotin|osier|papier|mimbre|ratán|papel|vimini|carta|wiklin|papierow|vime|藤|纸/i,
  ],
  ['globe', /globe|sphere|ball|orb|шар|kugel|boule|globo|bola|sfera|kula|球/i],
  [
    'metal',
    /black|metal|industrial|черн|чёрн|металл|лофт|schwarz|noir|métal|negr|metál|nero|metallo|czarn|metal|preto|黑|金属/i,
  ],
];
// A linear light's body (L.shade 'black' or 'white'): none set — black if the name says so (“Black track”), else white
export const HOUSINGS: Record<string, string> = {white: t('White'), black: t('Black')};
export const housingOf = (L: Pick<PlanLight, 'shade' | 'name' | 'model'>): string =>
  ownKey(HOUSINGS, L.shade)
    ? L.shade
    : SHADE_RE[2][1].test([L.name, L.model].filter(Boolean).join(' '))
      ? 'black'
      : 'white';
// A fitting's own colour (L.body, '#rrggbb'): white and black to pick at once, or any colour. Forms with a body to colour:
// all but the strip (a thin profile that shows only when it glows).
export const BODY_COLORS: Record<string, string> = {white: '#eeebe6', black: '#27282b'};
export const hasBody = (form: LightForm): boolean => form !== 'strip';
export const shadeOf = (L: Pick<PlanLight, 'shade' | 'name' | 'model'>): string =>
  ownKey(SHADES, L.shade)
    ? L.shade
    : SHADE_RE.find(([, r]) => r.test([L.name, L.model].filter(Boolean).join(' ')))?.[0] || 'dome';
const OPT: Partial<Record<LightForm, string>> = {
  spots: 'grid',
  line: 'along',
  strip: 'top',
  wall: 'one',
  lamp: 'floor',
};

// ---------- guess by name ----------
// \b in JS does not see Cyrillic or accented letters, so we check word starts ourselves. Words in the ten UI languages (D-036):
// light names in HA are in the user's language (Russian, English, German, French, Dutch, Spanish, Chinese,
// Italian, Polish, Portuguese). Chinese has no spaces between words, so each character itself serves as a word start.
// allow-cyrillic below: the word-start class for RegExp holds Cyrillic letters
const W = '(?:^|[^a-zа-яё0-9à-öø-ÿąćęłńóśźż])'; // allow-cyrillic
const re = (s: string): RegExp => new RegExp(W + '(?:' + s + ')', 'i');
const K = {
  line: re(
    'трек|track|линия|линии|линейн|light ?line|профил|schiene|lichtlinie|rail|ligne lumineuse|lichtlijn|carril|línea de luz|binario|linea luminosa|szyn|linia świetl|trilho|linha de luz|轨道|线条灯|线形灯',
  ),
  spots: re(
    'спот|точечн|spot|downlight|gu10|mr16|встраив|recessed|strahler|einbau|encastr|inbouw|foco|empotr|ojo de buey|farett|incass|oczk|halogen|wpust|embutid|射灯|筒灯',
  ),
  pendant: re(
    'подвес|pendant|над стол|над остров|pendel|hängeleuchte|hängelampe|suspension|suspendu|hanglamp|colgante|sospensione|wisząc|zwis|pendente|吊灯',
  ),
  // a sconce named so: before the table lamp — “Bedside sconces” are a pair at the headboard, not a lamp on a nightstand
  sconce: re(
    'бра(?![а-яё])|sconce|настенн|wall ?(?:lamp|light)|wandlampe|wandleuchte|applique|wandlamp|aplique|kinkiet|lampa ścienna|arandela|壁灯',
  ),
  mirror: re('зеркал|mirror|vanity|spiegel|miroir|espejo|specchio|lustr|espelho|镜'),
  desk: re('письмен|рабоч|desk|schreibtisch|bureau|escritorio|scrivania|biurk|secretária|书桌'),
  floorLamp: re(
    'торшер|floor ?lamp|напольн|stehlampe|stehleuchte|lampadaire|staande lamp|vloerlamp|lámpara de pie|piantana|lampada da terra|lampa podłogowa|lampa stojąca|luminária de chão|abajur de pé|落地灯',
  ),
  table: re(
    'настольн|ночник|desk|table ?lamp|bedside|night ?light|tischlampe|tischleuchte|nachttisch|schreibtisch|nachtlicht|lampe de chevet|chevet|lampe de bureau|veilleuse|tafellamp|bureaulamp|nachtlamp|lámpara de mesa|mesita|escritorio|luz nocturna|lampada da tavolo|comodino|scrivania|abat-jour|luce notturna|lampk|biurk|nocn|abajur|luminária de mesa|cabeceira|台灯|床头灯|夜灯',
  ),
  wall: re(
    'бра(?![а-яё])|sconce|настен|wall|зеркал|mirror|картин|picture|wandlampe|wandleuchte|wand|spiegel|bild|applique|murale|miroir|tableau|wandlamp|muur|aplique|pared|espejo|cuadro|parete|specchio|quadro|kinkiet|ścien|lustr|obraz|arandela|parede|espelho|壁灯|镜前灯',
  ),
  pair: re(
    'кроват|bed(?!room)|пара|pair|двойн|bett|paar|doppel|lit|paire|double|dubbel|cama|par|doble|letto|coppia|doppi|łóżk|para|podwójn|dupl|床|双',
  ),
  strip: re(
    'лент|strip|подсветк|карниз|cove|штор|curtain|ниш|niche|backlight|streifen|led-band|lichtband|leiste|indirekt|voute|vorhang|gardine|nische|ruban|bande led|indirect|corniche|rideau|ledstrip|lichtstrip|gordijn|nis|tira|cinta|cortina|nicho|striscia|indirett|tenda|nicchia|taśm|pasek|podświetl|listw|karnisz|zasłon|wnęk|fita|indiret|sanca|灯带|灯条|氛围灯',
  ),
  floor: re(
    'пол(?:а|у)?(?![а-яё])|плинтус|floor|plinth|skirting|кроват|bed(?!room)|ступен|stair|boden|sockel|fußleiste|stufe|treppe|bett|sol|plinthe|marche|escalier|lit|vloer|plint|trap|suelo|zócalo|escal|cama|pavimento|battiscopa|gradin|scal|letto|podłog|cokół|schod|łóżk|chão|piso|rodapé|degrau|escada|地脚|踢脚|楼梯|床底',
  ),
  win: re(
    'штор|окн|curtain|window|карниз|vorhang|gardine|fenster|rideau|fenêtre|gordijn|raam|cortina|ventana|tenda|finestra|zasłon|okn|firan|janela|窗帘|窗',
  ),
};
// Form and variant from the light's name, entity and model. HA hints (kind, h in demo data) outweigh generic words.
export function guessForm(L: Pick<PlanLight, 'name' | 'entity' | 'model' | 'kind' | 'h'>): {
  form: LightForm;
  opt: string | undefined;
} {
  const s = [L.name, L.entity, L.model].filter(Boolean).join(' ');
  const pick = (form: LightForm, opt?: string): {form: LightForm; opt: string | undefined} => ({
    form,
    opt: opt ?? OPT[form],
  });
  if (K.line.test(s)) return pick('line');
  if (K.spots.test(s)) return pick('spots');
  if (K.pendant.test(s)) return pick('pendant');
  if (K.sconce.test(s)) return pick('wall', K.pair.test(s) ? 'pair' : 'one');
  if (K.floorLamp.test(s)) return pick('lamp', 'floor');
  if (K.table.test(s)) return pick('lamp', 'table');
  if (K.wall.test(s)) return pick('wall', K.pair.test(s) ? 'pair' : 'one');
  const stripOpt = (): string =>
    L.kind === 'strip' && L.h != null ? (L.h < 1 ? 'floor' : 'top') : K.floor.test(s) ? 'floor' : 'top';
  if (L.kind === 'strip') return pick('strip', stripOpt());
  if (L.kind === 'point') return pick(L.h != null && L.h < 2 ? 'wall' : 'ceiling');
  if (K.strip.test(s)) return pick('strip', stripOpt());
  return pick('ceiling');
}
// order in the wizard: the room's main light first, then the rest
export const FORM_ORDER = Object.fromEntries(
  ['ceiling', 'pendant', 'spots', 'line', 'wall', 'lamp', 'strip'].map((f, i) => [f, i]),
);

// ---------- where the light is ----------
const R3 = (v: number): number => +v.toFixed(3);
const P3 = (p: Point): Point => [R3(p[0]), R3(p[1])];
const bbox = (P: Outline): {x0: number; x1: number; y0: number; y1: number} => {
  const xs = P.map(q => q[0]);
  const ys = P.map(q => q[1]);
  return {x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys)};
};
const len = (a: Point, b: Point): number => Math.hypot(b[0] - a[0], b[1] - a[1]);
// A light's cell is a room or a part of it (two areas in one room): that is where the light goes by default.
// L.room: the room is already chosen (the light is on the plan, or the user said where it is); otherwise the room of the light's area.
// (zoneParts is null for a room without a zone: past it, zone! is there.)
export function lampCell(plan: Pick<Plan, 'rooms'>, L: Pick<PlanLight, 'room' | 'area'>): LampCell | null {
  let r = L.room && plan.rooms.find(x => x.id === L.room);
  if (!r && L.area)
    r =
      plan.rooms.find(x => x.area === L.area) ||
      plan.rooms.find(x => zoneParts(x) && x.zone!.area === L.area);
  if (!r) return null;
  const zp = zoneParts(r);
  if (!zp) return {room: r, poly: r.polygon, ch: null};
  const inZone = !!r.zone!.area && r.zone!.area === L.area && r.area !== L.area;
  const inMain = !!r.area && r.area === L.area;
  return {
    room: r,
    poly: inZone ? zp.zone : inMain ? zp.main : r.polygon,
    ch: inZone || inMain ? zp.ch : null,
  };
}
// The cell's walls (excluding the boundary between two areas, which has no wall), normal n points inwards.
export function cellEdges(cell: Pick<LampCell, 'poly' | 'ch'>): CellEdge[] {
  const P = cell.poly;
  const s = area(P) > 0 ? 1 : -1;
  const out: CellEdge[] = [];
  const onChord = (q: Point): boolean | null => cell.ch && segDist(q, cell.ch[0], cell.ch[1])[0] < 1e-3;
  for (let i = 0; i < P.length; i++) {
    const a = P[i];
    const b = P[(i + 1) % P.length];
    const l = len(a, b);
    if (l < 0.4 || (onChord(a) && onChord(b))) continue;
    const u: Vector = [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
    out.push({a, b, l, u, n: [-u[1] * s, u[0] * s]});
  }
  return out;
}
const along = (e: CellEdge, t: number, k: number): Point =>
  P3([e.a[0] + e.u[0] * t + e.n[0] * k, e.a[1] + e.u[1] * t + e.n[1] * k]);
const hasWindow = (plan: Pick<Plan, 'rooms' | 'openings'>, e: {a: Point; b: Point}): boolean =>
  plan.openings.some(o => {
    const c = o.kind === 'window' && openingCoords(plan.rooms, o);
    return c && segDist([(c.a[0] + c.b[0]) / 2, (c.a[1] + c.b[1]) / 2], e.a, e.b)[0] < 0.45;
  });
// A point inside the room: if outside (L-shaped room), move to the nearest wall and 30 cm inwards.
// A light's point inside the room and no closer than 15 cm to a wall: beyond that line, onto the nearest point of the contour offset inwards
// (a pendant or ceiling light on a wall is a mistake). If the room is too narrow for the offset, as before: 30 cm inwards from the nearest wall.
// (Each search for the nearest wall below runs over a ring of at least three corners: best! is found.)
function inside(P: Outline, p: Point, m = 0.15): Point {
  const ring = offset(P, -m);
  const ok = ring.length > 2 && Math.sign(area(ring)) === Math.sign(area(P)) && Math.abs(area(ring)) > 0.01;
  if (ok) {
    if (pointIn(p, ring)) return P3(p);
    let best: {d: number; q: Point} | null = null;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      const [d, t] = segDist(p, a, b);
      if (!best || d < best.d) best = {d, q: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]};
    }
    return P3(best!.q);
  }
  if (pointIn(p, P)) return P3(p);
  const s = area(P) > 0 ? 1 : -1;
  let best: {d: number; q: Point} | null = null;
  for (let i = 0; i < P.length; i++) {
    const a = P[i];
    const b = P[(i + 1) % P.length];
    const [d, t] = segDist(p, a, b);
    if (best && d >= best.d) continue;
    const l = len(a, b) || 1;
    const u: Vector = [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
    best = {d, q: [a[0] + (b[0] - a[0]) * t - u[1] * s * 0.3, a[1] + (b[1] - a[1]) * t + u[0] * s * 0.3]};
  }
  return P3(best!.q);
}
export const keepIn = inside; // a light being dragged: the body does not enter the wall
// Segment from o (inside the room) to q: up to the first wall minus m, so a ceiling line does not pass through a wall.
export function clampRay(P: Outline, o: Point, q: Point, m = 0.1): Point {
  const u: Vector = [q[0] - o[0], q[1] - o[1]];
  const l = Math.hypot(u[0], u[1]);
  if (l < 1e-9) return q;
  let hi = 1;
  for (let i = 0; i < P.length; i++) {
    const a = P[i];
    const b = P[(i + 1) % P.length];
    const d = [b[0] - a[0], b[1] - a[1]];
    const den = u[0] * d[1] - u[1] * d[0];
    if (Math.abs(den) < 1e-12) continue;
    const w = [a[0] - o[0], a[1] - o[1]];
    const t = (w[0] * d[1] - w[1] * d[0]) / den;
    const s = (w[0] * u[1] - w[1] * u[0]) / den;
    if (s >= -1e-9 && s <= 1 + 1e-9 && t > 1e-9 && t < hi) hi = t;
  }
  if (hi >= 1 && pointIn(q, P)) return q;
  const t = Math.max(0, hi - m / l);
  return P3([o[0] + u[0] * t, o[1] + u[1] * t]);
}
// area-weighted centroid (in an L-shaped room the average of the corners drifts off)
export function center(P: Outline): Point {
  let A = 0;
  let x = 0;
  let y = 0;
  for (let i = 0; i < P.length; i++) {
    const [x0, y0] = P[i];
    const [x1, y1] = P[(i + 1) % P.length];
    const k = x0 * y1 - x1 * y0;
    A += k;
    x += (x0 + x1) * k;
    y += (y0 + y1) * k;
  }
  if (Math.abs(A) < 1e-9) return P3(P[0]);
  return inside(P, [x / (3 * A), y / (3 * A)]);
}

// Spots: a grid with half spacing at the walls (the way fixtures are laid out), the last row is partial and centered;
// in a row: along the long side; around the perimeter: 50 cm from the walls, evenly along the contour.
export function defaultSpots(P: Outline): number {
  const b = bbox(P);
  const c = Math.max(1, Math.min(6, Math.round((b.x1 - b.x0) / 1.6)));
  const r = Math.max(1, Math.min(4, Math.round((b.y1 - b.y0) / 1.6)));
  return Math.max(2, c * r);
}
export function spotsLayout(P: Outline, n: number, layout = 'grid'): Point[] {
  n = Math.max(1, Math.round(n));
  const b = bbox(P);
  const W = b.x1 - b.x0;
  const H = b.y1 - b.y0;
  if (layout === 'row') {
    const wide = W >= H;
    return Array.from({length: n}, (_, j) => {
      const t = (j + 0.5) / n;
      return inside(P, wide ? [b.x0 + W * t, (b.y0 + b.y1) / 2] : [(b.x0 + b.x1) / 2, b.y0 + H * t]);
    });
  }
  if (layout === 'ring') {
    const d = Math.min(0.5, Math.min(W, H) / 4);
    const ring = offset(P, -d);
    const L = ring.reduce((s, a, i) => s + len(a, ring[(i + 1) % ring.length]), 0);
    const out: Point[] = [];
    for (let k = 0; k < n; k++) {
      let t = (k * L) / n;
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const c = ring[(i + 1) % ring.length];
        const l = len(a, c);
        if (t <= l + 1e-9) {
          const f = l ? t / l : 0;
          out.push(inside(P, [a[0] + (c[0] - a[0]) * f, a[1] + (c[1] - a[1]) * f]));
          break;
        }
        t -= l;
      }
    }
    return out;
  }
  const rows = Math.max(1, Math.min(n, Math.round(Math.sqrt((n * H) / (W || 1)))));
  const cols = Math.ceil(n / rows);
  const out: Point[] = [];
  for (let i = 0; i < rows; i++) {
    const k = i < rows - 1 ? cols : n - cols * (rows - 1);
    for (let j = 0; j < k; j++)
      out.push(inside(P, [b.x0 + (W * (j + 0.5 + (cols - k) / 2)) / cols, b.y1 - (H * (i + 0.5)) / rows]));
  }
  return out;
}
// Pendants: in a row 70 cm apart along the long side, around c.
export function pendantLayout(
  P: Outline,
  n: number,
  c: Point = center(P),
  u: Vector | null = null,
  gap = 0.7,
): Point[] {
  const b = bbox(P);
  u ??= b.x1 - b.x0 >= b.y1 - b.y0 ? [1, 0] : [0, 1];
  return Array.from({length: Math.max(1, n)}, (_, j) =>
    inside(P, [c[0] + u[0] * (j - (n - 1) / 2) * gap, c[1] + u[1] * (j - (n - 1) / 2) * gap]),
  );
}
// Ceiling line: along the long side, across, or as a frame 60 cm from the walls. The straight line goes through a point inside the room
// (center) to the nearest walls on both sides, so in an L-shaped room it stays in its own part instead of passing through a wall.
export function lineLayout(P: Outline, preset = 'along'): Segment[] {
  const b = bbox(P);
  const W = b.x1 - b.x0;
  const H = b.y1 - b.y0;
  const e = Math.min(0.6, Math.min(W, H) / 4);
  if (preset === 'frame') {
    const ring = offset(P, -e);
    return ring.map((a, i): Segment => [P3(a), P3(ring[(i + 1) % ring.length])]);
  }
  const u: Vector = (preset === 'across') !== W >= H ? [1, 0] : [0, 1];
  const c = center(P);
  const [lo, hi] = span(P, c, u);
  if (!isFinite(lo) || !isFinite(hi)) return [];
  const m = Math.min(e, (hi - lo) / 4);
  const at = (t: number): Point => P3([c[0] + u[0] * t, c[1] + u[1] * t]);
  return [[at(lo + m), at(hi - m)]];
}
// Line c + t·u: up to the nearest walls on both sides of c, [lo, hi].
function span(P: Outline, c: Point, u: Vector): Interval {
  let lo = -Infinity;
  let hi = Infinity;
  for (let i = 0; i < P.length; i++) {
    const a = P[i];
    const q = P[(i + 1) % P.length];
    const d = [q[0] - a[0], q[1] - a[1]];
    const den = u[0] * d[1] - u[1] * d[0];
    if (Math.abs(den) < 1e-9) continue;
    const w = [a[0] - c[0], a[1] - c[1]];
    const t = (w[0] * d[1] - w[1] * d[0]) / den;
    const s = (w[0] * u[1] - w[1] * u[0]) / den;
    if (s < -1e-9 || s > 1 + 1e-9) continue;
    if (t > 1e-9) hi = Math.min(hi, t);
    else if (t < -1e-9) lo = Math.max(lo, t);
  }
  return [lo, hi];
}
// Several ceiling lights on one light: evenly along the long side through the center, each in the middle of its share.
export function ceilingLayout(P: Outline, n = 1): Point[] {
  const c = center(P);
  if (n <= 1) return [c];
  const b = bbox(P);
  const u: Vector = b.x1 - b.x0 >= b.y1 - b.y0 ? [1, 0] : [0, 1];
  const [lo, hi] = span(P, c, u);
  if (!isFinite(lo) || !isFinite(hi)) return Array.from({length: n}, () => c);
  return Array.from({length: n}, (_, j) => {
    const t = lo + ((hi - lo) * (j + 0.5)) / n;
    return inside(P, [c[0] + u[0] * t, c[1] + u[1] * t]);
  });
}
// ---------- strip ----------
// A strip is a continuous line along its cell's contour (walls offset inwards by the wall thickness plus 3 cm): it turns at corners and
// protrusions without breaks. Where it is: contour runs (runs: [s0, s1] in meters from the contour start, s1 may
// wrap past the end) or the whole contour (closed). Only how to draw and light it is stored: L.segments (one segment per
// contour side); runs are derived from them every time. Breaks come by themselves: the boundary between room parts always, doors for a floor strip
// (the strip runs up to the door frame and continues after the door); a ceiling strip runs above the door.
const SK = WALL.inner + 0.03;
const MERGE = 0.25;
const MIN_RUN = 0.15;
const dedupe = (P: Outline): Outline =>
  P.filter((v, i, a) => {
    const w = a[(i + 1) % a.length];
    return Math.hypot(w[0] - v[0], w[1] - v[1]) > 1e-6;
  });
export function stripContour(
  plan: Pick<Plan, 'rooms' | 'openings'>,
  cell: LampCell,
  opt: string | undefined,
): Contour {
  const P = dedupe(cell.poly);
  const n = P.length;
  const C = offset(P, -SK);
  const S = [0];
  for (let i = 0; i < n; i++) S.push(S[i] + len(C[i], C[(i + 1) % n]));
  const per = S[n];
  const doors: Interval[] = [];
  const chords: Interval[] = [];
  const onCh = (q: Point): boolean | null => cell.ch && segDist(q, cell.ch[0], cell.ch[1])[0] < 1e-3;
  // the wall between rooms was removed (kitchen-living room, open passage): the strip has nothing to hold on to, same as at a zone boundary
  const R = cell.room?.polygon || [];
  const wt = cell.room?.wt || [];
  const open = (a: Point, b: Point): boolean =>
    R.some(
      (p, j) =>
        (wt[j] === 0 || (cell.room?.rail?.[j] ?? 0) > 0) &&
        segDist(a, p, R[(j + 1) % R.length])[0] < 1e-3 &&
        segDist(b, p, R[(j + 1) % R.length])[0] < 1e-3,
    );
  for (let i = 0; i < n; i++) {
    const a = P[i];
    const b = P[(i + 1) % n];
    const c0 = C[i];
    const c1 = C[(i + 1) % n];
    const l = S[i + 1] - S[i];
    if (l < 1e-6) continue;
    if ((onCh(a) && onCh(b)) || open(a, b)) {
      chords.push([S[i], S[i + 1]]);
      continue;
    }
    const u: Vector = [(c1[0] - c0[0]) / l, (c1[1] - c0[1]) / l];
    const t = (q: Point): number => (q[0] - c0[0]) * u[0] + (q[1] - c0[1]) * u[1];
    for (const o of plan.openings) {
      if (o.kind !== 'door') continue;
      const c = openingCoords(plan.rooms, o);
      if (!c) continue;
      if (segDist(c.a, a, b)[0] > 0.2 || segDist(c.b, a, b)[0] > 0.2) continue;
      const t0 = Math.max(0, Math.min(t(c.a), t(c.b)) - 0.05);
      const t1 = Math.min(l, Math.max(t(c.a), t(c.b)) + 0.05);
      if (t1 > t0) doors.push([S[i] + t0, S[i] + t1]);
    }
  }
  // gaps: where a strip of this kind does not run by itself (they also do not split it into runs); at the ceiling a door is not a break: a split above a door is its own
  return {P, C, S, n, per, gaps: opt === 'floor' ? [...chords, ...doors] : chords};
}
const lap = (K: Contour, g: Interval): Interval[] => [
  g,
  [g[0] + K.per, g[1] + K.per],
  [g[0] - K.per, g[1] - K.per],
];
const covered = (K: Contour, list: Interval[], a: number, b: number): boolean =>
  list.flatMap(g => lap(K, g)).some(g => g[0] <= a + 0.02 && g[1] >= b - 0.02);
export function stripAt(K: Contour, s: number): Point {
  s = ((s % K.per) + K.per) % K.per;
  let i = 0;
  while (i < K.n - 1 && s >= K.S[i + 1]) i++;
  const a = K.C[i];
  const b = K.C[(i + 1) % K.n];
  const l = K.S[i + 1] - K.S[i];
  const t = l ? (s - K.S[i]) / l : 0;
  return P3([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
}
const edgeS = (K: Contour, i: number, p: Point): {s: number; d: number} => {
  const a = K.C[i];
  const b = K.C[(i + 1) % K.n];
  const l = K.S[i + 1] - K.S[i];
  if (l < 1e-9) return {s: K.S[i], d: len(a, p)};
  const t = Math.max(0, Math.min(l, ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / l));
  return {s: K.S[i] + t, d: len(p, [a[0] + ((b[0] - a[0]) * t) / l, a[1] + ((b[1] - a[1]) * t) / l])};
};
// the contour point nearest to p: s and distance (and the side i); null only for a contour without sides
export function stripProject(K: Contour, p: Point): {s: number; d: number; i: number} | null {
  let best: {s: number; d: number; i: number} | null = null;
  for (let i = 0; i < K.n; i++) {
    const r = edgeS(K, i, p);
    if (!best || r.d < best.d) best = {...r, i};
  }
  return best;
}
// strip runs from its segments: neighbors form one run if they are less than 25 cm apart or separated by a door or a part boundary
// (A strip's contour has sides: stripProject! finds a point on it, here and in stripOnEdge.)
export function stripRuns(K: Contour, segs: Segment[]): StripRuns {
  const iv: Interval[] = [];
  for (const [a, b] of segs) {
    const {i} = stripProject(K, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2])!;
    const sa = edgeS(K, i, a).s;
    const sb = edgeS(K, i, b).s;
    if (Math.abs(sb - sa) > 1e-3) iv.push([Math.min(sa, sb), Math.max(sa, sb)]);
  }
  iv.sort((x, y) => x[0] - y[0]);
  const joins = (e: number, b: number): boolean => b - e <= MERGE || covered(K, K.gaps, e, b);
  const runs: Interval[] = [];
  for (const x of iv) {
    const r = runs[runs.length - 1];
    if (r && joins(r[1], x[0])) r[1] = Math.max(r[1], x[1]);
    else runs.push([...x]);
  }
  if (!runs.length) return {runs, closed: false};
  if (runs.length > 1 && joins(runs[runs.length - 1][1], runs[0][0] + K.per)) {
    const f = runs.shift()!; // there are two runs or more
    runs[runs.length - 1][1] = f[1] + K.per;
  }
  const r = runs[0];
  if (runs.length === 1 && (r[1] - r[0] >= K.per - MERGE || joins(r[1], r[0] + K.per)))
    return {runs: [], closed: true};
  return {runs: norm(K, runs), closed: false};
}
const norm = (K: Contour, rs: Interval[]): Interval[] =>
  rs
    .map(([a, b]): Interval => {
      const k = Math.floor(a / K.per) * K.per;
      return [a - k, b - k];
    })
    .sort((x, y) => x[0] - y[0]);
// strip segments: runs minus breaks, one segment per contour side
export function stripSegs(K: Contour, st: StripRuns): Segment[] {
  const out: Segment[] = [];
  const gs = K.gaps.flatMap(g => lap(K, g));
  for (const [r0, r1] of st.closed ? [[0, K.per]] : st.runs) {
    let ps: Interval[] = [[r0, r1]];
    for (const g of gs)
      ps = ps.flatMap(([a, b]): Interval[] =>
        g[1] <= a || g[0] >= b
          ? [[a, b]]
          : (
              [
                [a, g[0]],
                [g[1], b],
              ] satisfies Interval[]
            ).filter(([x, y]) => y - x > 0.05),
      );
    for (const [a, b] of ps) {
      let x = a;
      while (x < b - 1e-6) {
        const k = Math.floor(x / K.per + 1e-9);
        const loc = x - k * K.per;
        let i = 0;
        while (i < K.n - 1 && loc >= K.S[i + 1] - 1e-9) i++;
        const e = Math.min(b, k * K.per + K.S[i + 1]);
        if (e - x > 0.02) out.push([stripAt(K, x), stripAt(K, e)]);
        x = e;
      }
    }
  }
  return out;
}
// click on a strip: a 50 cm break centered at s (pieces shorter than 15 cm go away; the strip never ends up empty)
export function stripCut(K: Contour, st: StripRuns, s: number, g = 0.5): StripRuns {
  if (st.closed) return {runs: norm(K, [[s + g / 2, s - g / 2 + K.per]]), closed: false};
  for (let i = 0; i < st.runs.length; i++) {
    const [a, b] = st.runs[i];
    const x = [s, s + K.per, s - K.per].find(x => x > a && x < b);
    if (x == null) continue;
    const parts = (
      [
        [a, x - g / 2],
        [x + g / 2, b],
      ] satisfies Interval[]
    ).filter(([p, q]) => q - p >= MIN_RUN);
    const runs = [...st.runs.slice(0, i), ...parts, ...st.runs.slice(i + 1)];
    return runs.length ? {runs: norm(K, runs), closed: false} : st;
  }
  return st;
}
// click on a break between runs: the neighbors merge; a single run becomes a strip along the whole contour
export function stripFill(K: Contour, st: StripRuns, s: number): StripRuns {
  const rs = st.runs;
  if (st.closed || !rs.length) return st;
  for (let i = 0; i < rs.length; i++) {
    const e = rs[i][1];
    const nx = i < rs.length - 1 ? rs[i + 1][0] : rs[0][0] + K.per;
    if (![s, s + K.per, s + 2 * K.per, s - K.per].some(x => x >= e - 1e-6 && x <= nx + 1e-6)) continue;
    if (rs.length === 1) return {runs: [], closed: true};
    const runs = rs.map((r): Interval => [...r]);
    if (i < rs.length - 1) {
      runs[i][1] = runs[i + 1][1];
      runs.splice(i + 1, 1);
    } else {
      runs[i][1] = runs[0][1] + K.per;
      runs.shift();
    }
    return {runs: norm(K, runs), closed: false};
  }
  return st;
}
// dragging a run's end: it slides along the contour and wraps around corners; no shorter than 15 cm and no further than the neighboring run
// end: 1 the run's end, 0 its start
export function stripMove(K: Contour, st: StripRuns, i: number, end: number, x: number): StripRuns {
  const rs = st.runs.map((r): Interval => [...r]);
  const r = rs[i];
  const n = rs.length;
  if (end) {
    const hi = i < n - 1 ? rs[i + 1][0] : rs[0][0] + K.per;
    r[1] = Math.max(r[0] + MIN_RUN, Math.min(hi, x));
  } else {
    const lo = i > 0 ? rs[i - 1][1] : rs[n - 1][1] - K.per;
    r[0] = Math.min(r[1] - MIN_RUN, Math.max(lo, x));
  }
  return {runs: rs, closed: false};
}
// where an end snaps: corners and break edges
export const stripSnaps = (K: Contour): number[] => [...K.S.slice(0, K.n), ...K.gaps.flat()];
// default strip: along the whole contour; for “curtains”, along the walls with windows
export function stripLayout(
  plan: Pick<Plan, 'rooms' | 'openings'>,
  cell: LampCell,
  opt: string | undefined,
  name = '',
): Segment[] {
  const Q = stripContour(plan, cell, opt);
  if (Q.n < 3 || Q.per < 0.3) return [];
  const runs: Interval[] = [];
  if (K.win.test(name))
    for (let i = 0; i < Q.n; i++) {
      if (hasWindow(plan, {a: Q.P[i], b: Q.P[(i + 1) % Q.n]})) runs.push([Q.S[i], Q.S[i + 1]]);
    }
  // the rest: on one wall, the longest (for a floor strip, without doors); the user stretches it further themselves (the owner)
  if (!runs.length) {
    const gs = Q.gaps.flatMap(g => lap(Q, g));
    const use = (i: number): number => {
      let l = Q.S[i + 1] - Q.S[i];
      for (const g of gs) l -= Math.max(0, Math.min(Q.S[i + 1], g[1]) - Math.max(Q.S[i], g[0]));
      return l;
    };
    let best = 0;
    for (let i = 1; i < Q.n; i++) if (use(i) > use(best) + 1e-6) best = i;
    runs.push([Q.S[best], Q.S[best + 1]]);
  }
  return stripSegs(Q, stripRuns(Q, stripSegs(Q, {runs, closed: false})));
}
// a strip dragged from the list onto a wall: only that side of the contour
export function stripOnEdge(
  plan: Pick<Plan, 'rooms' | 'openings'>,
  cell: LampCell,
  opt: string | undefined,
  p: Point,
): Segment[] {
  const K = stripContour(plan, cell, opt);
  const {i} = stripProject(K, p)!;
  return stripSegs(K, {runs: [[K.S[i], K.S[i + 1]]], closed: false});
}
// ---------- strip on furniture ----------
// A strip is not always on a wall; it can be on furniture (the owner: “it runs along the floor under the kitchen units”): the kitchen toe kick, the bottom of the wall cabinets,
// under the bed. These are separate strip variants (L.opt) next to “Ceiling” and “Floor”, available when such furniture stands in this part
// of the room. Segments are derived from the furniture every time: furniture moved, the strip follows; removed, the strip goes back to the wall (back).
export const FURN_STRIP: Record<string, FurnStripKind> = {
  plinth: {
    name: t('Toe kick'),
    tip: t('Along the kitchen toe kick — light onto the floor'),
    where: t('toe kick'),
    models: ['kitchenBase', 'kitchenSink', 'kitchenHob', 'dishwasher', 'kitchenCorner', 'kitchenTall'],
    back: 'floor',
  },
  under: {
    name: t('Under cabinets'),
    tip: t('Under the kitchen wall cabinets — light onto the countertop'),
    where: t('under cabinets'),
    models: ['kitchenWall'],
    back: 'top',
  },
  bed: {
    name: t('Under bed'),
    tip: t('Along the bed base — light onto the floor'),
    where: t('under bed'),
    models: ['bed', 'bedDouble', 'bedSingle'],
    back: 'floor',
  },
};
/** A strip variant (L.opt) is one on furniture: a key of FURN_STRIP. */
export const isFurnStrip = (opt: string | null | undefined): opt is string => ownKey(FURN_STRIP, opt);
// where the strip is on an item: segments in its axes (x along the width, z towards the front) and height
// (… as Segment below: a segment mapped point by point is still its two ends)
const FURN_AT: Record<string, (f: FurnitureItem) => {h: number; segs: Segment[]}> = {
  plinth: f => {
    const mx = f.mx ? -1 : 1; // under the fronts, in front of the recessed toe kick; for a corner unit, along both arms inside the corner
    if (f.model !== 'kitchenCorner')
      return {
        h: 0.04,
        segs: [
          [
            [-f.w / 2 + 0.02, f.d / 2 - 0.08],
            [f.w / 2 - 0.02, f.d / 2 - 0.08],
          ],
        ],
      };
    const {back, side} = lArms(f)!; // a corner unit is L-shaped
    const x = -f.w / 2 + side - 0.08;
    const z = -f.d / 2 + back - 0.08;
    const p: Point[] = [
      [f.w / 2 - 0.02, z],
      [x, z],
      [x, f.d / 2 - 0.02],
    ];
    return {
      h: 0.04,
      segs: [
        [p[0], p[1]],
        [p[1], p[2]],
      ].map(sg => sg.map(([a, b]): Point => [a * mx, b]) as Segment),
    };
  },
  under: f => ({
    h: zOf(f) - 0.01,
    segs: [
      [
        [-f.w / 2 + 0.02, f.d / 2 - 0.06],
        [f.w / 2 - 0.02, f.d / 2 - 0.06],
      ],
    ],
  }),
  bed: f => {
    const k = 0.06;
    const p: Point[] = [
      [-f.w / 2 + k, -f.d / 2 + 0.25],
      [-f.w / 2 + k, f.d / 2 - k],
      [f.w / 2 - k, f.d / 2 - k],
      [f.w / 2 - k, -f.d / 2 + 0.25],
    ];
    return {h: 0.08, segs: p.slice(1).map((q, i): Segment => [p[i], q])};
  }, // sides and foot
};
export const furnOf = (
  plan: Pick<Plan, 'furniture'>,
  cell: Pick<LampCell, 'poly'>,
  opt: string,
): FurnitureItem[] => {
  if (!isFurnStrip(opt)) return [];
  const s = FURN_STRIP[opt];
  return (plan.furniture || []).filter(f => s.models.includes(f.model) && pointIn([f.x, f.y], cell.poly));
};
export const furnOpts = (plan: Pick<Plan, 'furniture'>, cell: Pick<LampCell, 'poly'>): string[] =>
  Object.keys(FURN_STRIP).filter(k => furnOf(plan, cell, k).length);
// for an item along walls (kitchen cabinets, runs.js) the strip runs along the front of each of its walls and turns the corner with it
const RUN_AT: Record<string, (f: FurnitureItem) => {h: number; k: number}> = {
  plinth: f => ({h: 0.04, k: 0.08}),
  under: f => ({h: zOf(f) - 0.01, k: 0.06}),
};
export function furnStrip(
  plan: Pick<Plan, 'rooms' | 'furniture'>,
  cell: Pick<LampCell, 'poly'>,
  opt: string,
): {h: number; segments: Segment[]} | null {
  const fs = furnOf(plan, cell, opt);
  if (!fs.length) return null;
  let h = 0;
  const segments = fs.flatMap((f): Segment[] => {
    if (isRun(f) && RUN_AT[opt]) {
      const g = runGeo(plan, f);
      if (!g) return [];
      const r = RUN_AT[opt](f);
      h = r.h;
      return runLines(g, f.d - r.k).map(sg => sg.map(P3) as Segment);
    }
    const [ax, fz] = axes(f);
    const r = FURN_AT[opt](f);
    h = r.h;
    return r.segs.map(
      sg => sg.map(([x, z]) => P3([f.x + ax[0] * x + fz[0] * z, f.y + ax[1] * x + fz[1] * z])) as Segment,
    );
  });
  return {h: R3(h), segments};
}
// by name: a “worktop light” in a kitchen with wall cabinets goes under them; a floor strip where there are base cabinets goes along the toe kick
// (the owner: “it runs along the floor under the kitchen units”); without such furniture, as before, on the wall
const KF: Record<string, RegExp> = {
  under: re(
    'столешниц|рабоч|под шкаф|верхн|worktop|counter|under ?cabinet|arbeitsplatte|unterbau|oberschrank|plan de travail|sous meuble|werkblad|onderbouw|encimera|bajo mueble|piano di lavoro|sottopensile|blat|pod szafk|bancada|sob armário|橱柜|台面',
  ),
  plinth: re('цокол|plinth|kick|toe|sockel|socle|plint|sokkel|zócalo|zoccolo|cokół|rodapé|踢脚'),
  bed: re('кроват|bed(?!room)|bett|lit|cama|letto|łóżk|床'),
};
export function furnGuess(
  plan: Pick<Plan, 'furniture'>,
  cell: Pick<LampCell, 'poly'>,
  L: Pick<PlanLight, 'name' | 'entity' | 'model'>,
  opt: string | undefined,
): string | null {
  const s = [L.name, L.entity, L.model].filter(Boolean).join(' ');
  const has = (k: string): boolean => furnOf(plan, cell, k).length > 0;
  return (
    Object.keys(KF).find(k => KF[k].test(s) && has(k)) || (opt === 'floor' && has('plinth') ? 'plinth' : null)
  );
}
// guess: guess the furniture (the light is just being placed); “Ceiling” or “Floor” chosen by the user: on the wall
function stripPlace(plan: LightPlan, L: PlanLight, cell: LampCell, guess = true): void {
  const fo = isFurnStrip(L.opt) ? L.opt : guess ? furnGuess(plan, cell, L, L.opt) : null;
  const fs = fo && furnStrip(plan, cell, fo);
  if (fs) {
    L.opt = fo;
    L.h = fs.h;
    L.segments = fs.segments;
  } else {
    if (isFurnStrip(L.opt)) L.opt = FURN_STRIP[L.opt].back;
    L.h = STRIP[L.opt ?? '']?.h ?? STRIP.top.h;
    L.segments = stripLayout(plan, cell, L.opt, L.name);
  }
  L.loop = 1;
}
// furniture moved, changed or removed: the strips on it follow. Returns whether anything changed.
export function syncFurnStrips(plan: LightPlan & Pick<Plan, 'lights'>): boolean {
  let ch = false;
  for (const L of plan.lights) {
    if (!L.placed || L.with || formFor(L) !== 'strip' || !isFurnStrip(L.opt)) continue;
    const r = plan.rooms.find(x => x.id === L.room);
    if (!r) continue;
    const c = lampCell(plan, L);
    const cell: LampCell = c && c.room === r ? c : {room: r, poly: r.polygon, ch: null};
    const was = JSON.stringify([L.opt, L.h, L.segments]);
    stripPlace(plan, L, cell, false);
    if (JSON.stringify([L.opt, L.h, L.segments]) !== was) ch = true;
  }
  return ch;
}
// Sconces: n of them on the wall at point p (if none, in the middle of the longest wall without a window), 1.6 m apart (a pair by the bed),
// closer together on a short wall.
export function wallLayout(plan: LightPlan, cell: LampCell, n = 1, p?: Point | null): Point[] {
  const es = cellEdges(cell);
  if (!es.length) return [center(cell.poly)];
  if (!p && n <= 2) {
    const bw = bedWall(plan, cell, n);
    if (bw) return bw;
  } // by a bed: at the headboard, on both sides
  // e and t are set below, by p or by the free walls (es is not empty, so the nearest wall best! is found)
  let e!: CellEdge;
  let t!: number;
  if (p) {
    let best: {d: number; e: CellEdge; t: number} | null = null;
    for (const x of es) {
      const [d, f] = segDist(p, x.a, x.b);
      if (!best || d < best.d) best = {d, e: x, t: f * x.l};
    }
    e = best!.e;
    t = best!.t;
  }
  // the longest stretch of a wall without a window, between its doors and openings (a sconce in the middle of the wall used to land inside
  // a 2.4 m opening); a wall with a window — only if there is no other
  let run: Interval | [number, null] = [0.15, null];
  if (!p) {
    const free = es.filter(x => !hasWindow(plan, x));
    const best = (free.length ? free : es)
      .map(x => ({x, r: freeRun(plan, x)}))
      .reduce((a, b) => (b.r[1] - b.r[0] > a.r[1] - a.r[0] ? b : a));
    e = best.x;
    run = best.r;
    t = (run[0] + run[1]) / 2;
  }
  const k = WALL.inner + 0.08;
  const r0 = run[0];
  const r1 = run[1] ?? e.l - 0.15;
  n = Math.max(1, Math.round(n));
  const gap = n > 1 ? Math.min(1.6, (r1 - r0) / (n - 1)) : 0;
  const half = (gap * (n - 1)) / 2;
  const m = Math.max(r0 + half, Math.min(r1 - half, t));
  return Array.from({length: n}, (_, j) => along(e, m - half + gap * j, k));
}
// The longest stretch [t0, t1] of edge e clear of the openings in it (15 cm around each) and of tall furniture against it at sconce
// height (a wardrobe, shelves, wall cabinets: a sconce landed inside a built-in wardrobe), 15 cm in from the corners.
function freeRun(plan: LightPlan, e: CellEdge): Interval {
  const pr = (q: Point): number => (q[0] - e.a[0]) * e.u[0] + (q[1] - e.a[1]) * e.u[1];
  let fr: Interval[] = [[0.15, e.l - 0.15]];
  const block = (b0: number, b1: number): void => {
    fr = fr.flatMap(([f0, f1]): Interval[] =>
      b1 <= f0 || b0 >= f1
        ? [[f0, f1]]
        : (
            [
              [f0, b0],
              [b1, f1],
            ] satisfies Interval[]
          ).filter(([x, y]) => y - x > 0.05),
    );
  };
  for (const o of plan.openings) {
    const c = openingCoords(plan.rooms, o);
    if (!c || segDist([(c.a[0] + c.b[0]) / 2, (c.a[1] + c.b[1]) / 2], e.a, e.b)[0] >= 0.45) continue;
    block(Math.min(pr(c.a), pr(c.b)) - 0.15, Math.max(pr(c.a), pr(c.b)) + 0.15);
  }
  for (const f of plan.furniture || []) {
    if (byId(f.model)?.soft) continue;
    const z = zOf(f);
    if (z > HEIGHTS.wall + 0.15 || z + f.h < HEIGHTS.wall - 0.15) continue;
    const pts = rectsOf(plan, f).flat();
    if (
      !pts.some(q => {
        const d = (q[0] - e.a[0]) * e.n[0] + (q[1] - e.a[1]) * e.n[1];
        return d > -0.05 && d < 0.4;
      })
    )
      continue;
    const ts = pts.map(pr);
    block(Math.min(...ts) - 0.1, Math.max(...ts) + 0.1);
  }
  return fr.length ? fr.reduce((a, b) => (b[1] - b[0] > a[1] - a[0] ? b : a)) : [e.l / 2, e.l / 2];
}
// A sconce being dragged goes to the nearest wall of the room.
export function snapWall(P: Outline, p: Point): Point {
  const s = area(P) > 0 ? 1 : -1;
  let best: {d: number; e: CellEdge; t: number} | null = null;
  for (let i = 0; i < P.length; i++) {
    const a = P[i];
    const b = P[(i + 1) % P.length];
    const l = len(a, b);
    if (l < 0.3) continue;
    const [d, f] = segDist(p, a, b);
    if (best && d >= best.d) continue;
    const u: Vector = [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
    best = {d, e: {a, b, l, u, n: [-u[1] * s, u[0] * s]}, t: Math.max(0.15, Math.min(l - 0.15, f * l))};
  }
  return best ? along(best.e, best.t, WALL.inner + 0.08) : P3(p);
}
// Floor lamp: in a corner 45 cm from the walls, away from doors.
// Corners and the middles of the walls 45 cm in, not inside furniture (the owner's check of ten homes: a floor lamp landed inside a sofa).
export function lampSpot(plan: LightPlan, cell: LampCell): Point {
  const ring = offset(cell.poly, -0.45).filter(p => pointIn(p, cell.poly));
  if (!ring.length) return center(cell.poly);
  const doors = plan.openings
    .map(o => o.kind === 'door' && openingCoords(plan.rooms, o))
    .filter((o): o is Opening & {a: Point; b: Point} => Boolean(o))
    .map((o): Point => [(o.a[0] + o.b[0]) / 2, (o.a[1] + o.b[1]) / 2]);
  const score = (p: Point): number => (doors.length ? Math.min(...doors.map(d => len(d, p))) : 0);
  const busy = (plan.furniture || [])
    .filter(f => !byId(f.model)?.soft && zOf(f) < 1.2)
    .flatMap(f => rectsOf(plan, f).map(q => offset(q, 0.12)));
  const all = [
    ...ring,
    ...ring.map((p, i): Point => {
      const q = ring[(i + 1) % ring.length];
      return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    }),
  ].filter(p => pointIn(p, cell.poly));
  const free = all.filter(p => !busy.some(q => pointIn(p, q)));
  const pool = free.length ? free : ring;
  return P3(pool.reduce((a, b) => (score(b) > score(a) + 1e-6 ? b : a)));
}

// ---------- lighting that accounts for furniture (the owner: “when we position lights, take furniture into account too”) ----------
// The cell's furniture: what stands in it (center inside; an item along walls belongs to its room) and its rectangles on the plan.
const TABLES = ['diningTable', 'tableRound', 'tableExt', 'kitchenIsland', 'patioTable'];
const BEDS = ['bed', 'bedDouble', 'bedSingle', 'sofaBed'];
const SEATS = ['loungeSofa', 'sofaCorner', 'sofaBed', 'sofaU', 'loungeChair', 'recliner'];
const rectsOf = (plan: Pick<Plan, 'rooms'>, f: FurnitureItem): Outline[] =>
  isRun(f) ? (runGeo(plan, f)?.sides || []).map(x => x.quad) : footRects(f);
const furnIn = (
  plan: Pick<Plan, 'furniture'>,
  cell: Pick<LampCell, 'room' | 'poly'>,
  pick: (f: FurnitureItem) => boolean,
): FurnitureItem[] =>
  (plan.furniture || []).filter(
    f => pick(f) && (isRun(f) ? f.room === cell.room.id : pointIn([f.x, f.y], cell.poly)),
  );
// (k is never passed)
const biggest = (fs: FurnitureItem[], k?: unknown): FurnitureItem | null =>
  fs.reduce<FurnitureItem | null>((a, b) => (!a || b.w * b.d > a.w * a.d ? b : a), null);
// Free ceiling: the cell without tall furniture (wardrobes, wall cabinets, fridge, tall unit: above 1.75 m). Ceiling lights, spots
// and lines go above it: no light is needed above a wardrobe. If less than a third is free, as before, over the whole cell.
export function freeCeiling(plan: LightPlan, cell: LampCell): Outline {
  const tall = furnIn(plan, cell, f => !byId(f.model)?.soft && zOf(f) + f.h >= 1.75);
  if (!tall.length) return cell.poly;
  try {
    const rest = pc.difference(poly(cell.poly), ...tall.flatMap(f => rectsOf(plan, f)).map(q => poly(q)));
    const best = rest
      .map((P): Outline => P[0].slice(0, -1))
      .reduce<Outline | null>((a, b) => (Math.abs(area(b)) > Math.abs(area(a || [])) ? b : a), null);
    return best && Math.abs(area(best)) >= Math.abs(area(cell.poly)) / 3 ? best : cell.poly;
  } catch {
    return cell.poly;
  }
}
// The cell's table (dining, round, extendable, island): center, long axis, length; pendants and ceiling lights go above it.
export function tableOf(plan: LightPlan, cell: LampCell): LightTable | null {
  const f = biggest(furnIn(plan, cell, f => TABLES.includes(f.model)));
  if (!f) return null;
  const [ax, fz] = axes(f);
  return {c: [f.x, f.y], u: f.w >= f.d ? ax : fz, len: Math.max(f.w, f.d), f};
}
// Sconces by a bed: on the wall behind the headboard, on both sides of the bed (a single one on the left). No bed: null.
function bedWall(plan: LightPlan, cell: LampCell, n: number): Point[] | null {
  const f = biggest(furnIn(plan, cell, f => BEDS.includes(f.model)));
  if (!f) return null;
  const es = cellEdges(cell);
  if (!es.length) return null;
  const [ax, fz] = axes(f);
  const back: Point = [f.x - (fz[0] * f.d) / 2, f.y - (fz[1] * f.d) / 2];
  let best: {d: number; e: CellEdge; t: number} | null = null;
  for (const e of es) {
    const [d, t] = segDist(back, e.a, e.b);
    if (!best || d < best.d) best = {d, e, t: t * e.l};
  }
  if (best!.d > 0.6) return null; // es is not empty: best! is found
  const {e} = best!;
  const side = f.w / 2 + 0.25;
  const proj = (q: Point): number => (q[0] - e.a[0]) * e.u[0] + (q[1] - e.a[1]) * e.u[1];
  const sa = proj([back[0] - ax[0] * side, back[1] - ax[1] * side]);
  const sb = proj([back[0] + ax[0] * side, back[1] + ax[1] * side]);
  const k = WALL.inner + 0.08;
  const cl = (x: number): number => Math.max(0.15, Math.min(e.l - 0.15, x));
  return (n >= 2 ? [sa, sb] : [sa]).map(x => along(e, cl(x), k));
}
// A table lamp on furniture: by a bed — a nightstand, at a desk — the desk, else a side table, dresser or console. The light's point is
// the bulb: the lamp's base stands on the top (scene.js draws the base 42 cm below it). None of these: null.
const STANDS = [
  'nightstand',
  'sideTable',
  'desk',
  'deskCorner',
  'deskStanding',
  'dresser',
  'dressingTable',
  'console',
];
function standSpot(
  plan: LightPlan,
  cell: LampCell,
  L: Pick<PlanLight, 'name' | 'entity'>,
): {p: Point; h: number} | null {
  const s = [L.name, L.entity].filter(Boolean).join(' ');
  const fs = furnIn(plan, cell, f => STANDS.includes(f.model));
  if (!fs.length) return null;
  const first = KF.bed.test(s)
    ? ['nightstand']
    : K.desk.test(s)
      ? ['desk', 'deskCorner', 'deskStanding']
      : [];
  const rank = (f: FurnitureItem): number => (first.includes(f.model) ? 0 : 10) + STANDS.indexOf(f.model);
  const f = fs.reduce((a, b) => (rank(b) < rank(a) ? b : a));
  const [ax, fz] = axes(f);
  const small = f.w <= 0.7;
  const dx = small ? 0 : f.w / 2 - 0.2;
  const dz = small ? 0 : f.d / 2 - 0.15;
  return {p: P3([f.x - ax[0] * dx - fz[0] * dz, f.y - ax[1] * dx - fz[1] * dz]), h: R3(zOf(f) + f.h + 0.42)};
}
// A mirror light: on the wall above a mirror or mirror cabinet, else above a washbasin or sink cabinet. None: null.
const MIRRORS = ['wallMirror', 'mirrorCabinet', 'vanity', 'basin', 'dressingTable'];
function mirrorSpot(plan: LightPlan, cell: LampCell): {p: Point; h: number} | null {
  const fs = furnIn(plan, cell, f => MIRRORS.includes(f.model));
  if (!fs.length) return null;
  const f = fs.reduce((a, b) => (MIRRORS.indexOf(b.model) < MIRRORS.indexOf(a.model) ? b : a));
  const [, fz] = axes(f);
  const hung = f.model === 'wallMirror' || f.model === 'mirrorCabinet';
  return {
    p: [f.x - (fz[0] * f.d) / 2, f.y - (fz[1] * f.d) / 2],
    h: R3(Math.min(2.35, hung ? zOf(f) + f.h + 0.08 : 1.95)),
  };
}
// Floor lamp by a sofa or armchair: to the side, closer to the back, in a free spot inside the cell. No such furniture: null.
function seatSpot(plan: LightPlan, cell: LampCell): Point | null {
  const f = biggest(furnIn(plan, cell, f => SEATS.includes(f.model)));
  if (!f) return null;
  const [ax, fz] = axes(f);
  const others = (plan.furniture || [])
    .filter(g => g !== f && !byId(g.model)?.soft && zOf(g) < 1.2)
    .flatMap(g => rectsOf(plan, g));
  for (const s of [1, -1]) {
    const p: Point = [
      f.x + ax[0] * s * (f.w / 2 + 0.28) - fz[0] * (f.d / 2 - 0.25),
      f.y + ax[1] * s * (f.w / 2 + 0.28) - fz[1] * (f.d / 2 - 0.25),
    ];
    if (pointIn(p, offset(cell.poly, -0.2)) && !others.some(q => pointIn(p, q))) return P3(p);
  }
  return null;
}

// Place a light of form form (variant opt) in cell cell, right away, the usual way; the user adjusts it afterwards.
export function placeForm(
  plan: LightPlan,
  L: PlanLight,
  form: LightForm,
  opt: string | null | undefined,
  cell: LampCell,
): boolean {
  const P = cell.poly;
  const F = freeCeiling(plan, cell);
  const tb = tableOf(plan, cell);
  L.points = [];
  L.segments = [];
  L.form = form;
  L.kind = lineForm(form) ? 'strip' : 'point';
  L.opt = opt ?? OPT[form];
  delete L.count;
  // ceiling light and pendant: above the table if there is one; otherwise above the free part of the ceiling (not above a wardrobe)
  if (form === 'ceiling') {
    L.h = HEIGHTS.ceiling;
    L.count = 1;
    L.points = tb ? [P3(tb.c)] : ceilingLayout(F, 1);
  } else if (form === 'pendant') {
    L.h = HEIGHTS.pendant;
    L.count = 1;
    L.points = tb ? [P3(tb.c)] : pendantLayout(F, 1);
  } else if (form === 'spots') {
    L.h = HEIGHTS.spots;
    L.count = defaultSpots(F);
    L.points = spotsLayout(F, L.count, L.opt);
  } else if (form === 'line') {
    L.h = HEIGHTS.line;
    L.segments = lineLayout(F, L.opt);
  } else if (form === 'strip')
    stripPlace(plan, L, cell); // on furniture if the name suggests it and the furniture is there
  else if (form === 'wall') {
    L.h = HEIGHTS.wall;
    L.count = L.opt === 'pair' ? 2 : 1;
    delete L.opt; // a “pair” guess means two
    const m =
      L.count === 1 && K.mirror.test([L.name, L.entity].filter(Boolean).join(' ')) && mirrorSpot(plan, cell);
    if (m) {
      L.h = m.h;
      L.points = wallLayout(plan, cell, 1, m.p);
    } else L.points = wallLayout(plan, cell, L.count);
  } else if (form === 'lamp') {
    L.h = LAMP[L.opt ?? '']?.h ?? LAMP.floor.h;
    const st = L.opt === 'table' && standSpot(plan, cell, L);
    if (st) {
      L.h = st.h;
      L.points = [st.p];
    } else L.points = [seatSpot(plan, cell) || lampSpot(plan, cell)];
  }
  delete L.skip;
  delete L.with;
  L.room = cell.room.id;
  L.placed = L.points.length + L.segments.length > 0;
  return L.placed;
}
// The count or variant of a placed light changed: reposition it without touching the rest. was is the previous variant (for a strip).
export function relayout(plan: LightPlan, L: PlanLight, cell: LampCell, was?: string): void {
  const P = cell.poly;
  const f = formFor(L);
  const F = freeCeiling(plan, cell);
  if (f === 'ceiling') {
    const n = L.count || L.points.length || 1;
    const tb = n === 1 && tableOf(plan, cell);
    L.points = tb ? [P3(tb.c)] : ceilingLayout(F, n);
  }
  if (f === 'spots')
    L.points = spotsLayout(F, L.count || L.points.length || 1, L.opt === 'free' ? 'grid' : L.opt);
  else if (f === 'pendant') {
    const c = L.points.length
      ? L.points.reduce<Point>(
          (s, q) => [s[0] + q[0] / L.points.length, s[1] + q[1] / L.points.length],
          [0, 0],
        )
      : center(F);
    const n = L.count || 1;
    // pendants above a table: in a row along its long side, evenly over its length (no wider than the table); otherwise 70 cm apart along the room
    const tb = tableOf(plan, cell);
    const over = tb && rectsOf(plan, tb.f).some(q => pointIn(c, q));
    L.points = over
      ? pendantLayout(P, n, tb.c, tb.u, n > 1 ? Math.min(0.7, (tb.len - 0.3) / (n - 1)) : 0)
      : pendantLayout(F, n, c);
  } else if (f === 'line') L.segments = lineLayout(F, L.opt);
  else if (f === 'strip' && (isFurnStrip(L.opt) || isFurnStrip(was)))
    stripPlace(plan, L, cell, false); // onto furniture or from furniture back to the wall: place again
  else if (f === 'strip') {
    L.h = STRIP[L.opt ?? '']?.h ?? L.h; // floor strip: breaks at doors; ceiling strip: continuous above a door
    // runs follow the previous kind (at the floor doors do not split the strip), segments the new one
    const was = stripContour(plan, cell, L.opt === 'floor' ? 'top' : 'floor');
    const K = stripContour(plan, cell, L.opt);
    L.segments = stripSegs(K, stripRuns(was, L.segments));
    L.loop = 1;
  } else if (f === 'wall')
    L.points = wallLayout(
      plan,
      cell,
      L.count || L.points.length || 1,
      L.points.length
        ? L.points.reduce<Point>(
            (s, q) => [s[0] + q[0] / L.points.length, s[1] + q[1] / L.points.length],
            [0, 0],
          )
        : null,
    );
  else if (f === 'lamp') L.h = LAMP[L.opt ?? '']?.h ?? L.h;
}
// “Auto-place”: lights without a position go by guess, each into the cell of its own area. Returns how many were placed.
export function autoPlace(plan: LightPlan & Pick<Plan, 'lights'>): number {
  let n = 0;
  for (const L of plan.lights) {
    if (L.placed || L.skip) continue;
    const cell = lampCell(plan, L);
    if (!cell) continue;
    const g = guessForm(L);
    if (placeForm(plan, L, g.form, g.opt, cell)) {
      L.auto = true;
      n++;
    }
  }
  return n;
}
