// The editor object `ed` (app.ts createApp) and the shapes the editor's screens hand to each other through it: the modes,
// the step card and its buttons, the selection, the versions, the guided path's steps, the start-screen flows, the step
// hint's layout and Preview. Types only: nothing here runs.
//
// app.ts builds `ed` and hands it to every mode and panel; boot.ts, flows.ts and ha-app.ts add a few members after it is
// built (optional here, but for the three boot.ts sets before any screen can use them). A member made by another module
// (the 2D and 3D views, the plan photo, the history, the guided path) has that module's own type.
import type {SceneView} from '../core/scene.ts';
import type {PlacedSensor} from '../core/sensors.ts';
import type {PlanView2d} from './view2d.ts';
import type {Underlay, UnderlaySnapshot} from './underlay.ts';
import type {PlanHistory} from './history.ts';
import type {PlanVersion, VersionKind} from './versions.ts';
import type {WizardPath} from './wizard-path.ts';
import type {
  DayNightMode,
  GlassRail,
  HaDevice,
  HaLayer,
  MultiPolygon,
  OnboardingStatus,
  OnboardingStepId,
  Plan,
  PlanInput,
  PlanLight,
  PlanProblem,
  PlanSensor,
  Point,
  Room,
  SensorContext,
  Segment,
  UiState,
  WallBand,
  WizardProgress,
} from '../core/types.ts';

// ---------- screen places ----------

/** A spot on a canvas or a view: [x, y] in CSS pixels from its top-left corner. */
export type CanvasPoint = [number, number];

/** A rectangle on screen, in CSS pixels from the window's top-left corner (a DOMRect is one). */
export interface ScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Where a step hint points (coach.ts): the area on screen right now, or null when there is none to show. */
export type Aim = () => ScreenRect | null;

/** The two views: the plan and the 3D model. */
export type Pane = UiState['main'];

/** How a view is shown: full screen, the small window in the corner, side by side, or collapsed. */
export type PaneRole = 'main' | 'win' | 'dock' | 'off';

// ---------- tools and modes ----------

/** The editor's modes (the buttons at the top); each has its side panel (UiState.sideBy). */
export type ModeId = keyof EditorModes;

/** The bottom bar's tools: exactly one is on. rect, poly and split exist only in "Plan" (the rooms mode). */
export type EditorTool = 'select' | 'rect' | 'poly' | 'split' | 'hand' | 'rotate';

/** The rooms mode's own tools (modes/rooms.ts setTool). */
export type RoomTool = 'select' | 'rect' | 'poly' | 'split';

/** A guided step the rooms mode runs itself: the outline, the rooms, windows and doors, linking rooms to HA. */
export type RoomsWizardPhase = 'rect' | 'split' | 'open' | 'names';

/**
 * The pointer as a mode's or a modal tool's `move` gets it: a real pointer event, or the last one replayed with no buttons
 * pressed (app.ts refreshCursor) — only these fields are there then.
 */
export interface PlanPointer {
  offsetX: number;
  offsetY: number;
  shiftKey: boolean;
  buttons: number;
}

// ---------- the step card and its buttons (ui.ts banner, app.ts show) ----------

/**
 * A button on the step card: its label, what it does and its look (true: the main button, a string: its classes). exit and
 * back mark the "Exit setup" and "Back" app.ts adds; exit or path makes the card a guided step's card with the path strip.
 */
export type BannerButton = [label: string, action: () => void, primary?: boolean | string] & {
  exit?: boolean;
  back?: boolean;
  path?: boolean;
};

/** What goes on the step card after the text: buttons, or an element of the step's own (the summary's list of steps). */
export type BannerItem = BannerButton | HTMLElement;

/** How a hint or a step is shown (app.ts show, coach.ts show). */
export interface StepOptions {
  /** The hint's key: not the text, so the first edit does not restart the hint. None: the path step, else the text. */
  id?: string;
  /** The short instruction on the card; the full text opens with its "?" button. */
  short?: string;
  /** Shown in Preview too. */
  look?: boolean;
  /** The card stays at the bottom above the toolbar; its area only gets the highlight. */
  fixed?: boolean;
  /** The card appears without its pop. */
  compact?: boolean;
}

/** A guided step's options (ed.step). */
export interface WizardStepOptions extends StepOptions {
  /** false: no "Back" and "Exit setup" (a yes / no question). None: true. */
  exit?: boolean;
}

