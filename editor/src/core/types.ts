// The data shapes the modules hand to each other (D-087): small geometry, the plan file, what the plan's geometry gives back,
// Home Assistant's data as the editor reads it, and the UI's saved state. Types only: nothing here runs.
//
// Units: lengths and positions are metres on the plan (x is east, y is north), heights are metres above the floor, angles are
// degrees unless a name says radians. A value from outside (a plan file, localStorage, Home Assistant) is checked before it
// gets one of these types (plan-file.ts checks a plan file).
import type {MultiPolygon as ClipMultiPolygon, Polygon as ClipPolygonType} from 'polygon-clipping';

// ---------- small geometry ----------

/** A point on the plan: [x, y], metres; x is east, y is north. */
export type Point = [number, number];

/** A direction or an offset on the plan: [x, y]; a normal or a unit vector has length 1. */
export type Vector = [number, number];

/** A straight piece between two points. */
export type Segment = [Point, Point];

/** A shape's corners in order, not closed (the first corner is not repeated at the end). A room's outline runs counterclockwise. */
export type Outline = Point[];

/** polygon-clipping's polygon: closed rings (the first point repeated at the end), the outer ring first, then its holes. */
export type ClipPolygon = ClipPolygonType;

/** polygon-clipping's result: separate polygons, each an outer ring and its holes, closed. */
export type MultiPolygon = ClipMultiPolygon;

/** A solid on the plan for the 3D view: a shape raised from `bottom` to `top` (metres above the floor). */
export interface Prism {
  mp: MultiPolygon;
  bottom: number;
  top: number;
}

// ---------- the plan file: rooms and openings ----------

/** A finish on one edge of a room (room.wf[i]): a wall finish key (surfaces.ts WALL_KINDS) and an optional '#rrggbb' tint. */
export interface EdgeFinish {
  k: string;
  tint?: string | null;
}

/**
 * A piece of finish on a wall (room.wp[i][j], pieces.ts, D-084): part of one edge finished differently, later pieces on top.
 * Set by the AI build; by hand a finish covers a whole wall. A bad value inside one is skipped when drawn.
 */
export interface WallPiece {
  /** [from, to]: fractions of the edge from its start corner; none: all of it. */
  t?: [number, number];
  /** [bottom, top]: metres above the floor; none: floor to ceiling. */
  z?: [number, number];
  /** A wall finish key (surfaces.ts WALL_KINDS). */
  k: string;
  /** '#rrggbb' instead of the finish's own colour. */
  tint?: string;
  /** The tile, brick, slat or panel: [width, height], metres. */
  tile?: [number, number];
  /** The joint between tiles, metres. */
  joint?: number;
}

/** A piece of the floor finished differently (room.fp[j], pieces.ts, D-084), drawn only inside the room, later ones on top. */
export interface FloorPiece {
  /** The piece's outline in plan metres. */
  poly: Outline;
  /** A floor finish key (surfaces.ts FLOOR_KINDS). */
  k: string;
  /** '#rrggbb' instead of the finish's own colour. */
  tint?: string;
}

/**
 * Two Home Assistant areas in one room without a wall between them (a kitchen-living room): the segment a–b across the room.
 * `area` is the area of the part to the left of a→b when `left` is true (else of the part to the right); the rest is room.area.
 */
export interface RoomZone {
  a: Point;
  b: Point;
  /** The HA area id of the zone's part; null: not linked yet. */
  area?: string | null;
  left: boolean;
  /** The zone's part was marked as having no HA area on purpose (the rooms step). */
  noArea?: boolean;
}

/** A room: its outline and everything kept per room. Edge arrays (wt, wf, wp, rail) have one entry per edge i → i+1. */
export interface Room {
  id: string;
  /** Older files may have none; the editor gives every new room one. */
  name?: string;
  /** The outline: corners in metres, counterclockwise (addRoom turns a clockwise one round). */
  polygon: Outline;
  /** The Home Assistant area id the room is linked to. */
  area?: string;
  /** Marked as having no HA area on purpose (the rooms step does not ask again). */
  noArea?: boolean;
  /** A shaft, a column or a boxing: not a room to walk in; it stays a solid mass at full height. */
  solid?: boolean;
  /** Per edge: the exterior wall's own thickness in metres; 0 means no wall there; null: the plan's default. */
  wt?: Array<number | null>;
  /** Per edge: the edge's own finish; null: the room's finish. */
  wf?: Array<EdgeFinish | null>;
  /** Per edge: the pieces of finish on that wall (pieces.ts); null: none. */
  wp?: Array<WallPiece[] | null>;
  /** Pieces of the floor (pieces.ts). */
  fp?: FloorPiece[];
  /** Per edge: a railing in place of the wall, its height in metres (geometry.ts RAIL); null or 0: a wall. */
  rail?: Array<number | null>;
  /** Every railing of this room is glass (D-075). */
  railGlass?: boolean;
  zone?: RoomZone;
  /** The wall finish key (surfaces.ts WALL_KINDS); none: guessed from the name. */
  wall?: string;
  /** '#rrggbb' instead of the wall finish's own colour. */
  wallTint?: string | null;
  /** The floor finish key (surfaces.ts FLOOR_KINDS); none: guessed from the name. */
  floor?: string;
  /** '#rrggbb' instead of the floor finish's own colour. */
  floorTint?: string | null;
  /** The room screen's dashboard layout in Preview (look/layout.ts). */
  panel?: PanelLayout;
  /** Readings used to live on the room (the first draft of D-033); migrate deletes them. */
  sens?: unknown;
}

export type OpeningKind = 'door' | 'window';

/**
 * Where an opening sits (opening.at): on edge `edge` of room `room`, from s0 to s1 metres along the edge from its start corner,
 * d metres across it (positive to the left of the edge's direction).
 */
export interface OpeningAt {
  room: string;
  edge: number;
  s0: number;
  s1: number;
  /** A file may lack it (the file check lets it through); the code reads it as a number. */
  d: number;
}