/** The guided step shown now (ed.stepNow): the mode it belongs to and what ed.step was given. */
export interface WizardStep {
  mode: EditorMode;
  text: string;
  buttons: BannerItem[];
  aim: Aim | null | undefined;
  o: StepOptions;
}

/** The field on the plan (ui.ts ask) for a length in centimetres (ok gets metres) or a number. */
export interface AskNumberOptions {
  type: 'len' | 'number';
  ok?: (value: number) => void;
  cancel?: () => void;
}

/** The field on the plan (ui.ts ask) for text. */
export interface AskTextOptions {
  type?: 'text';
  ok?: (value: string) => void;
  cancel?: () => void;
}

export type AskOptions = AskNumberOptions | AskTextOptions;

/** The screen areas a step hint can point at (ed.aim). */
export interface EditorAim {
  /** The visible part of these plan points. */
  pts(points: () => Point[] | null | undefined): Aim;
  /** The element with this id, while it is shown and open. */
  el(id: string): Aim;
  /** The box around several areas. */
  join(...aims: Aim[]): Aim;
  /** The plan photo, while it is shown. */
  photo: Aim;
  /** The rooms with their outer walls. */
  rooms: Aim;
}

// ---------- what is selected and dragged on the plan ----------

/** The wall the rooms mode has selected: its room, the edge, and where along it (0–1). */
export interface WallSelection {
  room: string;
  i: number;
  t: number;
}

/** What is selected on the plan (ed.sel): each mode keeps its own keys; null or none: nothing of that kind. */
export interface Selection {
  /** The rooms mode: a room id, and its corner. */
  room?: string | null;
  vertex?: number | null;
  wall?: WallSelection | null;
  opening?: string | null;
  /** The furniture mode: an item id. */
  furn?: string | null;
  /** The lights mode: a lamp id, and the part of it (a point or a section). */
  light?: string | null;
  part?: number | null;
  /** The sensors mode: a plan sensor id. */
  sensor?: string | null;
  /** The devices mode: an HA entity id. */
  device?: string | null;
}

/** The kinds ed.select selects by id (it replaces the whole selection). */
export type SelectKind = 'room' | 'opening' | 'furn' | 'light' | 'sensor' | 'device';

/** A snap guide (draw.ts drawGuides): a highlighted wall, a guide segment, or a line across the plan at x or at y. */
export interface PlanGuide {
  seg?: Segment;
  line?: Segment;
  x?: number;
  y?: number;
}

/** What a mode is dragging (ed.drag): each mode has its own shape; the editor reads only these fields. */
export interface EditorDrag {
  /** Moved past the threshold: Esc restores the plan from before the press. */
  moved?: boolean;
  /** The sensors mode: the sensor being dragged (its label is placed last). */
  S?: Pick<PlanSensor, 'id'>;
}

/** A modal tool that takes the plan's pointer (ed.capture, flows.ts): scale by a wall, rotate the plan, the photo's frame. */
export interface EditorCapture {
  /** 'rotate-plan' for the rotation; nothing reads it. */
  kind?: string;
  down(p: Point, e: PointerEvent): void;
  move?(p: Point, e: PlanPointer): void;
  up?(p: Point, e: PointerEvent): void;
  cancel?(): void;
  /** Finish and keep the result (a new tool chosen); none: cancel. */
  done?(): void;
  draw?(): void;
  /** A trackpad rotation or two fingers: turn by this many radians. */
  spin?(radians: number): void;
  spinEnd?(): void;
  dragCursor?(): string;
}

// ---------- the modes (modes/*.ts) ----------

/** What every mode gives the editor (app.ts, draw.ts, wizard-path.ts call it through ed.mode and ed.modes). */
export interface EditorMode {
  id: ModeId;
  /** A press on the plan; false: not this mode's, the plan pans. */
  down(e: PointerEvent, p: Point): boolean;
  move(e: PlanPointer, p: Point): void;
  up(e: PointerEvent, p: Point): void;
  /** An empty spot was pressed. */
  deselect(): void;
  key(e: KeyboardEvent): void;
  /** Draws the mode's handles over the plan. */
  draw(): void;
  /** Rebuilds the mode's tools, side panel and the panel above the selection. */
  refresh(): void;
  /** The selection's frame on the plan for the panel above it; null: no panel. */
  anchor(): PlanBox | null;
  /** Another plan or another guided step: the mode forgets its state. */
  reset(): void;
  /** The cursor while dragging; null: the default. */
  dragCursor(): string | null;
  /** Esc or a lost pointer: the mode drops its drag (app.ts restores the plan). */
  cancelDrag(): void;
  /** Leaving the mode. */
  leave?(): void;
  /** Esc: closes the mode's question or half-drawn shape; true: there was one. */
  closeHint?(): boolean;
  /** The mode's guided step is on. */
  wizardOn?(): boolean;
  /** Nothing reads it (the modes that have it return ''). */
  status?(): string;
  /** What the panel above the selection is about besides the selection: another one moves the panel back to its object. */
  ctxKey?(): string;
  /** The panel is about more than the selection (the step's room): a panel dragged aside stays while it is the same. */
  ctxPin?(): string | null;
  dblclick?(e: MouseEvent, p: Point): void;
  /** "Split" (Tab): turns the split line by 90°. */
  flipCut?(): void;
  /** The room whose panel is under the pointer: draw.ts tints it. */
  tintRoom?(): string | null;
  /** The "Link rooms" step: the room or its zone still has no HA area (its label is marked). */
  unnamed?(room: Room): boolean;
  unnamedZone?(room: Room): boolean;
  /** The lights step: the room's lights were changed and not confirmed yet. */
  hasUnconfirmedEdits?(): boolean;
  /** Leaving with unconfirmed lights: asks first and runs `action` after the answer; true: the leaving waits for it. */
  guardLeave?(action: () => void): boolean;
}

/** A frame on the plan: [x0, y0, x1, y1] in metres, x0 ≤ x1 and y0 ≤ y1. */
export type PlanBox = [number, number, number, number];

/** "Plan" (modes/rooms.ts): rooms, walls, windows and doors, and the first guided steps. */
export interface RoomsMode extends EditorMode {
  id: 'rooms';
  setTool(tool: RoomTool): void;
  tool(): RoomTool;
  /** The guided step the rooms mode is on; null: none. */
  wizardPhase(): RoomsWizardPhase | null;
  /** Jumps to a guided step (furniture and lights go to their modes); null: ends the rooms mode's steps. */
  wizardAt(at: RoomsWizardPhase | 'furniture' | 'lights' | null): void;
  closeHint(): boolean;
  ctxKey(): string;
  status(): string;
  dblclick(e: MouseEvent, p: Point): void;
  flipCut(): void;
  /** The outline (or a room) from the keyboard: its width and depth are typed instead of two clicks. */
  typeOutline(): void;
  tintRoom(): string | null;
  unnamed(room: Room): boolean;
  unnamedZone(room: Room): boolean;
}

/** "Furniture" (modes/furniture.ts): the catalog and the items on the plan. */
export interface FurnitureMode extends EditorMode {
  id: 'furniture';
  leave(): void;
  status(): string;
  wizardOn(): boolean;
}

/** "Lights" (modes/lights.ts): HA lamps placed on the plan, and the lights step. */
export interface LightsMode extends EditorMode {
  id: 'lights';
  leave(): void;
  wizardOn(): boolean;
  /** The lamp the step asks about now; null: none. */
  asking(): PlanLight | null;
  ctxKey(): string;
  ctxPin(): string | null;
  /** Turns the lights step on. */
  startWizard(): void;
  hasUnconfirmedEdits(): boolean;
  guardLeave(action: () => void): boolean;
  /** For browser tests: a strip's sections and their ends. */
  stripInfo(id: string): unknown;
}

/** "Devices" (modes/devices.ts, D-048): air conditioners, curtains, door and window sensors in the model. */
export interface DevicesMode extends EditorMode {
  id: 'devices';
  leave(): void;
  closeHint(): boolean;
  wizardOn(): boolean;
  /** HA has a device this mode can place in a room on the plan. */
  available(): boolean;
  /** For browser tests: the device waiting for a click on the plan. */
  placing(): HaDevice | null;
  /** For the guided question: how many of each the model can show. */
  counts(): {ac: number; cover: number; contact: number};
  /** Starts the devices step: places what it can, then the mode. */
  begin(): void;
}

/** "Sensors" (modes/sensors.ts, D-033): readings on the walls, and the home view for the card. */
export interface SensorsMode extends EditorMode {
  id: 'sensors';
  leave(): void;
  status(): string;
  wizardOn(): boolean;
  /** The step asks for the home view first. */
  needView(): boolean;
  /** There are readings to show (placed, recommended or left without a room). */
  available(): boolean;
  /** Starts the sensors step: the recommended readings when the walls are empty, then the mode. */
  begin(): void;
  /** For browser tests: the labels' hit areas on the plan. */
  hits(): unknown[];
}