/** A door or a window. Its ends on the plan are not kept up to date: openingCoords gives them from `at`. */
export interface Opening {
  id: string;
  kind: OpeningKind;
  at: OpeningAt;
  /** Metres above the floor; missing in some older files. */
  bottom?: number;
  top?: number;
  /** A door's leaf: an index into plan.ts SWING (which end has the hinges, inward or outward). */
  swing?: number;
  /** A glazed door. */
  glass?: boolean;
  /** false: an opening without a leaf (a doorway). */
  leaf?: boolean;
  /** The ends an opening came with from a file without `at`; kept as they were, not moved with the wall. */
  a?: Point;
  b?: Point;
}

/** An opening with its ends on the plan now (openingCoords). */
export type PlacedOpening = Opening & {a: Point; b: Point};

/** An opening given by its two ends only, as older files hold it: migrate puts it on the nearest room edge. */
export interface LooseOpening extends Omit<Opening, 'id' | 'at' | 'a' | 'b'> {
  id?: string;
  at?: undefined;
  a: Point;
  b: Point;
}

/** An opening as migrate takes it: placed on an edge (its id may still be missing) or given by its ends. */
export type OpeningInput = (Omit<Opening, 'id'> & {id?: string}) | LooseOpening;

/** What the wall builder needs of an opening: its ends now, its heights, and its place (for the wall's thickness). */
export interface WallOpening {
  a: Point;
  b: Point;
  at?: OpeningAt;
  bottom?: number;
  top?: number;
}

// ---------- the plan file: furniture ----------

/**
 * [x, y, z], metres (or degrees for a tilt). In three.js space y is up and z is −(plan y); in an item's own space (parts.ts) x runs
 * along its width, y up, z along its depth (its front faces +z).
 */
export type Vec3 = [number, number, number];

/** A material of an item from parts: '#rrggbb', roughness and metalness 0–1. */
export interface PartMaterial {
  color: string;
  rough?: number;
  metal?: number;
}

/** What every simple part has: its material, its anchor and its tilt in degrees around the anchor. */
export interface PartBase {
  /** A key of the item's materials. */
  mat: string;
  /** The anchor: box, cyl and sphere stand on it (bottom centre); profile and lathe use their own coordinates around it. */
  at: Vec3;
  tilt?: Vec3;
}

/** A block [w, h, d], its edges rounded by `round` metres. */
export interface BoxPart extends PartBase {
  kind: 'box';
  size: Vec3;
  round?: number;
}

/** A cylinder: radius r at the bottom, r2 at the top (none: the same), h high, seg sides. */
export interface CylPart extends PartBase {
  kind: 'cyl';
  r: number;
  h: number;
  r2?: number;
  seg?: number;
}

/** A sphere of radius r, stretched by scale [x, y, z]. */
export interface SpherePart extends PartBase {
  kind: 'sphere';
  r: number;
  scale?: Vec3;
}

/** A flat outline [[x, y], …] in the x–y plane, extruded `depth` metres along z. */
export interface ProfilePart extends PartBase {
  kind: 'profile';
  points: Array<[number, number]>;
  depth: number;
}

/** An outline [[r, y], …] turned around the y axis. */
export interface LathePart extends PartBase {
  kind: 'lathe';
  points: Array<[number, number]>;
}

/** `count` copies of a part, each moved by `step` from the one before. */
export interface RepeatPart {
  kind: 'repeat';
  count: number;
  step: Vec3;
  part: Part;
}

/** A simple part of an item (parts.ts). */
export type Part = BoxPart | CylPart | SpherePart | ProfilePart | LathePart | RepeatPart;

/** A part that is a shape (repeats expanded). */
export type ShapePart = Exclude<Part, RepeatPart>;

/**
 * An item described by simple parts (furniture model 'parts', parts.ts): what the AI build could not match to the catalog.
 * Its own size w × h × d (the 3D view stretches it to the item's), at most 4 materials and 60 parts after expanding repeats.
 */
export interface PartsItem {
  w: number;
  d: number;
  h: number;
  materials: Record<string, PartMaterial>;
  parts: Part[];
  /** It slides under a table up to its top (true) or up to this height in metres (a chair's seat). */
  under?: true | number;
  /** It is a table: its top is its height (true) or this height in metres. */
  table?: true | number;
}

/**
 * An item on the plan (plan.furniture[]): a catalog model (catalog.ts) or 'parts'. Its centre is at x, y; w × d is its footprint
 * along and across its front, h its height.
 */
export interface FurnitureItem {
  id: string;
  /** A catalog id, or 'parts' (then `parts` describes it). */
  model: string;
  x: number;
  y: number;
  w: number;
  d: number;
  h: number;
  /** Degrees: 0 faces south (−y), 90 east, 180 north, 270 west. A file may lack it (the file check lets it through). */
  rot: number;
  /** The bottom above the floor, metres; none: the catalog's lift. */
  z?: number;
  /** A named colour (catalog COLORS) or '#rrggbb'; color2: the second one (a rug's border). */
  color?: string;
  color2?: string;
  /** A countertop (catalog TOPS: 'stone', 'white', 'oak', 'walnut', 'black'). */
  top?: string;
  /** A variant: a key of the model's catalog vars ('hinged', 'sliding', 'round'…). */
  v?: string;
  /** Mirrored (models with mirror in the catalog: a corner sofa, a shower…). */
  mx?: boolean;
  /** Its own name (a custom item, an item from parts). */
  name?: string;
  parts?: PartsItem;
  /**
   * A built-in run (catalog run: wardrobeRun, kitchenBase, kitchenWall): its room, and where it starts and ends on the room's
   * inner wall face, counterclockwise from a to b (runs.ts).
   */
  room?: string;
  a?: Point;
  b?: Point;
}

/** A catalog variant's own sizes, metres: any of them; z is its bottom above the floor (on the wall or not). */
export interface VariantSize {
  w?: number;
  d?: number;
  h?: number;
  z?: number;
}

/** A catalog variant: its key (item.v), its name, and how far a sofa bed unfolds or the variant's own sizes. */
export type CatalogVariant = [key: string, name: string, extra?: number | VariantSize];