/** The modes by id (ed.modes). */
export interface EditorModes {
  rooms: RoomsMode;
  furniture: FurnitureMode;
  lights: LightsMode;
  devices: DevicesMode;
  sensors: SensorsMode;
}

// ---------- versions (app.ts over versions.ts) ----------

/** The plan's versions (ed.versions: app.ts over versions.ts createVersions). */
export interface EditorVersions {
  /** Newest first. */
  list(): PlanVersion[];
  /** The open project's versions are read. */
  ready(): Promise<void>;
  /** Another project: its versions. */
  open(planId: string | undefined): Promise<void>;
  /** Keeps the plan as it is now (an empty plan: nothing); null: the same as the latest, or another project. */
  mark(kind: VersionKind, what?: string | null, o?: {at?: number | null}): Promise<PlanVersion | null>;
  /** After an edit: keeps one when 10 minutes have passed. */
  tick(): void;
}

// ---------- the guided path (wizard-path.ts) ----------

/** Where the guided path is: a step, or 'fin' (the summary). */
export type PathStep = OnboardingStepId | 'fin';

/** A step's state on the path strip; 'not_started' is never saved. */
export type PathStepStatus = OnboardingStatus | 'not_started';

// ---------- the start screen and the plan tools (flows.ts) ----------

/** The start screen, the address, the photo and the plan tools (flows.ts createFlows). */
export interface EditorFlows {
  showStart(o: {canContinue: boolean}): void;
  hideStart(): void;
  /** Shows the AI build's card on the start screen; setup fills its button. */
  offerAi(setup: (button: HTMLElement) => void): void;
  /** Writes the page into the address (once for several changes). */
  syncRoute(): void;
  /** Opens the file picker for a plan photo. */
  pickUnderlay(): void;
  /** The "back to examples" button follows whether the plan is an example. */
  syncExample(): void;
  /** Keeps the open plan aside before a new one replaces it; false: nothing to keep. */
  keepPrev(): Promise<boolean>;
  /** "Restore previous plan": swaps the open plan and the one kept aside. */
  swapPrev(): Promise<void>;
  hasPrev(): boolean;
  /** The mode and guided step this plan had last time. */
  resume(): void;
  /** The area dialog (D-038). */
  askArea(): void;
  /** Scale from a wall: two clicks on the photo and a length; step: as a guided step. */
  calibrate(o?: {step?: boolean}): void;
  rotatePlan(): void;
  /** The photo's frame: move, rotate, scale. */
  moveUnderlay(): void;
  /** Puts the home on the Home Twin dashboard in HA, or opens it. */
  addBoard(): Promise<void>;
}

// ---------- the step hint (coach.ts) ----------

/** What the screen layout tells the hint (app.ts sets it): px from the work area's top-left. */
export interface CoachEnv {
  /** The part free for the card. */
  free(): {l: number; r: number; t: number; b: number};
  /** Where the card goes with no area: at the bottom above the toolbar. */
  home(w: number, h: number): {x: number; y: number};
  /** What the card must not cover; null: that one is not shown. */
  avoid(): Array<ScreenRect | null | undefined>;
}

// ---------- the editor ----------

/** How the plan is saved in Home Assistant (ha-app.ts ed.remote). */
export type RemoteSaveState = 'saved' | 'offline' | 'conflict';

/** The fit of the plan into the free part of the screen (ed.fit). */
export interface FitOptions {
  /** Leaves room for the step card when it lands over the area. */
  card?: boolean;
  /** The margin, px (none: 60 round points, 24 round the plan). */
  pad?: number;
}

/** Tutorial hints shown in this browser (UiState.hints). */
export interface EditorHints {
  count(key: string): number;
  bump(key: string): void;
  /** Marks it shown n times (none: 99, never again). */
  done(key: string, n?: number): void;
}

/** The guided steps per project (UiState.wiz). */
export interface EditorWizardStore {
  get(planId: string | undefined): WizardProgress | null;
  /** null: the project has no step on; the last 10 projects are kept. */
  set(planId: string | undefined, progress: WizardProgress | null): void;
}