/** A catalog entry (catalog.ts CATALOG): a model an item can be, with its sizes, colours and how it stands. */
export interface CatalogEntry {
  id: string;
  /** Its category in the picker ('' for none) and the other categories it shows in. */
  cat: string;
  also?: string[];
  name: string;
  /** How it is drawn in 3D ('gen': built in code, 'kenney': a model file…). */
  kind: string;
  /** The default size, metres. */
  w: number;
  d: number;
  h: number;
  /** The smallest and the largest size: [w, d, h], metres. */
  min: [number, number, number];
  max: [number, number, number];
  /** The default colour key (catalog COLORS), the keys offered, and whether it takes a second colour (a rug's border). */
  color: string;
  colors?: string[];
  color2?: boolean;
  /** Search words. */
  tags?: string;
  /** Variants: [key, name, extra]; extra is how far a sofa bed unfolds, or the variant's own sizes. */
  vars?: CatalogVariant[];
  /** Its bottom above the floor, metres (wall cabinets, a TV on the wall). */
  lift?: number;
  /** A table: true, or its top's height in metres (a dressing table has a mirror above it). */
  table?: true | number;
  /** It slides under a table: all of it (true) or up to this height in metres (a chair's seat). */
  under?: true | number;
  /** It can be mirrored (a corner sofa, a shower). */
  mirror?: boolean;
  /** Round on the plan: always, or in these variants. */
  round?: boolean | string[];
  /** It has a worktop (catalog TOPS). */
  tops?: boolean;
  /** An L- or U-shaped footprint: the depth of its back arm and its side arm, metres. */
  foot?: {back: number; side: number; u?: boolean};
  /** Soft (curtains): it overlaps nothing. */
  soft?: boolean;
  /** A built-in run along the walls (runs.ts). */
  run?: boolean;
  /** Snapped to a window, it is this much wider than the window, metres (curtains). */
  fit?: number;
  free?: boolean;
  /** It usually stands in the middle of a room: it snaps to a wall only when almost touching it. */
  loose?: boolean;
  /** Never shown in the picker (the 'parts' entry). */
  hidden?: boolean;
}

// ---------- the plan file: lights ----------

/** How a light was given by HA or the demo: points or a strip. */
export type LightKind = 'point' | 'strip';

/** What a fixture is (fixtures.ts FORMS). */
export type LightForm = 'ceiling' | 'pendant' | 'spots' | 'line' | 'strip' | 'wall' | 'lamp';

/**
 * A lamp on the plan (plan.lights[]): an HA light (or a relay with a light behind it) and where it is. The saved entry is merged
 * with HA's on load (ha.ts mergePlanLights): name, entity and area always come from HA.
 */
export interface PlanLight {
  /** An HA light: its entity id without "light."; a relay: 'relay_' + the switch's entity id. */
  id: string;
  /** 'light.…', or 'switch.…' for a relay. */
  entity?: string;
  name?: string;
  /** Its HA area id. */
  area?: string | null;
  /** '#rrggbb', its light's colour in 3D. */
  color?: string;
  /** A model name to guess the fixture from. */
  model?: string;
  /** An HA light group: its members' entity ids. */
  members?: string[];
  /** A switch marked "It's a light". */
  relay?: boolean;
  kind?: LightKind;
  /** None in older plans: fixtures.ts formFor guesses it from kind and h. */
  form?: LightForm;
  /**
   * The form's option: spots 'grid' | 'row' | 'ring' | 'free'; line 'along' | 'across' | 'frame' | 'free'; strip 'top' |
   * 'floor' | 'plinth' | 'under' | 'bed'; lamp 'floor' | 'table'.
   */
  opt?: string;
  /** A pendant's shade ('dome', 'metal', 'globe', 'woven') or a line light's body ('white', 'black'); none: from the name. */
  shade?: string;
  /** Metres above the floor (a table lamp: its bulb); a lamp from HA has none until it is placed. */
  h?: number;
  /** How many points (ceiling, pendant, spots, wall). */
  count?: number;
  /** The point lights' centres. */
  points: Point[];
  /** The line or strip pieces. */
  segments: Segment[];
  /** The room it is in; null: not on the plan. */
  room?: string | null;
  placed?: boolean;
  /** Its state in the demo (HA's own state elsewhere); read as on !== false. */
  on?: boolean;
  /** Placed by a guess, not by hand. */
  auto?: boolean;
  /** Placed during the guided steps, its room not confirmed yet. */
  draft?: boolean;
  /** "Not on the plan" on purpose. */
  skip?: boolean;
  /** Part of another fixture: that light's id (this one has no points or segments of its own). */
  with?: string;
  /** 1: a strip already rebuilt as one line round the contour. */
  loop?: number;
  /**
   * Before the guided steps changed it: the room part it was asked about (k: the room id and its first corner) and the light's
   * own fields as JSON of [key, value] pairs (s).
   */
  was?: {k?: string | null; s: string};
}

// ---------- the plan file: sensors and devices ----------

/** A reading written on a room's wall (plan.sensors[], D-033). */
export interface PlanSensor {
  id: string;
  /** 'sensor.…' */
  entity: string;
  room: string;
  /** Pinned to this point of the room's outline; none: placed in the room's row. */
  at?: Point;
  /** Hangs below this sensor (its id) in a column. */
  under?: string;
  /** How much its label was squeezed when it was pinned (below 1). */
  sc?: number;
  /** The digits' size (0.75 … 2); none: 1. */
  k?: number;
  /** Its own caption. */
  label?: string;
  /** The digits' colour, '#rrggbb'. */
  c?: string;
}

/** An HA device in the model (plan.devices[], D-048): an air conditioner or a cover on an item, a contact sensor on an opening. */
export interface PlanDevice {
  id: string;
  /** 'climate.…', 'cover.…' or 'binary_sensor.…' */
  entity: string;
  /** The item it is (an aircon, curtains or a blind). */
  furn?: string;
  /** The opening a contact sensor is on. */
  opening?: string;
  /** The item was made together with the device: unplacing the device removes it too. */
  made?: boolean;
}

// ---------- the plan file: the plan ----------

/** A step of the guided path (wizard-path.ts) and how far it is. */
export type OnboardingStepId =
  'rect' | 'split' | 'open' | 'names' | 'furniture' | 'lights' | 'devices' | 'sensors';
export type OnboardingStatus = 'in_progress' | 'confirmed' | 'deferred';

/** What one Preview scene does with one device: keyed 'light:<plan light id>', 'cover:<entity>' or 'ac:<entity>'. */
export interface SceneSetting {
  action: 'on' | 'off' | 'open' | 'close';
}

export type SceneId = 'home' | 'away' | 'night';

/** A card of a Preview dashboard: a built-in one by its id, or a favourites card of entities. */
export type PanelCard =
  {id: string; type?: undefined} | {id: string; type: 'entities'; title?: string; entities: string[]};

/** A Preview dashboard's layout (look/layout.ts): the cards in order and the built-in ones taken away. None: the default. */
export interface PanelLayout {
  cards: PanelCard[];
  removed?: string[];
}

/** The home view in 3D (scene.ts): the camera's target in three.js space (y up, z = −plan y), its angles and the frame. */
export interface HomeView {
  t: Vec3;
  /** Radians: round the vertical, and down from it. */
  theta: number;
  phi: number;
  /** The frame [w, h] in metres. */
  fit: [number, number];
}

/** The plan file (D-005): plain JSON, saved by the editor and by the HA integration. Every list is there after migrate. */
export interface Plan {
  /** plan.ts PLAN_VERSION; a file without one is version 0. */
  version: number;
  units: 'm';
  /** The project's own id ('plan_…'); migrate gives a plan one, an empty plan has none yet. */
  id?: string;
  name?: string;
  rooms: Room[];
  openings: Opening[];
  furniture: FurnitureItem[];
  lights: PlanLight[];
  sensors: PlanSensor[];
  /** HA sensors marked "Don't show": their entity ids. */
  sensorSkip: string[];
  devices: PlanDevice[];
  /** The plan's wall thicknesses, metres: exterior (none: geometry.ts OUTER) and partitions (none: 10 cm). */
  wall?: {outer?: number; inner?: number};
  /** The area from the documents, m². */
  docArea?: number;
  /** The documents' area includes the balcony. */
  docBalcony?: boolean;
  /** How the plan was scaled: from the drawn rectangle, from the rooms' area, from a wall's length. */
  scaleBy?: 'rect' | 'rooms' | 'wall';
  onboarding?: {steps: Partial<Record<OnboardingStepId, OnboardingStatus>>};
  /** Preview scenes' settings (look/scenes.ts). */
  scenes?: Partial<Record<SceneId, Record<string, SceneSetting>>>;
  /** The overview dashboard's layout (look/layout.ts). */
  panel?: PanelLayout;
  /** The home view in 3D, as the card opens it. */
  view?: HomeView;
}

/**
 * A plan as migrate takes it (a file, an older editor, the AI build): any field may be missing, and an opening may be given by
 * its ends only.
 */
export interface PlanInput extends Partial<Omit<Plan, 'openings'>> {
  openings?: OpeningInput[];
}

/**
 * The parts of a plan the room, wall and opening edits read. Functions that read only these take PlanCore, so a test can hand
 * them a bare {rooms, openings, furniture, lights}; a whole Plan is one too.
 */
export type PlanCore = Pick<Plan, 'rooms' | 'openings' | 'furniture' | 'lights' | 'wall'>;

// ---------- what the plan's geometry gives back ----------

/** A problem that keeps the plan from being built (geometry.ts validate): the room, the other room it overlaps, the message. */
export interface PlanProblem {
  room: string;
  other?: string;
  text: string;
}

/** Which way an exterior wall's outer face points: south, east, north, west. The 3D view hides the side facing the camera. */
export type FacadeSideId = 'S' | 'E' | 'N' | 'W';

/** A band of wall between two heights; `last` is the top band (its top face shows). */
export interface WallBand extends Prism {
  last: boolean;
}

/** The exterior walls on one side of the building: their shape on the plan and their bands up the height. */
export interface FacadeSide {
  id: FacadeSideId;
  shape: MultiPolygon;
  bands: WallBand[];
}

/** A glass railing's pane: along a..b on the plan, from `bottom` to `top` metres. */
export interface GlassRail {
  a: Point;
  b: Point;
  bottom: number;
  top: number;
}

/** The walls built from the room outlines (geometry.ts buildPlan2d). */
export interface WallPlan {
  /** The whole building on the plan, walls included. */
  footprint: MultiPolygon;
  /** Partitions: always shown. */
  interior: WallBand[];
  /** Exterior walls by the side they face. */
  sides: FacadeSide[];
  /** Parapets under the railings: never hidden. */
  rails: WallBand[];
  glassRails: GlassRail[];
  /** For each opening handed in: the side whose wall holds most of it (its glass hides with that side), or null. */
  openingSide: Array<FacadeSideId | null>;
  /** The rounding the build succeeded with (1000: 1 mm). */
  step: number;
}

/** Edge j of a room: the room and the edge's index (the edge runs from corner j to corner j + 1). */
export type EdgeRef = [Room, number];

/** A room edge with its geometry (plan.ts roomEdges): ends, length, unit direction u and the inward normal n. */
export interface RoomEdge {
  room: Room;
  i: number;
  a: Point;
  b: Point;
  l: number;
  u: Vector;
  n: Vector;
}

/** The wall at edge i of a room (plan.ts wallInfo). */
export interface WallInfo {
  room: Room;
  i: number;
  a: Point;
  b: Point;
  u: Vector;
  /** Outward from the room. */
  n: Vector;
  /** The edges on this side of the wall (this one first) and on the other side (the neighbours'). */
  A: EdgeRef[];
  B: EdgeRef[];
  /** Between rooms (it has edges on the other side). */
  interior: boolean;
  /** The gap between the two sides, metres. */
  gap: number;
  /** Taken away (room.wt[i] is 0). */
  open: boolean;
  /** A railing's height in place of the wall; 0: a wall. */
  rail: number;
  /** The wall's thickness, metres. */
  t: number;
}