/** The editor (app.ts createApp): the plan, its views, the modes and everything they share. */
export interface Editor {
  // ---------- the plan ----------
  plan: Plan;
  sel: Selection;
  /** Another plan (a project, a file, an example): history, versions and the view start anew; fit (none: true): whole. */
  setPlan(plan: PlanInput, o?: {fit?: boolean}): void;
  /** Restores a version as an edit (⌘Z brings it back); the photo's placement when it is the same photo. */
  applyPlan(plan: PlanInput, photo?: UnderlaySnapshot | null): void;
  /** An edit is done: a history step, the version tick, the views. */
  commit(): void;
  /** Changes the current history step instead of adding one. */
  amend(): void;
  undo(): void;
  redo(): void;
  /** Validation, the problems badge, the plan drawn, and the 3D in the next frame. */
  update(): void;
  /** The problems badge at the bottom of the plan. */
  status(): void;
  /** Redraws the plan canvas and what lies over it. */
  draw(): void;
  /** Takes room names from HA areas and drops links to areas that are gone; true: the plan changed. */
  syncAreas(): boolean;
  /** Problems that keep the plan from being built in 3D. */
  errors: PlanProblem[];
  /** Furniture that does not fit: item id → why. */
  conflicts: Map<string, string>;
  /** Openings that do not fit their wall. */
  hidden: number;
  /** The walls as the plan draws them (null: not built); none before the first build. */
  walls2d?: MultiPolygon | null;
  rails2d?: WallBand[] | null;
  glass2d?: GlassRail[] | null;
  /** The readings on the walls; none before the first update. */
  spots?: PlacedSensor[];

  // ---------- Home Assistant ----------
  ha: HaLayer;
  /** An HA area's name; an id HA does not have (or no id) comes back as it is. */
  areaName<AreaId extends string | null | undefined>(areaId: AreaId): string | AreaId;
  /** The area is a room or a room's part on the plan. */
  areaOnPlan(areaId: string): boolean;
  /** The lamp waits for its room: its area is not on the plan yet (wizard-state.ts). */
  lampWaits(light: PlanLight): boolean;
  /** Area ids ('' : no area) in the order of the plan's rooms, then no area, then areas not on the plan. */
  sortAreas(areas: Iterable<string>): string[];
  sensorCtx(): SensorContext;
  sensorSpots(): PlacedSensor[];
  /** ha-app.ts: how the plan is saved in HA; none: in this browser. */
  remote?(): RemoteSaveState;

  // ---------- views and layout ----------
  /** The plan canvas. */
  v: PlanView2d;
  /** The 3D view. */
  view: SceneView;
  /** How a view is shown now. */
  role(pane: Pane): PaneRole;
  setMain(pane: Pane): void;
  /** Swaps the plan and 3D. */
  swap(): void;
  /** The plan comes back from the small window fitted whole, not at its old zoom. */
  forgetView(): void;
  /** Fits the points (none: the whole plan) into the part of the screen no panel covers. */
  fit(points?: Point[], o?: FitOptions): void;
  /** The lights step: the 3D window's resize corner may pulse. */
  pipHint(on: boolean): void;
  sideOpen(): boolean;
  applySide(): void;
  toggleSide(): void;
  /** The side panel's title and the count beside it. */
  sideHead(title: string, count?: string): void;
  /** Fills the panel above the selection; null: hides it. */
  showCtx(nodes: HTMLElement[] | null): void;
  themeName(): 'light' | 'dark';
  applyTheme(): void;
  setTheme(theme: NonNullable<UiState['theme']>): void;
  /** Night in 3D now; null only before the first check, which runs while the editor is built. */
  night(): boolean | null;
  dayMode(): DayNightMode;
  /** Steps auto → day → night. */
  toggleNight(): void;
  reducedMotion(): boolean;
  /** Preview (D-047): 3D full screen with the home panel. */
  look(): boolean;
  setLook(on: boolean): void;
  /** The AI build's review: one view alone, full screen, without the editor's tools; null: the editor as usual. */
  bare(): Pane | null;
  /** right, bottom: px the review's own panel covers. */
  setBare(view: Pane | null, insets?: {right?: number; bottom?: number}): void;
  /** The current 3D view becomes the home view; quiet: no message. */
  saveView(o?: {quiet?: boolean}): void;
  /** The view step's text: what the 3D shows now and what to do. */
  viewTip(): {short: string; full: string};
  /** The view step has something to save ("Save view" pulses). */
  viewReady(): boolean;
  /** "Save view" buttons and the "Saved" mark. */
  syncSave(): void;
  /** The wall thickness menus follow the plan. */
  syncSettings(): void;
  /** The user's settings that are not the plan's. */
  prefs: {readonly wallEach: boolean};
  /** The plan's snap grid (the "Grid" checkbox). */
  grid: boolean;
  /** ?debug in the address: the 3D build time goes to the console. */
  debug: boolean;
  showKeys(): void;
  showVersions(): {close(): void};