/** The stretch of a wall under one point (plan.ts wallAt): only the part shared with one neighbour. */
export interface WallStretch extends WallInfo {
  /** The neighbour across this stretch; null: an exterior stretch. */
  neighbor: Room | null;
  /** [from, to] metres along the edge from its start. */
  seg: [number, number];
}

/** What settleRoom moved: edge i by d metres along its outward normal, to leave a partition ('gap') or to line up ('align'). */
export interface SettleMove {
  i: number;
  d: number;
  kind: 'gap' | 'align';
}

/** One part of a split outline (plan.ts splitPolygon): its corners and its per-edge values; the last edge is the split. */
export interface SplitPart {
  pts: Outline;
  /** wt, wf, rail and wp of each edge. */
  ws: Array<number | null>;
  fs: Array<EdgeFinish | null>;
  rs: Array<number | null>;
  ps: Array<WallPiece[] | null>;
}

/** A room divided by its zone (plan.ts zoneParts): the chord across, its direction and normal, and the two parts. */
export interface ZoneParts {
  ch: Segment;
  d: Vector;
  n: Vector;
  /** The zone's part, and the rest (room.area). */
  zone: Outline;
  main: Outline;
}

// ---------- what placing furniture and lights gives back (layout.ts) ----------

/** A rectangle in an item's own axes: [x0, x1, z0, z1], metres from its centre (x along its width, z towards its front). */
export type FootRect = [number, number, number, number];

/** An item's outline on the plan and its front side (for an L-shaped item, the inner corner). */
export interface ItemOutline {
  pts: Outline;
  front: Point[];
}

/**
 * Where an item goes when it snaps to a wall: its centre and rotation; the wall to highlight; the guide through the middle of
 * the wall or a window, or along a neighbour's edge; the window's width when it is centred on one. Free placement: x, y, rot.
 */
export interface WallSnap {
  x: number;
  y: number;
  rot: number;
  wall?: Segment;
  mid?: Segment | null;
  edge?: Segment | null;
  win?: number | null;
}

/** A guide line a light point snapped to: the vertical line x or the horizontal line y. */
export type LightGuide = {x: number} | {y: number};

/** Where a light point goes and the guides it snapped to. */
export interface LightSnap {
  p: Point;
  guides?: LightGuide[];
}

/** A strip along a wall: its room and its two ends. */
export interface WallStrip {
  room: string;
  seg: Segment;
}

// ---------- pieces of finish (pieces.ts) ----------

/** A finish to draw: its key and the overrides that are well formed. Tint null: the finish's own colour. */
export interface Finish {
  k: string;
  tint?: string | null;
  tile?: [number, number];
  joint?: number;
}

/** A well-formed wall piece: from and to along the edge (fractions), bottom and top (metres; Infinity: up to the ceiling). */
export interface EdgePiece {
  from: number;
  to: number;
  bottom: number;
  top: number;
  finish: Finish;
}

/** One finish up a wall, from bottom to top metres (the last one goes on to the ceiling: Infinity). */
export interface FinishBand {
  bottom: number;
  top: number;
  finish: Finish;
}

/** A stretch of an edge (fractions from and to) with the same finishes up the wall. */
export interface EdgeRun {
  from: number;
  to: number;
  bands: FinishBand[];
}

/** A floor piece cut to its room: rings (the outer one first, then holes; not closed), the finish key and the tint. */
export interface FloorPieceShape {
  rings: Outline[];
  k: string;
  tint: string | null;
}

// ---------- items from parts (parts.ts) ----------

/** A part after expanding repeats, with its path for messages ("parts[3].part#2": the 3rd entry, copy 2). */
export interface ExpandedPart {
  part: ShapePart;
  path: string;
}

/** The full check of an item from parts: errors stop drawing it, warnings do not; how many parts it has once checked. */
export interface ItemCheck {
  errors: string[];
  warnings: string[];
  parts?: number;
}

// ---------- trim (trim.ts) ----------

/** A piece of skirting, casing or sill; `opening`: the index of the opening a casing frames (null for skirting). */
export interface TrimBox extends Prism {
  opening: number | null;
}

// ---------- the overview (overview.ts) ----------

/** A room's kind, from its name: for its icon and what the AI build calls it. */
export type RoomKind =
  'bath' | 'kids' | 'bed' | 'kitchen' | 'living' | 'hall' | 'balcony' | 'office' | 'storage' | 'room';

/**
 * A quantity a sensor shows (sensors.ts METRICS for room air, metricOf for the rest): its key ('t', 'h', 'co2', 'pm'; for other
 * sensors their class), HA device class, captions, how its number is written, whether a reading is plausible, and its level.
 */
export interface Metric {
  k: string;
  cls: string | null;
  label: string;
  name: string;
  /** The HA area setting that names this quantity's sensor. */
  area?: 'temperature_entity_id' | 'humidity_entity_id';
  text(value: number, unit?: string | null): string;
  sane?(value: number, unit?: string | null): boolean;
  /** 0 normal, 1 attention, 2 bad. */
  lvl(value: number): number;
  /** Not shown yet. */
  off?: boolean;
}

/** One quantity of a room's climate: the sensor, the number, how it is written and its level (Metric lvl). */
export interface ClimateReading {
  entity: string;
  v: number;
  text: string;
  lvl: number;
}

/** A room's climate by quantity key ('t', 'h', 'co2'); a quantity without a sensor or a number is missing. */
export type RoomClimate = Partial<Record<string, ClimateReading>>;

/** An air conditioner's or a thermostat's state for the controls (devices.ts acView); only ok and on when HA has none. */
export interface AcView {
  ok: boolean;
  on: boolean;
  /** HA's hvac mode ('cool', 'heat', 'off'…), its tone for colours and its name in the UI. */
  mode?: string;
  tone?: string;
  name?: string;
  /** The target and the current temperature, °; null: HA has none. */
  temp?: number | null;
  current?: number | null;
  min?: number;
  max?: number;
  step?: number;
  fan?: string;
  action?: string;
  modes?: string[];
}

/** A cover's state (devices.ts coverView): how open, 0–1 (pos: 0–100), and whether it is moving. */
export interface CoverView {
  ok: boolean;
  open: number;
  pos?: number;
  moving?: boolean;
}

/** A contact sensor's state (devices.ts contactView). */
export interface ContactView {
  ok: boolean;
  open: boolean;
}

/** An air conditioner or a heater in a room's area; `name` is its mode's name, `title` the appliance's. */
export type RoomAc = AcView & {entity: string; name: string; kind: 'ac' | 'heat'; title: string};

/** A cover in a room's area; blind: a roller or venetian blind, else curtains. */
export type RoomCover = CoverView & {entity: string; name: string; blind: boolean};

/** A contact sensor in a room's area; cls: its device class (door, window…). */
export type RoomContact = ContactView & {entity: string; name: string; cls?: string | null};

/** The HA devices of a room's area (D-048), whether or not they are in the model. */
export interface RoomDevices {
  acs: RoomAc[];
  covers: RoomCover[];
  contacts: RoomContact[];
}

/** A lamp of a room in the overview. */
export interface OverviewLamp {
  id: string;
  name: string;
  form: LightForm;
  on: boolean;
}

/** A room of the home overview (overview.ts): its name, kind, outline, climate, lamps (how many on) and devices. */
export interface OverviewRoom {
  id: string;
  name: string;
  kind: RoomKind;
  poly: Outline;
  climate: RoomClimate;
  lamps: OverviewLamp[];
  lit: number;
  dev: RoomDevices;
}

// ---------- Home Assistant: the hass object ----------
// What the editor reads of the `hass` object Home Assistant hands to the panel and the card (ha-live.ts, ha-panel.ts, card.ts,
// card-main.ts). Only the fields the code reads; HA's own object has many more.

/** hass.locale: the HA user's number and time formats, as i18n.ts setFormats reads them. */
export interface HassLocale {
  language?: string;
  /** 'language' (the default), 'system', 'comma_decimal', 'decimal_comma', 'space_comma', 'quote_decimal' or 'none'. */
  number_format?: string;
  /** 'language' (the default), 'system', '24', or the 12-hour clock ('am_pm' as i18n.ts checks it). */
  time_format?: string;
}

/** An entity's attributes; the ones the code reads are named, the rest are open. */
export interface HassAttributes {
  friendly_name?: string;
  unit_of_measurement?: string;
  device_class?: string;
  /** A light group: its members' entity ids. */
  entity_id?: string[];
  /** climate */
  hvac_modes?: string[];
  hvac_action?: string;
  temperature?: number;
  current_temperature?: number;
  min_temp?: number;
  max_temp?: number;
  target_temp_step?: number;
  fan_mode?: string;
  fan_modes?: string[];
  /** cover: 0 closed … 100 open */
  current_position?: number;
  /** camera: the frame's path (ha.url makes it a full URL) */
  entity_picture?: string;
  /** a bit set of what the entity can do (vacuum: pause 4, return home 16, start 8192) */
  supported_features?: number;
  /** weather */
  apparent_temperature?: number;
  /** sun.sun: ISO times */
  next_rising?: string;
  next_setting?: string;
  [name: string]: unknown;
}

/** An entity's state, as hass.states[entity_id] holds it (and as the demo HA layer makes it). */
export interface HassEntityState {
  /** hass.states entries have it; the demo's do not. */
  entity_id?: string;
  /** 'on', 'off', 'unavailable', 'unknown', a number as text, 'open', 'cleaning', 'below_horizon'… */
  state: string;
  attributes: HassAttributes;
  /** ISO time; the demo's lamps have none. */
  last_changed?: string;
  last_updated?: string;
}

/** An entity registry entry (hass.entities[entity_id]). */
export interface HassEntityEntry {
  entity_id: string;
  device_id?: string | null;
  area_id?: string | null;
  name?: string | null;
  hidden?: boolean;
  /** 'config' or 'diagnostic' for service entities, which the editor leaves out. */
  entity_category?: string | null;
  /** The integration that made it ('met' for the met.no weather). */
  platform?: string;
}

/** A device registry entry (hass.devices[device_id]). */
export interface HassDeviceEntry {
  id?: string;
  area_id?: string | null;
}

/** An area registry entry (hass.areas[area_id]). */
export interface HassAreaEntry {
  area_id: string;
  name: string;
  /** The area's own sensors, set in HA's area settings. */
  temperature_entity_id?: string | null;
  humidity_entity_id?: string | null;
}

/** A WebSocket message to Home Assistant: its type and its own fields. */
export interface HassMessage {
  type: string;
  [field: string]: unknown;
}

/** The parts of HA's `hass` object the editor uses. Answers from HA are unknown until checked. */
export interface Hass {
  states: Record<string, HassEntityState>;
  /** The registries; missing until HA has loaded them. */
  areas?: Record<string, HassAreaEntry>;
  entities?: Record<string, HassEntityEntry>;
  devices?: Record<string, HassDeviceEntry>;
  callWS(message: HassMessage): Promise<unknown>;
  callService(domain: string, service: string, data?: Record<string, unknown>): Promise<unknown>;
  connection?: {
    subscribeMessage(onMessage: (message: unknown) => void, subscribe: HassMessage): Promise<() => void>;
  };
  fetchWithAuth(path: string, init?: RequestInit): Promise<Response>;
  hassUrl?(path?: string): string;
  /** Registered panels and dashboards by url path; only whether one exists is read. */
  panels?: Record<string, unknown>;
  config?: {location_name?: string};
  language?: string;
  locale?: HassLocale;
  themes?: {darkMode?: boolean};
  connected?: boolean;
  user?: {is_admin?: boolean};
}

// ---------- Home Assistant: the HA layer ----------
// The editor knows HA only through this object (editor/ha.ts describes each member): the demo one (ha.ts mockHA) until HA is
// connected, the real one (ha-live.ts liveHA) in the HA panel and the card. Members marked "live only" are missing in the demo.

/** An HA area as the layer lists it. The demo leaves the two sensor ids out rather than null. */
export interface HaArea {
  area_id: string;
  name: string;
  temperature_entity_id?: string | null;
  humidity_entity_id?: string | null;
}