  // ---------- modes, tools and the pointer ----------
  modes: EditorModes;
  /** The mode on now. */
  mode: EditorMode;
  setMode(id: ModeId): void;
  /** Selects one thing by id (replacing the selection). */
  select(kind: SelectKind, id: string): void;
  tool: EditorTool;
  /** The hand tool is on. */
  hand: boolean;
  setTool(tool: EditorTool): void;
  /** For the bar's buttons: the active one again goes back to select. */
  toggleTool(tool: EditorTool): void;
  /** A modal tool ended by itself: back to select if it was on. */
  toolDone(tool: EditorTool): void;
  syncTools(): void;
  /** The "Select" button for a mode's bottom bar. */
  selectButton(): HTMLElement;
  refreshCursor(): void;
  /** Drops the drag in progress and restores the plan from before it; false: there was none. */
  cancelDrag(): boolean;
  drag: EditorDrag | null;
  capture: EditorCapture | null;
  guides: PlanGuide[];
  /** The room under the pointer in the rooms mode, and the item in the furniture mode. */
  hover: string | null;
  furnHover?: string | null;
  /** The field on the plan at canvas point (x, y), filled with value; ok gets a number (a length: metres) or text. */
  ask(
    x: number,
    y: number,
    label: string,
    value: string | number | undefined,
    options: AskNumberOptions,
  ): void;
  ask(
    x: number,
    y: number,
    label: string,
    value: string | number | undefined,
    options?: AskTextOptions,
  ): void;
  /** The 2D handle that rotates the plan with its photo (flows.ts). */
  knob?: {draw(): void};

  // ---------- the step card and the guided path ----------
  /** A hint on the card (none: the current step, or nothing). */
  banner(text?: string | null, buttons?: BannerItem[], aim?: Aim | null, o?: StepOptions): void;
  /** A guided step that stays until its button; null: none. */
  step(text: string | null, buttons?: BannerItem[], aim?: Aim | null, o?: WizardStepOptions): void;
  stepNow(): WizardStep | null;
  /** Puts the keyboard focus on the card's main button (the step's way on). */
  focusStep(): void;
  /** "Exit setup" and "Back" for a step's card, and a step's buttons with them. */
  exitBtn(): BannerButton;
  backBtn(): BannerButton;
  wizBtns(buttons?: BannerItem[]): BannerItem[];
  exitWizard(): void;
  aim: EditorAim;
  path: WizardPath;
  hints: EditorHints;
  wizard: EditorWizardStore;

  // ---------- history and storage ----------
  history: PlanHistory;
  versions: EditorVersions;
  underlay: Underlay;

  // ---------- added after app.ts builds it ----------
  // flows, askArea and showStart are set by boot.ts (through flows.ts) before any screen, button or step can use them; only
  // the editor's own updates while app.ts builds it run without them, and those ask with `?.`.
  /** boot.ts: the start screen and the plan tools. */
  flows: EditorFlows;
  /** boot.ts: catalog item thumbnails as data URLs, by catalog id, once the models are loaded. */
  thumbs?: Record<string, string>;
  /** flows.ts: an example from the address is about to replace this plan, so the 3D does not build it. */
  hold?: boolean;
  /** flows.ts: the area dialog, and the start screen with "Continue". */
  askArea(): void;
  showStart(): void;
  /** flows.ts: sizes from the area in the documents (D-038), by the first rectangle or the rooms; the factor, 0: none. */
  fitArea?(by: 'rect' | 'rooms', o?: {commit?: boolean; tell?: boolean}): number;
}

// ---------- Preview (look.ts) ----------

/** What Preview (look.ts createLook) reads of the editor; the dashboard card (card-main.ts) hands it its own. */
export type LookEditor = Pick<
  Editor,
  'plan' | 'ha' | 'view' | 'areaName' | 'sensorCtx' | 'night' | 'dayMode' | 'toggleNight' | 'themeName'
> & {
  /** Saves the plan after Preview changed its scenes or its dashboard layout. */
  history: {save(plan: Plan): void};
};

/** Preview's panel (look.ts createLook). */
export interface LookPanel {
  open(): void;
  close(): void;
  /** Esc: closes what is open in the panel; true: there was something. */
  esc(): boolean;
  /** What the panel covers of the 3D, px. */
  insets(): {right: number; bottom: number};
  width(): number;
  refresh(): void;
  /** A room's screen, as a click on its chip. */
  room(id: string): void;
}