/** A light entity as lights() lists it: not placed on the plan yet (haPlanLights makes a plan lamp of it). */
export interface HaLamp {
  /** The entity id without "light.". */
  id: string;
  entity: string;
  name: string;
  area: string | null;
  /** '#rrggbb', the light's colour in 3D. */
  color: string;
  /** A model name to guess the fixture from (fixtures.ts reads it; neither layer sets it yet). */
  model?: string;
  /** A light group: its members' entity ids. */
  members?: string[];
  /** Demo only: a shape hint. */
  kind?: LightKind;
  /** Demo only: the mounting height, metres. */
  h?: number;
}

/** A switch entity (a relay that may have a light behind it). The live layer lists only switches with an area. */
export interface HaSwitch {
  entity: string;
  name: string;
  area: string | null;
}

/** A numeric sensor (sensor domain) as sensors() lists it. */
export interface HaSensor {
  entity: string;
  name: string;
  /** The entity's area or its device's. */
  area: string | null;
  /** The device id (the demo: a demo device key). */
  device: string | null;
  /** device_class: 'temperature', 'humidity', 'carbon_dioxide', 'pm25', 'battery'… */
  cls: string | null;
  unit: string | null;
  /** entity_category: 'config' or 'diagnostic' for service sensors. */
  cat?: string | null;
  hidden?: boolean;
  /** Demo only (ha-demo.ts): the daily amount for energy sensors and the shape of the day's curve. */
  daily?: number;
  shape?: 'flat' | 'home' | 'day' | 'evening';
}

/**
 * A device for the model and Preview (D-048): climate, cover, camera, valve, vacuum, or a binary_sensor with class door, window,
 * garage_door, opening or moisture.
 */
export interface HaDevice {
  entity: string;
  name: string;
  area: string | null;
  /** The entity's domain: 'climate', 'cover', 'camera', 'valve', 'vacuum', 'binary_sensor'. */
  domain: string;
  /** device_class: for a cover 'curtain', 'blind', 'shade'…; for a binary_sensor 'door', 'window', 'moisture'…; for a valve 'water', 'gas'. */
  cls?: string | null;
  /** A leak sensor: the battery charge sensor and the "battery low" binary_sensor of the same device. */
  battery?: string;
  low?: string;
  /** Its HA device id, which Preview's statistics read; neither HA layer sets it yet. */
  device?: string;
}

/** Any entity, for "Favorites" in Preview. */
export interface HaEntityItem {
  entity: string;
  name: string;
  area: string | null;
  domain: string;
  cls?: string;
  unit?: string;
}

/** One hour of the weather forecast; `at` in ms. */
export interface HaWeatherHour {
  at: number;
  condition: string;
  temperature: number;
}

/** The weather for the "Whole home" header; times in ms. The live layer has null where HA has no value. */
export interface HaWeather {
  entity: string;
  /** HA's condition: 'sunny', 'cloudy', 'rainy'… */
  condition: string;
  temperature: number | null;
  feels: number | null;
  hourly: HaWeatherHour[];
  sunrise: number | null;
  sunset: number | null;
}

/** What long-term statistics to fetch: times in ms. */
export interface HaStatisticsQuery {
  start: number;
  end: number;
  period: 'hour' | 'day' | 'month';
  types: Array<'mean' | 'min' | 'max' | 'change'>;
}

/** One period of long-term statistics; times in ms, energy in kWh. */
export interface HaStatisticsRow {
  start: number;
  end: number;
  mean?: number | null;
  min?: number | null;
  max?: number | null;
  change?: number | null;
}

/** One change of state from the raw history: the state, and when (lu, seconds). */
export interface HaStateChange {
  s: string;
  lu: number;
}

/** The HA "Energy" dashboard: the grid consumption statistics and the devices it lists. */
export interface HaEnergyPrefs {
  grid: string[];
  devices: Array<{statistic: string; name?: string; parent?: string}>;
}

/** The Home Twin dashboard in HA (D-059): whether it exists, make it (an administrator), go there. */
export interface HaBoard {
  exists(): boolean;
  add(title: string): Promise<void>;
  open(): void;
}

/** The HA layer (editor/ha.ts describes each member). */
export interface HaLayer {
  /** Demo data: Preview shows "Demo". */
  demo: boolean;
  /** Live only: the registries are loaded (before that an empty area list does not mean the areas were deleted). */
  ready?(): boolean;
  /** Live only: HA handed a new hass object. */
  update?(hass: Hass): void;
  areas(): HaArea[];
  lights(): HaLamp[];
  switches(): HaSwitch[];
  sensors(): HaSensor[];
  /** A sensor's current number, or null (unavailable, unknown, not a number). */
  state(entity: string): number | null;
  entity(entity: string): HassEntityState | null;
  /** Readings changed; returns the unsubscribe function. */
  onState(listener: () => void): () => void;
  /** Areas or lamps changed; returns the unsubscribe function. */
  onChange(listener: () => void): () => void;
  /** A sensor's last 3 hours, a point every 5 minutes, the last one now; none: []. */
  history(entity: string): number[];
  weather(): HaWeather | null;
  /** The sun is below the horizon; the demo takes the time to check. */
  sunDown(now?: number): boolean;
  statistics(ids: string[], query: HaStatisticsQuery): Promise<Record<string, HaStatisticsRow[]>>;
  stateHistory(ids: string[], range: {start: number; end: number}): Promise<Record<string, HaStateChange[]>>;
  energy(): Promise<HaEnergyPrefs | null>;
  devices(): HaDevice[];
  entities(): HaEntityItem[];
  /** A command (hass.callService); resolves to whether it went through. */
  call(domain: string, service: string, data?: Record<string, unknown>): Promise<boolean>;
  /** Blink a lamp in the home; resolves to its entity id. */
  identify(entity: string): Promise<string>;
  /** Set an entity's area (on its device when HA does not allow it on the entity). */
  setArea(entity: string, area: string | null): Promise<void>;
  /** Live only: open the entity's card in HA. */
  moreInfo?(entity: string): void;
  /** Live only: the full URL for an HA path. */
  url?(path: string): string;
  /** Live only: the Home Twin dashboard. */
  board?: HaBoard;
  /** Where to add an area and where to add a device and set its area. */
  areasUrl: string;
  devicesUrl: string;
  /** Live only: no longer needed (the card was removed). */
  close?(): void;
}

/** The demo HA layer's extra controls, for the editor's own lamps and for tests. */
export interface DemoHaLayer extends HaLayer {
  /** Where the demo reads the plan's lamps from (their `on` is the lamps' state). */
  _lightsFrom(lamps: () => PlanLight[]): void;
  _setState(entity: string, value: number): void;
  _setEntity(entity: string, state: string, attributes?: HassAttributes): void;
  _add(area: HaArea): void;
  _addSwitch(sw: HaSwitch): void;
  _remove(areaId: string): void;
}

/** The demo weather (ha.ts demoWeather): the day's low and high, °; sunrise and sunset, 'HH:MM'; HA's condition for each hour. */
export interface DemoWeatherProfile {
  low: number;
  high: number;
  sunrise: string;
  sunset: string;
  /** 24 conditions ('sunny', 'cloudy'…), one per hour of the day. */
  hours: string[];
}

/**
 * The demo's "Statistics" (ha.ts mockHA): how many days of statistics, how many days ago HA restarted, the "Energy" dashboard,
 * and which entities dropped out (for how many hours, how many times).
 */
export interface DemoStats {
  since?: number;
  restart?: number;
  energy?: HaEnergyPrefs;
  outages?: Record<string, {hours: number; drops: number}>;
}

/** Home Assistant's data for the demo, as mockHA takes it (ha.ts) and a demo home gives it (demo/kit.ts). */
export interface DemoHaData {
  /** Area id → its name. */
  areas: Record<string, string>;
  lights: HaLamp[];
  switches?: HaSwitch[];
  sensors?: HaSensor[];
  /** Sensor entity → its number. */
  states?: Record<string, number>;
  /** An area's own sensors (HA's area settings), by area id. */
  areaSensors?: Record<string, {temperature_entity_id?: string; humidity_entity_id?: string}>;
  devices?: HaDevice[];
  /** Entity → its state, for the devices and the extra entities. */
  entities?: Record<string, HassEntityState>;
  weather?: DemoWeatherProfile | null;
  stats?: DemoStats;
  /** Other entities for "Favorites" (scenes, scripts, relays, toggles); their states are in entities. */
  extra?: HaEntityItem[];
}

/** A demo home (demo/<name>.ts, src/gen/demo.gen.js): its HA data, its plan, and its plan photo (none in the repository). */
export interface DemoHome {
  HA: DemoHaData;
  DEMO: PlanInput;
  DEMO_UNDERLAY: unknown;
}

/** An example home on the start screen (src/gen/examples.gen.js). */
export interface ExampleHome {
  id: string;
  HA: DemoHaData;
  DEMO: PlanInput;
}

/** What room climate and the sensor suggestions read (app.ts sensorCtx): HA's sensors, areas and current readings. */
export interface SensorContext {
  sensors: HaSensor[];
  areas: HaArea[];
  state(entity: string): number | null;
}

// ---------- the UI's saved state ----------

/** A UI language (i18n.ts LANGS). */
export type Lang = 'en' | 'de' | 'fr' | 'nl' | 'es' | 'zh' | 'it' | 'pl' | 'pt' | 'ru';

/** Day and night in 3D (daynight.ts, D-068), kept under 'home-twin:daynight'. */
export type DayNightMode = 'auto' | 'day' | 'night';

/** The editor's steps that have a side panel. */
export type SidePanel = 'rooms' | 'furniture' | 'lights' | 'devices' | 'sensors';

/** Where a project is in the guided steps (ui.wiz[planId]); each flag: that step is on. */
export interface WizardProgress {
  open?: boolean;
  names?: boolean;
  furn?: boolean;
  lights?: boolean;
  /** The lights step: the lamp it is asking about. */
  at?: string;
  dev?: boolean;
  sens?: boolean;
  askDev?: boolean;
  ask?: boolean;
  fin?: boolean;
  viewSkip?: boolean;
  /** Read by the rooms step, never written. */
  view?: boolean;
}

/** The editor's screen settings, saved in localStorage under 'home-twin-editor:ui' (app.ts saveUI). */
export interface UiState {
  /** The main view; the other one is the small window. */
  main: 'plan' | '3d';
  /** The second view: a small window in the corner, side by side, or collapsed. */
  pip: 'win' | 'dock' | 'off';
  /** The small window's size, px; pipH 0: two thirds of pipW. */
  pipW: number;
  pipH: number;
  /** Side by side: the second view's share of the width, percent (20–75). */
  view: number;
  /** Per step: its side panel is open. */
  sideBy: Partial<Record<SidePanel, boolean>>;
  /** The side panel is pinned open. */
  pinned?: boolean;
  /** none: 'auto' (the system's or HA's theme). */
  theme?: 'auto' | 'light' | 'dark';
  /** none: the HA user's or the system's language. */
  lang?: Lang;
  /** Wall thickness is set per edge. */
  wallEach?: boolean;
  /** Hints already shown, by key ('pipGrip:<planId>', 'solidAsk:<planId>'…): when. */
  hints?: Record<string, number>;
  /** Guided steps per project id; the last 10 projects are kept. */
  wiz?: Record<string, WizardProgress>;
}

/** Where the plan photo sits under the plan ('home-twin-editor:underlay'; in HA, the integration keeps it). */
export interface UnderlayPlace {
  /** The similarity world = a·z + b, where z = (u, −v) is an image pixel: a and b as complex numbers. */
  a: Point;
  b: Point;
  opacity: number;
  visible: boolean;
}

// ---------- globals ----------
// The HA panel (ha-panel.ts) sets these before the editor's modules load.
declare global {
  /** The HA user's language (hass.language). */
  var HOME_TWIN_LANG: string | undefined;
  /** The HA user's number and time formats (hass.locale). */
  var HOME_TWIN_LOCALE: HassLocale | undefined;
  /** HA's theme is dark (hass.themes.darkMode). */
  var HOME_TWIN_DARK: boolean | undefined;
}
