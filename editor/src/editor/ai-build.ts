// The AI build (the paid "build my home" service; D-063, D-072, D-073, D-074): screens of its own, apart from the editor's tools.
//   start    — the start screen's card: "Build with AI", or the build this browser follows, live (aiStartCard)
//   upload   — the plan photo and a video of the home; the build starts
//   progress — what the build does now, as it happens: each stage with a line on what it works on and a bar, the rooms on the
//              plan as they are read, each room of the video with the furniture found there, the pieces being made, time left
//   review   — the finished home alone, full screen (ai-review.js), opened by itself when it is ready: pins where something is
//              wrong, words, "All right". Confirmed, the home opens in the editor, theirs to change.
// The address names the page: ?ai=new the upload, ?build=<id> a build; a sign-in or the checkout comes back to it.
// The service is private; the editor talks to its API only (locally the harness's tools/build-server.ts serves this page):
//   GET  <api>/api/health                         answers: the start screen offers the AI build
//   POST <api>/api/builds                         ← multipart: plan, video… → {id}; 401 SIGNED_OUT, 402 BALANCE_EMPTY
//   GET  <api>/api/builds/<id>                    the status: steps, rooms, what the calls found so far (live), time left
//   GET  <api>/api/builds/<id>/plan | home        the plan as read; the home
//   GET  <api>/api/builds/<id>/photo | shot | frame/<room>   the plan photo; the home in 3D; a frame of a room
//   POST <api>/api/builds/<id>/pin-photo?kind=view|photo   a pin's picture (its bytes) → {file}
//   GET  <api>/api/builds/<id>/owner/<file>       a pin's picture
//   POST <api>/api/builds/<id>/answer             {at: 'final', action: 'confirm' | 'correct', text?, pins?}
//   POST <api>/api/builds/<id>/resume             start a stopped build again
//   POST <api>/api/builds/<id>/feedback           {round, n}: a pin that came back goes to the developer
// Accounts (D-088; ai-account.ts): a build is started by a signed-in account with something left of what it bought, is
// charged to it, and is shown only to it (another browser gets 404, as for a build that is not there). A build whose balance
// runs out waits (paused: 'balance') and goes on after a top-up; one whose payments service does not answer waits too
// (paused: 'payments') and goes on by itself. Without the payments service (local work) there are no accounts.
import {t, N, getLang} from '../i18n/i18n.ts';
import {el, esc, find} from './ui.ts';
import {icon} from './icons.ts';
import {idb} from './idb.ts';
import {readPlan} from '../core/plan-file.ts';
import {emptyPlan} from '../core/plan.ts';
import {kindName, localRoomName, numberAlike} from '../core/overview.ts';
import {byId} from '../core/catalog.ts';
import {openReview} from './ai-review.ts';
import {changeCount, pinsToSend, pinsToRetry, refreshRetries} from './ai-pins.ts';
import type {Pin, PinNotes, PinRetry, PinRound} from './ai-pins.ts';
import {
  accountOffer,
  balanceMeter,
  buyLabel,
  checkoutUrl,
  claimPayment,
  currentAccount,
  forgetOldWallet,
  isSignedOut,
  pathOf,
  readReturn,
  refusalText,
  signOut,
  testTopUp,
} from './ai-account.ts';
import type {Account, Offer} from './ai-account.ts';
import {accountBar, openSignIn, pausedCard} from './ai-account-ui.ts';
import type {AccountBar, SignInReason, SignInSheet} from './ai-account-ui.ts';
import type {Outline, Plan} from '../core/types.ts';
import type {Editor, EditorFlows} from './editor-types.ts';

// ---------- what the service answers ----------
// The service is ours (the harness's build server writes its answers as the API above says): its answers are read as these
// types, not checked field by field; the code minds the fields that can be missing, as it always did.

/**
 * A step of the build as its status lists it (the harness's tools/steps.ts): its state, its usual time and the time it still
 * needs.
 */
interface BuildStep {
  name: string;
  state: string;
  typical?: number;
  left?: number;
}

/**
 * A room of the video: its name on the plan once matched, else its guess in English; left out (not on the plan), waiting for
 * the plan, done; it has a frame to show; how many pieces were found there.
 */
interface VideoRoom {
  id: string;
  name?: string;
  guess?: string;
  left?: boolean;
  waits?: boolean;
  done?: boolean;
  frame?: boolean;
  pieces?: number;
}

/** A piece of furniture as the build lists it: its catalog type or model, the call's words, its room, how it is made, its state. */
interface BuildPiece {
  id?: string;
  room?: string;
  type?: string;
  model?: string;
  label: string;
  how?: string;
  state?: string;
}

/** The plan call at work: its round (above 0: fixing what our code found), thinking or writing, the rooms and openings found. */
interface PlanCall {
  round: number;
  phase?: string;
  rooms: string[];
  openings?: number;
}

/** A room's call at work: thinking, writing or done, and the pieces written so far. */
interface RoomCall {
  phase?: string;
  pieces: BuildPiece[];
}

/** What the calls have found so far (live): the plan, each room's call, the pieces being made and made, the rooms checked. */
interface BuildLive {
  plan?: PlanCall;
  rooms?: Record<string, RoomCall>;
  making?: BuildPiece[];
  made?: BuildPiece[];
  work?: BuildPiece[];
  madeCount?: number;
  checking?: string[];
  checked?: string[];
}

/** A build's status (GET /api/builds/<id>). A status made here after a failure has only steps, rooms, has and the error. */
interface BuildStatus {
  id?: string;
  steps: BuildStep[];
  rooms: VideoRoom[];
  /** What the service has to show: the plan as read, the plan photo, the home in 3D. */
  has: {plan?: boolean; photo?: boolean; shot?: boolean};
  /** The checkpoint the build waits at ('final': the owner's review). */
  waiting?: string | null;
  revising?: boolean;
  alive?: boolean;
  error?: string;
  /** The error is in our code, not in the files. */
  ourCode?: boolean;
  /** The build waits: for a top-up ('balance'), or for the payments service to answer ('payments'). */
  paused?: 'balance' | 'payments' | null;
  /** Its home was opened. */
  finished?: boolean;
  /** Seconds left. */
  eta?: number | null;
  /** How far the whole build is, 0–1. */
  share?: number;
  live?: BuildLive;
  lastRound?: PinRound | null;
  rounds?: PinRound[];
}

/** A failed answer says why in {error}. */
interface ServiceError {
  error?: string;
}

/** What the owner sees as a stage, and its state now. */
interface Stage {
  key: 'plan' | 'rooms' | 'furniture' | 'assembly' | 'final';
  steps: string[];
  label: string;
  note: string;
}
type StageState = 'todo' | 'ask' | 'running' | 'done';

/** The plan as read: its outline and what it holds. */
interface PlanRead {
  svg: string;
  rooms: number;
  openings: number;
}

/** The owner's notes as this browser keeps them (saveNotes). */
interface SavedNotes {
  pins?: unknown;
  text?: string;
}

/** The files chosen for a build: the plan photo and the videos. */
interface ChosenFiles {
  plan: File | null;
  videos: File[];
}

/** The AI build over the editor (openAiBuild). */
export interface AiBuildScreen {
  close(): void;
}

// What went wrong, in the words of the Error that fetch, JSON or the service threw.
const messageOf = (error: unknown): string => (error as Error).message;
// A meter's bar is its one child (<i class="aib-meter"><i></i></i>).
const barOf = (meter: HTMLElement): HTMLElement => meter.firstChild as HTMLElement;
// The element an event is on: a click lands on an element.
const targetOf = (e: Event): Element => e.target as Element;

const POLL_MS = 2000;
const START_POLL_MS = 3000;
// The balance is asked again every this many polls of a build's status (it changes as the build spends), and at once
// when the build starts or stops waiting.
const POLLS_PER_ACCOUNT = 5;
// The upload page asks the account again this often while the payments service does not answer.
const ACCOUNT_RETRY_MS = 10_000;
// The upload page's address: ?ai=new.
const UPLOAD_PARAM = 'ai';
const UPLOAD_VALUE = 'new';
const NOTES = 'home-twin-editor:ai-notes:';
// The build this browser started or opened last: the start screen shows how it goes until its home is opened.
const FOLLOWED = 'home-twin-editor:ai-build';
// A step works for minutes between the things it finds: meanwhile what it does is named in turn, a new line this often.
const PHRASE_SECONDS = 5;

// What the owner sees as stages; each is a few of the build's own steps (the harness's tools/steps.ts). The plan runs beside
// the rooms, so two stages can run at once.
const STAGES: Stage[] = [
  {
    key: 'plan',
    steps: ['plan'],
    label: N('Reading the plan'),
    note: N('Rooms, doors and windows from the photo'),
  },
  {
    key: 'rooms',
    steps: ['split', 'frames', 'recon', 'rooms'],
    label: N('Rooms from the video'),
    note: N('The size of each room and what stands there'),
  },
  {
    key: 'furniture',
    steps: ['bind', 'ours', 'parts', 'colours'],
    label: N('Furniture'),
    note: N('The shape and colour of each piece'),
  },
  {
    key: 'assembly',
    steps: ['assemble', 'check'],
    label: N('Assembly'),
    note: N('Everything in its place, then checked'),
  },
  {
    key: 'final',
    steps: ['shot', 'report'],
    label: N('Final check'),
    note: N('A last look over the whole home'),
  },
];
// The steps that have lines of their own, and the plan call fixing its plan.
type PhraseStep =
  | 'plan'
  | 'planFix'
  | 'split'
  | 'frames'
  | 'recon'
  | 'rooms'
  | 'bind'
  | 'ours'
  | 'parts'
  | 'colours'
  | 'assemble'
  | 'check'
  | 'revise'
  | 'shot'
  | 'report';
// What each step does while it has nothing new to show, named in turn: each line true of that step (a dry word now and then).
const PHRASES: Record<PhraseStep, string[]> = {
  plan: [
    N('Looking at the drawing'),
    N('Finding the outer walls'),
    N('Finding the rooms'),
    N('Finding the doors and windows'),
    N('Seeing which way the doors open'),
    N('Reading the written sizes'),
    N('Squinting at the small print'),
    N('Working out the scale'),
  ],
  // The plan call again, with what our code found wrong in its plan.
  planFix: [
    N('Checking that the walls meet'),
    N('Setting each window on its wall'),
    N('Double-checking the plan'),
  ],
  split: [
    N('Finding the rooms in your video'),
    N('Watching each second of the video'),
    N('Noting where each room ends'),
    N('Leaving the street and stairs out'),
    N('Telling the hallway from the kitchen'),
    N('No skipping: every second counts'),
  ],
  frames: [
    N('Picking the sharpest frames'),
    N('Dropping blurred and dark frames'),
    N('Blurring faces in every frame'),
    N('A few good frames for each room'),
    N('Your best angles only'),
  ],
  recon: [
    N('Measuring the rooms in 3D'),
    N('Rebuilding each room in 3D'),
    N('Working out where the camera stood'),
    N("Working out your lens's angle"),
    N('No tape measure: we use the frames'),
  ],
  rooms: [
    N('Looking at each room'),
    N('Lettering the walls A to D'),
    N('Noting the doors and windows'),
    N('Noting the floor and the walls'),
    N('Listing what stands where'),
    N('Sizing up the furniture'),
    N('Counting the chairs'),
  ],
  bind: [
    N('Matching the rooms to the plan'),
    N('Finding each room on the plan'),
    N('Matching walls by doors and windows'),
    N('Turning each room the right way'),
    N('The video meets the drawing'),
  ],
  ours: [
    N('Choosing the furniture'),
    N('Looking for each piece in our catalog'),
    N('Comparing shapes with our models'),
    N('Finding look-alikes'),
  ],
  parts: [
    N('Making the rest from parts'),
    N('Comparing each render to the frame'),
    N('Fixing what does not look alike'),
    N('Board by board, leg by leg'),
  ],
  colours: [
    N('Measuring the colours'),
    N('Taking the colours from the frames'),
    N('Telling beige from cream'),
  ],
  assemble: [
    N('Putting everything in its place'),
    N('Setting each piece along its wall'),
    N('Placing things as the video shows'),
    N('Keeping the doorways clear'),
    N('Moving furniture, no movers needed'),
  ],
  check: [
    N('Second look at every room'),
    N('Drawing each room from above'),
    N('Comparing the drawing with the video'),
    N('Moving what stands out of place'),
    N('Checking the fixes landed'),
    N('Picking on the details'),
  ],
  revise: [
    N('Making your changes'),
    N('Reading your pins'),
    N('Moving things as you asked'),
    N('Checking the changes landed'),
  ],
  shot: [N('Taking pictures of your home'), N('Opening your home in the editor'), N('Finding a good angle')],
  report: [
    N('Final touches'),
    N('Checking the whole home once more'),
    N('Checking nothing blocks a doorway'),
    N('Counting what was built'),
  ],
};
// Under a room's card while its call works, each card in its own turn.
const ROOM_PHRASES = [N('Looking…'), N('Walls, doors, windows…'), N('Listing the furniture…')];

// A room of the video: its name on the plan once matched (read off the plan, often in English), else what its guess in English
// ("rear terrace") is — in the owner's language either way.
const roomName = (room: Pick<VideoRoom, 'name' | 'guess'>): string =>
  room.name ? (getLang() === 'en' ? room.name : localRoomName(room.name, t)) : kindName(room.guess, t);

// Each room of the video by its id, named (roomName); two that would read the same are numbered in video order.
// Looked up by a room that may be missing (an id the status does not list yet).
function videoRoomNames(rooms: VideoRoom[]): Map<string | undefined, string> {
  const names = numberAlike(rooms.map(roomName));
  return new Map(rooms.map((room, index) => [room.id, names[index]]));
}

// A piece of furniture as the build lists it ({type, model?, label}): our catalog's name in the owner's language when the room
// call matched it to one, else the call's own words.
function pieceName(piece: BuildPiece): string {
  const model = byId(piece.type) || (piece.model ? byId(piece.model) : null);
  return model ? t(model.name).replace(/­/g, '') : piece.label;
}

/** Whether the AI build's service answers here: only then does the start screen offer it. */
export async function aiService(api = ''): Promise<boolean> {
  try {
    const res = await fetch(`${api}/api/health`, {cache: 'no-store'});
    return res.ok && ((await res.json()) as {ok?: unknown}).ok === true;
  } catch {
    return false;
  }
}

/** Whether the AI build has accounts here and this browser is signed out (an account's build is then not shown to it). */
async function signedOutWithAccounts(api: string): Promise<boolean> {
  try {
    const offer = await accountOffer(api);
    if (!offer) return false;
    return !(await currentAccount(api));
  } catch {
    return false;
  }
}

// ---------- the files chosen for a build, kept while the browser is away ----------

// A provider's sign-in and the checkout leave the page: the files chosen are kept here meanwhile, and are back on the upload
// page when the browser returns.
const CHOSEN_FILES = 'ai-build:chosen-files';

/** The files chosen, kept until the upload page opens again; nothing is kept when none are chosen. */
async function keepChosen(files: ChosenFiles): Promise<void> {
  if (!files.plan && !files.videos.length) return;
  await idb('put', CHOSEN_FILES, {plan: files.plan, videos: files.videos});
}

/** The files kept before the browser left, taken out of the store (they are kept only once); null when there are none. */
async function takeChosen(): Promise<ChosenFiles | null> {
  try {
    const saved = await idb('get', CHOSEN_FILES);
    if (!saved) return null;
    await idb('del', CHOSEN_FILES);
    const fields = saved as {plan?: unknown; videos?: unknown};
    const plan = fields.plan instanceof File ? fields.plan : null;
    const videos = Array.isArray(fields.videos) ? fields.videos.filter(video => video instanceof File) : [];
    return {plan, videos};
  } catch {
    return null;
  }
}

// ---------- the build this browser follows ----------

function followedBuild(): string | null {
  try {
    return localStorage.getItem(FOLLOWED);
  } catch {
    return null;
  }
}

function follow(id: string | null): void {
  try {
    if (id) localStorage.setItem(FOLLOWED, id);
    else localStorage.removeItem(FOLLOWED);
  } catch {}
}

// ---------- reading a status ----------

function stageState(status: BuildStatus | null | undefined, stage: Stage): StageState {
  if (!status?.steps?.length) return 'todo';
  if (status.waiting === 'final' && stage.key === 'final') return 'ask';
  if (status.revising && (stage.key === 'assembly' || stage.key === 'final'))
    return stage.key === 'assembly' ? 'running' : 'todo';
  const states = stage.steps.map(name => status.steps.find(x => x.name === name)?.state || 'todo');
  if (states.some(x => x === 'running')) return 'running';
  if (states.every(x => x === 'done')) return 'done';
  if (states.some(x => x === 'done') && status.alive && !status.error) return 'running';
  return 'todo';
}

// The stage the build is busiest with: the last one running (the plan runs beside the rooms).
function currentStage(status: BuildStatus): Stage {
  const running = STAGES.filter(stage => stageState(status, stage) === 'running');
  // STAGES is not empty.
  return running.at(-1) || STAGES.find(stage => stageState(status, stage) !== 'done') || STAGES.at(-1)!;
}

// How far a stage is, by its steps' usual time and the time they still need (the build server's estimate).
function stageShare(status: BuildStatus, stage: Stage): number {
  const steps = status.steps.filter(x => stage.steps.includes(x.name));
  const typical = steps.reduce((sum, x) => sum + (x.typical || 0), 0);
  const left = steps.reduce((sum, x) => sum + (x.left || 0), 0);
  return typical ? Math.max(0.03, Math.min(0.97, 1 - left / typical)) : 0;
}

function etaText(seconds: number | null | undefined): string {
  if (seconds == null) return '';
  if (seconds < 40) return t('Almost done');
  const minutes = Math.max(1, Math.round(seconds / 60));
  return t('About {0, plural, one {# minute} other {# minutes}} left', minutes);
}

const percent = (share: number): string => `${Math.round(Math.max(0, Math.min(1, share)) * 100)}%`;

/** A small outline of the plan's rooms, north up. */
function planSvg(plan: Plan): string {
  const rings = plan.rooms.filter(room => !room.solid).map(room => room.polygon);
  const xs = rings.flat().map(p => p[0]);
  const ys = rings.flat().map(p => p[1]);
  const x0 = Math.min(...xs);
  const y1 = Math.max(...ys);
  const w = Math.max(...xs) - x0;
  const h = y1 - Math.min(...ys);
  const d = (ring: Outline): string =>
    'M' + ring.map(([x, y]) => `${(x - x0).toFixed(2)} ${(y1 - y).toFixed(2)}`).join('L') + 'Z';
  return `<svg viewBox="-.3 -.3 ${(w + 0.6).toFixed(2)} ${(h + 0.6).toFixed(2)}" aria-hidden="true">${rings.map(r => `<path d="${d(r)}"/>`).join('')}</svg>`;
}

// ---------- the start screen's card ----------

/**
 * The start screen's AI card (flows.js offerAi): "Build with AI", or — while a build this browser follows is on its way — that
 * build: the stage it is at, the time left and a bar, kept up to date while the start screen is shown. Opens the build, or
 * the upload for a new one.
 */
export function aiStartCard(ed: Editor, card: HTMLElement, {api = ''}: {api?: string} = {}): void {
  const idle = card.innerHTML;
  const another = el(
    `<button class="aib-start-new" hidden>${icon('plus', 18)}${esc(t('Start another build'))}</button>`,
  );
  card.after(another);
  let shown: BuildStatus | null = null;
  let timer: ReturnType<typeof setTimeout> | number = 0;

  const open = (id: string | null): AiBuildScreen => openAiBuild(ed, {api, id});
  card.onclick = () => open(shown ? followedBuild() : null);
  another.onclick = () => {
    follow(null);
    show(null);
    open(null);
  };

  function show(status: BuildStatus | null): void {
    shown = status;
    another.hidden = !status;
    card.classList.toggle('aib-following', !!status);
    if (!status) {
      if (card.dataset.state) card.innerHTML = idle;
      delete card.dataset.state;
      return;
    }
    const stopped = !!status.error || !status.alive;
    const ready = status.waiting === 'final';
    const state = ready ? 'ready' : stopped ? 'stopped' : 'running';
    const title = ready
      ? t('Your home is ready')
      : stopped
        ? t('The build stopped')
        : status.revising
          ? t('Changing your home…')
          : t('Your home is being built');
    const note = ready
      ? t('Look at it in 3D and say what to change.')
      : stopped
        ? t('Open it to try again.')
        : [t(currentStage(status).label), etaText(status.eta)].filter(Boolean).join(' · ');
    // The service's status names its build (status.id).
    const badge =
      ready && status.has?.shot
        ? `<img src="${api}/api/builds/${encodeURIComponent(status.id as string)}/shot" alt="">`
        : ready
          ? icon('house', 20)
          : stopped
            ? icon('alert', 20)
            : '<i class="aib-start-spin"></i>';
    if (card.dataset.state !== state) {
      card.dataset.state = state;
      card.innerHTML = `<span class="ci aib-start-badge"></span><b></b><span class="aib-start-note"></span><i class="aib-start-meter"><i></i></i>${icon('right', 18)}`;
      find(card, '.aib-start-badge').innerHTML = badge;
    }
    find(card, 'b').textContent = title;
    find(card, '.aib-start-note').textContent = note;
    const meter = find(card, '.aib-start-meter');
    meter.hidden = ready || stopped;
    barOf(meter).style.width = percent(status.share || 0);
  }

  async function refresh(): Promise<void> {
    clearTimeout(timer);
    timer = setTimeout(refresh, START_POLL_MS);
    const id = followedBuild();
    const onScreen = !card.closest<HTMLElement>('#start')?.hidden && !document.hidden;
    if (!onScreen) return;
    if (!id) return show(null);
    try {
      const res = await fetch(`${api}/api/builds/${encodeURIComponent(id)}`, {cache: 'no-store'});
      if (res.status === 404) {
        // An account's build is not shown while this browser is signed out: it stays followed, and shows again once the
        // owner signs in.
        if (!(await signedOutWithAccounts(api))) follow(null);
        return show(null);
      }
      if (!res.ok) return;
      const status = (await res.json()) as BuildStatus;
      // Its home was opened: nothing more to follow.
      if (status.finished) {
        follow(null);
        return show(null);
      }
      show(status);
    } catch {} // no connection now: the card stays as it was
  }
  refresh();
  // Back on the start screen (from a build's page): up to date at once.
  new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) refresh();
  }).observe(card);
}

/**
 * The AI build the address asks for: ?build=<id> opens that build's progress, ?ai=new the upload. Back from the checkout
 * (?payment_id=…), the payment is counted first; back from a provider's sign-in that did not go through (?signin=failed),
 * the sign-in opens again with why. What the address brought back is taken off it, so a reload does not read it again.
 */
export async function openAiFromAddress(
  ed: Editor,
  {api = ''}: {api?: string} = {},
): Promise<AiBuildScreen | null> {
  forgetOldWallet();
  const back = readReturn(location.href);
  if (back.found) history.replaceState(history.state, '', back.clean);
  const params = new URLSearchParams(location.search);
  const id = params.get('build');
  const upload = params.get(UPLOAD_PARAM) === UPLOAD_VALUE;
  if (!id && !upload && !back.found) return null;
  let notice: string | null = null;
  let claimed: Account | null = null;
  const paymentFailed = !!back.paymentStatus && back.paymentStatus !== 'succeeded';
  if (back.payment && paymentFailed) notice = t('The payment did not go through');
  else if (back.payment) {
    try {
      claimed = await claimPayment(api, back.payment);
    } catch (error) {
      notice = t('Could not check the payment: {0}', refusalText(error));
    }
  }
  const signInNotice = back.signIn === 'failed' ? t('Could not sign in. Try again or use your email.') : null;
  return openAiBuild(ed, {api, id, notice, account: claimed, signInNotice});
}

/** What openAiBuild is given besides the editor. */
export interface AiBuildOptions {
  api?: string;
  /** The build to follow; none: the upload for a new one. */
  id?: string | null;
  /** The start screen (flows.js): back to it, and the plan kept aside before a new one replaces it. */
  flows?: EditorFlows;
  /** A line for the owner on arrival (a payment that did not go through), on the account's place. */
  notice?: string | null;
  /** The account as the payment's claim just gave it: shown at once. */
  account?: Account | null;
  /** A provider's sign-in did not go through: the sign-in opens again, saying so. */
  signInNotice?: string | null;
}

/**
 * Opens the AI build over the editor: the upload screen, or a build's progress when its id is known (the page's ?build=<id>,
 * the start screen's card).
 */
export function openAiBuild(ed: Editor, options: AiBuildOptions = {}): AiBuildScreen {
  const {api = '', id = null, flows = ed.flows, notice = null, signInNotice = null} = options;
  const root = el(`<div class="aib"></div>`);
  document.body.append(root);
  flows?.hideStart();
  let buildId = id;
  let status: BuildStatus | null = null;
  let screen: 'upload' | 'progress' | 'review' | null = null;
  let review: {close(): void} | null = null;
  let timer: ReturnType<typeof setTimeout> | number = 0;
  let closed = false;
  // The checkpoint answered just now: until the build moves on, it does not count as waiting.
  let answered: string | null = null;
  // The finished home opens by itself once; after "back" the owner opens it from its card.
  let shownFinal = false;
  // The plan as read: its outline and what it holds, once the plan call is done.
  let planRead: PlanRead | null = null;
  // The files chosen on the upload page.
  let chosen: ChosenFiles = {plan: null, videos: []};
  // The build's own pages are asked for once it has its id.
  const base = (): string => `${api}/api/builds/${encodeURIComponent(buildId as string)}`;
  // The status the progress shows: it is drawn only once there is one (renderProgress stops before without it), and the
  // owner's buttons that lead to the review and the home come with one.
  const shown = (): BuildStatus => status as BuildStatus;
  if (buildId) follow(buildId);

  // ---------- the address and the editor underneath ----------

  // The address names the page shown: the upload, a build, or neither (the editor).
  function setAddress(page: 'upload' | {build: string} | null): void {
    const url = new URL(location.href);
    url.searchParams.delete('build');
    url.searchParams.delete(UPLOAD_PARAM);
    if (page === 'upload') url.searchParams.set(UPLOAD_PARAM, UPLOAD_VALUE);
    else if (page) url.searchParams.set('build', page.build);
    history.replaceState(history.state, '', url);
  }

  // ---------- the account (D-088) ----------

  // How a package comes and the sign-in ways; null where there are no accounts (local work) or before it is known.
  let offer: Offer | null = null;
  let account: Account | null = options.account || null;
  // The offer is asked once, when the service first answers it.
  let offerKnown = false;
  // Asked the service at least once: until then the button that starts a build waits.
  let accountKnown = false;
  // Why the account could not be asked (the payments service does not answer), in words.
  let accountTrouble: string | null = null;
  // A line for the owner on the account's place: why a top-up or a payment did not go through, a build that could not start.
  let accountLine: string | null = notice;
  // The build is not shown to this browser: signed out, or signed in with another account (the service answers 404 to both).
  let locked: 'signed-out' | 'other' | null = null;
  // The owner signed out here: the build's page does not ask them to sign in again by itself.
  let signedOutHere = false;
  let signInSheet: SignInSheet | null = null;
  let headBar: AccountBar | null = null;
  // The account's place in the review, above its send button (the review fills it with this page's renderReviewAccount).
  let reviewSlot: HTMLElement | null = null;
  // How many polls since the account was asked last: the balance is asked again every few.
  let pollsSinceAccount = 0;
  let pausedBefore: BuildStatus['paused'] = null;
  const accountReady = refreshAccount();

  async function refreshAccount(): Promise<void> {
    try {
      if (!offerKnown) {
        offer = await accountOffer(api);
        offerKnown = true;
      }
      account = offer ? await currentAccount(api) : null;
      accountTrouble = null;
    } catch (error) {
      accountTrouble = refusalText(error);
    }
    accountKnown = true;
    pollsSinceAccount = 0;
    renderAccount();
    // The upload page waits for the account; it is asked again until the service answers.
    if (accountTrouble && screen === 'upload')
      setTimeout(() => !closed && refreshAccount(), ACCOUNT_RETRY_MS);
  }

  // The account drawn on every place of the page shown.
  function renderAccount(): void {
    headBar?.update({offer, account});
    if (screen === 'upload') renderGo();
    if (screen === 'progress') renderProgress();
    if (reviewSlot) renderReviewAccount(reviewSlot);
  }

  // A new header for the page: its account part, drawn now and on every change (meter: the balance's bar beside it).
  function newHeadBar(meter: boolean): HTMLElement {
    headBar = accountBar({
      meter,
      onSignIn: () => askSignIn(screen === 'upload' ? 'build' : 'account'),
      onBuy: () => buy(null),
      onSignOut: signOutHere,
    });
    headBar.update({offer, account});
    return headBar.element;
  }

  function askSignIn(reason: SignInReason, line: string | null = null): void {
    if (!offer || signInSheet) return;
    signInSheet = openSignIn(root, {
      api,
      offer,
      reason,
      notice: line,
      returnPath: () => pathOf(location.href),
      beforeLeave: () => (screen === 'upload' ? keepChosen(chosen) : Promise.resolve()),
      onSignedIn: signedIn => {
        signInSheet = null;
        account = signedIn;
        accountLine = null;
        signedOutHere = false;
        renderAccount();
        if (locked) {
          locked = null;
          poll();
        }
      },
      onClose: () => {
        signInSheet = null;
      },
    });
  }

  function closeSignIn(): void {
    signInSheet?.close();
    signInSheet = null;
  }

  async function signOutHere(): Promise<void> {
    try {
      await signOut(api);
    } catch {} // signed out on this page either way: the next call asks again
    account = null;
    signedOutHere = true;
    if (screen === 'progress' || screen === 'review') lockOut('signed-out');
    renderAccount();
  }

  // One more package: at the provider's checkout, which comes back to this page; or free where packages are given for
  // testing. button — the one pressed, which says what happens meanwhile.
  async function buy(button: HTMLButtonElement | null): Promise<void> {
    if (!offer) return;
    if (!account) return askSignIn(screen === 'upload' ? 'build' : 'account');
    accountLine = null;
    if (button) button.disabled = true;
    try {
      if (offer.payments === 'dodo') {
        if (button) button.textContent = t('Opening the payment…');
        const url = await checkoutUrl(api, pathOf(location.href));
        // The files chosen come back with the page; a failure to keep them only loses the files.
        if (screen === 'upload') await keepChosen(chosen).catch(() => {});
        location.assign(url);
        return;
      }
      account = await testTopUp(api);
    } catch (error) {
      if (isSignedOut(error)) {
        account = null;
        askSignIn('account');
      } else if (offer.payments === 'dodo')
        accountLine = t('Could not open the payment: {0}', refusalText(error));
      else accountLine = t('Could not top up: {0}', refusalText(error));
    }
    renderAccount();
  }

  // The build answered 404: with accounts, it may be another account's, or this browser is signed out (the service says
  // the same to both). Asked of the account; the page then says which and offers the way in.
  async function explainMissing(): Promise<boolean> {
    await accountReady;
    if (!offer) return false;
    let who: Account | null = null;
    try {
      who = await currentAccount(api);
    } catch {
      return false;
    }
    account = who;
    lockOut(who ? 'other' : 'signed-out');
    return true;
  }

  // The build is not shown here: the page says why and stops asking until the owner signs in.
  function lockOut(why: 'signed-out' | 'other'): void {
    locked = why;
    clearTimeout(timer);
    closeReview();
    if (screen !== 'progress') showProgress();
    status = status || {steps: [], rooms: [], has: {}};
    renderAccount();
    // Arriving signed out by the build's link: the sign-in opens at once (not after signing out here).
    if (why === 'signed-out' && !signedOutHere) askSignIn('see');
  }

  // The account's place on the upload page, beside its button: the balance, or the package to buy first. Under them, on a
  // line of its own: why a build could not start, or a payment did not go through.
  function renderGo(): void {
    const slot = root.querySelector<HTMLElement>('.aib-go-account');
    const lineNode = root.querySelector<HTMLElement>('.aib-go-line');
    if (!slot || !lineNode) return;
    const balance = account?.balance;
    let slotHtml = '';
    if (offer && balance && !balance.empty) slotHtml = balanceMeter(balance);
    else if (offer && balance?.empty) {
      slotHtml = `<button class="primary" data-act="buy">${esc(buyLabel(offer))}</button>`;
    }
    slot.innerHTML = slotHtml;
    const line = accountLine || accountTrouble;
    lineNode.hidden = !line;
    lineNode.textContent = line || '';
    syncStart();
  }

  // The account's place in the review: the balance, and a top-up once it is used up (the changes wait for one).
  function renderReviewAccount(slot: HTMLElement): void {
    reviewSlot = slot;
    const balance = account?.balance;
    if (!offer || !balance) {
      slot.innerHTML = '';
      return;
    }
    const topUp = balance.empty
      ? `<button class="soft" data-act="top-up">${esc(buyLabel(offer, {topUp: true}))}</button>`
      : '';
    const line = accountLine ? `<small class="aib-wallet-err">${esc(accountLine)}</small>` : '';
    slot.innerHTML = balanceMeter(balance) + topUp + line;
    const button = slot.querySelector<HTMLButtonElement>('[data-act=top-up]');
    if (button) button.onclick = () => buy(button);
  }

  // The button that starts a build: on with a plan and a video, once the account is known and has something left (signed
  // out, it opens the sign-in).
  function syncStart(): void {
    const start = root.querySelector<HTMLButtonElement>('[data-act=start]');
    if (!start || start.dataset.sending) return;
    const haveFiles = !!chosen.plan && chosen.videos.length > 0;
    const accountReadyNow = accountKnown && !accountTrouble;
    const nothingLeft = !!offer && !!account?.balance.empty;
    start.disabled = !haveFiles || !accountReadyNow || nothingLeft;
  }

  // The service builds the home: the editor's own setup steps stay out of the way, without the "setup paused" note.
  function quietSetup(): void {
    ed.exitWizard();
    ed.banner();
  }

  // A full-screen page of the AI build is up: the 3D under it draws nothing.
  function cover(on: boolean): void {
    if (on) ed.view.pause?.();
    else ed.view.resume?.();
  }

  // ---------- notes kept while the owner looks (pins and words), per build ----------

  const notesKey = (): string => `${NOTES}${buildId}:final`;
  function loadNotes(): PinNotes {
    try {
      // Kept by saveNotes; what is inside the pins is not checked (it never was).
      const saved = JSON.parse(localStorage.getItem(notesKey()) || 'null') as SavedNotes | null;
      if (saved && Array.isArray(saved.pins)) return {pins: saved.pins as Pin[], text: saved.text || ''};
    } catch {}
    return {pins: [], text: ''};
  }
  function saveNotes(notes: PinNotes): void {
    try {
      localStorage.setItem(notesKey(), JSON.stringify(notes));
    } catch {}
  }
  function clearNotes(): void {
    try {
      localStorage.removeItem(notesKey());
    } catch {}
  }
  // The pins of the service's last round that did not work out come back once, as pins to look at again; those already back
  // follow what the service says of the round now.
  const retriedKey = (): string => `${NOTES}${buildId}:retried`;
  function notesWithRetries(): PinNotes {
    const notes = loadNotes();
    const round = status?.lastRound?.round;
    if (!round) return notes;
    notes.pins = refreshRetries(notes.pins, status?.lastRound);
    saveNotes(notes);
    let retried = 0;
    try {
      retried = Number(localStorage.getItem(retriedKey()) || 0);
    } catch {}
    if (retried >= round) return notes;
    notes.pins.push(...pinsToRetry(status?.lastRound));
    saveNotes(notes);
    try {
      localStorage.setItem(retriedKey(), String(round));
    } catch {}
    return notes;
  }

  // ---------- talking to the service ----------

  // A failed answer of the build's own routes as an Error in its words. There, 404 with accounts means the build is not shown
  // to this browser (signed out, or another account's): the page then says which and offers the way in (explainMissing).
  async function failureOf(res: Response): Promise<Error> {
    const data: unknown = await res.json().catch(() => ({}));
    const message = (data as ServiceError).error || res.statusText;
    if (res.status !== 404 || !(await explainMissing())) return new Error(message);
    return new Error(
      locked === 'signed-out' ? t('You are signed out. Sign in again.') : t('Not in this account'),
    );
  }

  async function getJson(path: string): Promise<unknown> {
    const res = await fetch(base() + path, {cache: 'no-store'});
    if (!res.ok) throw await failureOf(res);
    return res.json();
  }

  // A pin's picture to the service → its name there.
  async function uploadPicture(blob: Blob, kind: 'view' | 'photo'): Promise<string> {
    const res = await fetch(`${base()}/pin-photo?kind=${kind}`, {
      method: 'POST',
      headers: {'content-type': blob.type || 'application/octet-stream'},
      body: blob,
    });
    if (!res.ok) throw await failureOf(res);
    const data = (await res.json()) as {file: string};
    return data.file;
  }

  async function post(path: string, body?: unknown): Promise<unknown> {
    const res = await fetch(base() + path, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify(body || {}),
    });
    if (!res.ok) throw await failureOf(res);
    return res.json().catch(() => ({}));
  }

  async function poll(): Promise<void> {
    clearTimeout(timer);
    if (closed || !buildId || locked) return;
    try {
      const s = (await getJson('')) as BuildStatus;
      if (answered && s.waiting !== answered) answered = null;
      status = answered && s.waiting === answered ? {...s, waiting: null} : s;
      noteSpending(status);
      if (status.has?.plan && !planRead) await loadPlanRead();
      if (status.waiting !== 'final') shownFinal = false;
      // The home is ready: straight to it, the pin in hand.
      if (status.waiting === 'final' && screen === 'progress' && !shownFinal) {
        shownFinal = true;
        startReview();
      } else if (screen === 'progress') renderProgress();
    } catch (e) {
      // Not shown to this browser: the page says why and waits for the owner to sign in (lockOut).
      if (locked) return;
      status = {...(status || {steps: [], rooms: [], has: {}}), error: messageOf(e)};
      if (screen === 'progress') renderProgress();
    }
    timer = setTimeout(poll, POLL_MS);
  }

  // The balance changes as the build spends: asked again every few polls, and at once when the build starts or stops
  // waiting for it.
  function noteSpending(now: BuildStatus): void {
    const pausedNow = now.paused || null;
    pollsSinceAccount++;
    const due = pollsSinceAccount >= POLLS_PER_ACCOUNT || pausedNow !== pausedBefore;
    pausedBefore = pausedNow;
    if (offer && due) refreshAccount();
  }

  async function loadPlanRead(): Promise<void> {
    try {
      const res = await fetch(`${base()}/plan`, {cache: 'no-store'});
      if (!res.ok) return;
      const plan = readPlan(await res.text());
      planRead = {
        svg: planSvg(plan),
        rooms: plan.rooms.filter(room => !room.solid).length,
        openings: plan.openings.length,
      };
    } catch {}
  }

  // ---------- the upload ----------

  function showUpload(): void {
    closeSignIn();
    screen = 'upload';
    cover(true);
    setAddress('upload');
    chosen = {plan: null, videos: []};
    const drop = (
      kind: string,
      ic: string,
      title: string,
      note: string,
      accept: string,
      multiple: boolean,
    ): string => `
      <label class="aib-drop" data-kind="${kind}">
        <input type="file" accept="${accept}" ${multiple ? 'multiple' : ''} hidden>
        <span class="aib-drop-ic">${icon(ic, 20)}</span>
        <span class="aib-drop-text"><b>${esc(title)}</b><small>${esc(note)}</small></span>
        <span class="aib-drop-file" hidden></span>
      </label>`;
    root.innerHTML = `
      <div class="aib-screen">
        <header class="aib-head">
          <button class="ib" data-act="exit" title="${esc(t('Back'))}">${icon('left', 18)}</button>
          <span class="logo">${icon('sparkles', 15)}</span><b>${esc(t('AI build'))}</b>
        </header>
        <main class="aib-upload">
          <h1>${esc(t('Your home in 3D, built by AI'))}</h1>
          <p class="aib-lead">${esc(t('Add the floor plan and a video of your home. We build the rooms, doors, windows and furniture, and you check the result.'))}</p>
          <div class="aib-drops">
            ${drop('plan', 'image', t('Floor plan'), t('A photo or scan'), 'image/*', false)}
            ${drop('video', 'video', t('Video of your home'), t('One walk through every room'), 'video/*', true)}
          </div>
          <ul class="aib-tips">
            <li>${icon('check', 14)}<span>${esc(t('Walk slowly and turn around once in every room.'))}</span></li>
            <li>${icon('check', 14)}<span>${esc(t('Lights on. No need to tidy up.'))}</span></li>
          </ul>
          <div class="aib-go">
            <span class="aib-time">${icon('clock', 15)}<span>${esc(t('About 15 minutes. You can close the page meanwhile.'))}</span></span>
            <span class="aib-go-account"></span>
            <button class="primary aib-big" data-act="start" disabled>${icon('sparkles', 16)}${esc(t('Build my home'))}</button>
            <small class="aib-go-line" role="status" hidden></small>
          </div>
          <div class="aib-sending" hidden><i class="aib-meter"><i></i></i><span></span></div>
        </main>
      </div>`;
    find(root, '.aib-head').append(newHeadBar(false));
    const start = find<HTMLButtonElement>(root, '[data-act=start]');
    find(root, '.aib-go-account').addEventListener('click', e => {
      const button = targetOf(e).closest<HTMLButtonElement>('[data-act=buy]');
      if (button) buy(button);
    });
    const setFiles = (kind: string | undefined, list: File[]): void => {
      const label = find(root, `.aib-drop[data-kind=${kind}]`);
      const shownFile = find(label, '.aib-drop-file');
      if (kind === 'plan') {
        const image = list.find(f => f.type.startsWith('image/'));
        if (!image) return;
        chosen.plan = image;
        shownFile.innerHTML = `<img alt="">`;
        find<HTMLImageElement>(shownFile, 'img').src = URL.createObjectURL(image);
      } else {
        const videos = list.filter(f => f.type.startsWith('video/'));
        if (!videos.length) return;
        chosen.videos = videos;
        const megabytes = videos.reduce((sum, f) => sum + f.size, 0) / 1e6;
        shownFile.innerHTML = `<video muted playsinline preload="metadata"></video><small></small>`;
        find<HTMLVideoElement>(shownFile, 'video').src = URL.createObjectURL(videos[0]) + '#t=1';
        find(shownFile, 'small').textContent =
          t('{0, plural, one {# video} other {# videos}}', videos.length) + ` · ${Math.round(megabytes)} MB`;
      }
      shownFile.hidden = false;
      label.classList.add('has');
      syncStart();
    };
    for (const label of root.querySelectorAll<HTMLElement>('.aib-drop')) {
      const kind = label.dataset.kind;
      const input = find<HTMLInputElement>(label, 'input');
      // A file input always has its list.
      input.onchange = () => setFiles(kind, [...input.files!]);
      label.addEventListener('dragover', e => {
        e.preventDefault();
        label.classList.add('over');
      });
      label.addEventListener('dragleave', () => label.classList.remove('over'));
      label.addEventListener('drop', e => {
        e.preventDefault();
        label.classList.remove('over');
        // A drop carries its data.
        setFiles(kind, [...e.dataTransfer!.files]);
      });
    }
    // Back from a provider's sign-in or the checkout: the files chosen before are back in their places.
    takeChosen().then(kept => {
      if (!kept || screen !== 'upload') return;
      if (kept.plan) setFiles('plan', [kept.plan]);
      if (kept.videos.length) setFiles('video', kept.videos);
    });
    find(root, '[data-act=exit]').onclick = exit;
    // Signed out, the button opens the sign-in; else it is on only with a plan, a video and something left (syncStart).
    start.onclick = () => {
      if (offer && !account) askSignIn('build');
      else send(chosen);
    };
    renderGo();
  }

  // The files go up with a progress bar (fetch reports no upload progress); then the build's progress. A build that cannot
  // start says why: signed out (the sign-in opens), or nothing left (the package to buy).
  function send(files: ChosenFiles): void {
    const sending = find(root, '.aib-sending');
    const bar = find(sending, '.aib-meter>i');
    const line = find(sending, 'span');
    const start = find<HTMLButtonElement>(root, '[data-act=start]');
    start.disabled = true;
    start.dataset.sending = '1';
    sending.hidden = false;
    sending.classList.remove('err');
    line.textContent = t('Uploading…');
    accountLine = null;
    renderGo();
    const form = new FormData();
    // The language the owner reads: the build names the rooms and the furniture in it.
    form.append('lang', getLang());
    // There is a plan: the button is on only with one (syncStart).
    form.append('plan', files.plan as File);
    for (const video of files.videos) form.append('video', video);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${api}/api/builds`);
    xhr.upload.onprogress = e => {
      if (!e.lengthComputable) return;
      const share = e.loaded / e.total;
      bar.style.width = `${Math.round(share * 100)}%`;
      line.textContent = t('Uploading… {0}%', Math.round(share * 100));
    };
    const stopped = (): void => {
      delete start.dataset.sending;
      syncStart();
    };
    const failed = (message: string): void => {
      sending.classList.add('err');
      line.textContent = t('Could not upload: {0}', message);
      stopped();
    };
    xhr.onerror = () => failed(t('no connection'));
    xhr.onload = async () => {
      let data: {id?: string} & ServiceError = {};
      try {
        data = JSON.parse(xhr.responseText) as {id?: string} & ServiceError;
      } catch {}
      if (xhr.status === 401 || xhr.status === 402) {
        sending.hidden = true;
        stopped();
        if (xhr.status === 401) {
          account = null;
          renderAccount();
          askSignIn('build');
          return;
        }
        accountLine = t('Nothing left on your account');
        await refreshAccount();
        return;
      }
      if (xhr.status >= 300 || !data.id) return failed(data.error || xhr.statusText);
      // A new home: the plan open now is kept aside ("Restore previous plan"), the editor starts clean.
      await flows?.keepPrev?.();
      await ed.underlay.clear();
      ed.setPlan(emptyPlan(), {fit: false});
      quietSetup();
      buildId = data.id;
      follow(buildId);
      setAddress({build: buildId});
      showProgress();
      poll();
    };
    xhr.send(form);
  }

  // ---------- the progress ----------

  function showProgress(): void {
    closeReview();
    closeSignIn();
    screen = 'progress';
    cover(true);
    root.innerHTML = `
      <div class="aib-screen">
        <header class="aib-head">
          <span class="logo">${icon('sparkles', 15)}</span><b class="aib-title"></b>
          <span class="aib-eta"></span>
          <button class="ib aib-exit" data-act="exit" title="${esc(t('Close'))}">${icon('x', 17)}</button>
        </header>
        <i class="aib-meter aib-overall"><i></i></i>
        <main class="aib-progress">
          <ol class="aib-steps">${STAGES.map(
            (stage, i) => `<li class="aib-step st-todo" data-stage="${stage.key}">
              <span class="aib-dot">${i + 1}</span>
              <span class="aib-step-text">
                <span class="aib-step-head"><b>${esc(t(stage.label))}</b><em></em></span>
                <small>${esc(t(stage.note))}</small>
                <span class="aib-step-live" hidden></span>
                <i class="aib-meter aib-step-bar" hidden><i></i></i>
              </span>
            </li>`,
          ).join('')}</ol>
          <section class="aib-live">
            <div class="aib-cta"></div>
            <div class="aib-making" hidden><h3>${esc(t('Furniture'))}<span></span></h3><div class="aib-chips"></div></div>
            <div class="aib-reading" hidden></div>
            <div class="aib-found" hidden><h3>${esc(t('Rooms from your video'))}</h3><div class="aib-rooms"></div></div>
          </section>
        </main>
        <footer class="aib-foot">
          <span>${esc(t('You can close this page: the build goes on. Come back by this link.'))}</span>
          <button class="soft" data-act="copy">${esc(t('Copy link'))}</button>
        </footer>
      </div>`;
    find(root, '.aib-exit').before(newHeadBar(true));
    find(root, '[data-act=exit]').onclick = exit;
    find(root, '[data-act=copy]').onclick = async e => {
      // The button the handler is on.
      const button = e.currentTarget as HTMLButtonElement;
      try {
        await navigator.clipboard.writeText(location.href);
        button.textContent = t('Copied');
      } catch {
        button.textContent = location.href;
      }
    };
    find(root, '.aib-cta').addEventListener('click', onCta);
    renderProgress();
  }

  const stepRunning = (name: string): boolean =>
    shown().steps?.find(x => x.name === name)?.state === 'running';
  const roomById = (id: string | undefined): VideoRoom | undefined =>
    shown().rooms?.find(room => room.id === id);
  const nameOf = (room: VideoRoom | undefined): string =>
    videoRoomNames(shown().rooms || []).get(room?.id) ?? roomName(room || {guess: ''});
  // A line that changes every few seconds, the same for everyone looking at the same moment; offset — another place in the turn.
  const turn = (): number => Math.floor(Date.now() / 1000 / PHRASE_SECONDS);
  const inTurn = <Item>(list: Item[], offset = 0): Item => list[(turn() + offset) % list.length];
  // What the step does, in turn.
  const phrase = (step: PhraseStep): string => t(inTurn(PHRASES[step]));
  // Every other turn: a line about the work in hand (its room or piece in turn too), what the step does between — the line never
  // stands still for long, and each room still gets its turn.
  const inHalfTurn = <Item>(list: Item[]): Item => list[Math.floor(turn() / 2) % list.length];
  const between = (line: string, step: PhraseStep): string =>
    turn() % 2 ? t(inHalfTurn(PHRASES[step])) : line;

  // What the plan call is at: thinking (what it works out, in turn), writing (the rooms as they come), or fixing what our code found.
  function planLine(): string {
    const call = shown().live?.plan;
    if (call && call.round > 0) return phrase('planFix');
    if (call?.phase === 'writing' && call.rooms.length) return t('Found: {0}', call.rooms.at(-1));
    if (call?.phase === 'writing') return t('Writing down the plan');
    return phrase('plan');
  }

  // The line under a running stage: what it is working on right now.
  function stageLine(stage: Stage): string {
    const status = shown();
    if (status.paused === 'balance') return t('Waiting for a top-up');
    if (status.paused === 'payments') return t('Waiting for payments');
    const live: BuildLive = status.live || {};
    if (stage.key === 'plan') return planLine();
    if (stage.key === 'rooms') {
      if (stepRunning('split')) return phrase('split');
      if (stepRunning('frames')) return phrase('frames');
      const rooms = Object.entries(live.rooms || {});
      const writing = rooms.filter(([, call]) => call.phase === 'writing' && call.pieces.length);
      if (writing.length) {
        // The room written last, and its piece written last: both lists have something (checked above).
        const [id, call] = writing.at(-1)!;
        return `${nameOf(roomById(id))}: ${pieceName(call.pieces.at(-1)!)}`;
      }
      const looking = rooms
        .filter(([, call]) => call.phase !== 'done')
        .map(([id]) => roomById(id))
        .filter(Boolean);
      if (looking.length) return between(t('Looking at: {0}', nameOf(inHalfTurn(looking))), 'rooms');
      if (stepRunning('recon')) return phrase('recon');
      return phrase('rooms');
    }
    if (stage.key === 'furniture') {
      if (stepRunning('bind')) return phrase('bind');
      const work = live.making?.at(-1);
      if (work?.how === 'parts') return between(t('Making from parts: {0}', pieceName(work)), 'parts');
      if (work) return between(t('Comparing with our model: {0}', pieceName(work)), 'ours');
      if (stepRunning('colours')) return phrase('colours');
      return phrase(stepRunning('parts') ? 'parts' : 'ours');
    }
    if (stage.key === 'assembly') {
      const checking = live.checking?.map(roomById).filter(Boolean) || [];
      if (status.revising && checking.length)
        return between(t('Changing: {0}', nameOf(inHalfTurn(checking))), 'revise');
      if (status.revising) return phrase('revise');
      if (stepRunning('assemble')) return phrase('assemble');
      if (checking.length) return between(t('Second look: {0}', nameOf(inHalfTurn(checking))), 'check');
      return phrase('check');
    }
    return phrase(stepRunning('shot') ? 'shot' : 'report');
  }

  // The small count beside a stage's name.
  function stageMeta(stage: Stage, state: StageState): string {
    const status = shown();
    const live: BuildLive = status.live || {};
    if (state === 'ask') return t('Ready to check');
    if (state !== 'running') return '';
    if (stage.key === 'plan' && live.plan?.rooms?.length)
      return t('{0, plural, one {# room} other {# rooms}}', live.plan.rooms.length);
    // A room left out (an open-air space the plan does not show) is not counted: its call is not made.
    const builtRooms = (status.rooms || []).filter(room => !room.left);
    if (stage.key === 'rooms' && builtRooms.length)
      return t('{0} of {1}', builtRooms.filter(room => room.done).length, builtRooms.length);
    if (stage.key === 'furniture' && live.madeCount) return t('{0} ready', live.madeCount);
    if (stage.key === 'assembly' && stepRunning('check') && !status.revising) {
      const total = status.rooms.filter(room => room.name).length;
      return total ? t('{0} of {1}', Math.min(total, live.checked?.length || 0), total) : '';
    }
    return '';
  }

  // A line that changed comes in softly; the same line stays still.
  function setLine(node: HTMLElement, text: string): void {
    node.hidden = !text;
    if (node.textContent === text) return;
    node.textContent = text;
    node.classList.remove('aib-swap');
    void node.offsetWidth;
    node.classList.add('aib-swap');
  }

  function renderSteps(): void {
    STAGES.forEach((stage, i) => {
      const item = find(root, `.aib-step[data-stage="${stage.key}"]`);
      const state = stageState(status, stage);
      if (!item.classList.contains(`st-${state}`)) {
        item.className = `aib-step st-${state}`;
        find(item, '.aib-dot').innerHTML =
          state === 'done'
            ? icon('check', 13)
            : state === 'running'
              ? '<i class="spin"></i>'
              : state === 'ask'
                ? icon('eye', 13)
                : String(i + 1);
      }
      find(item, 'em').textContent = stageMeta(stage, state);
      setLine(find(item, '.aib-step-live'), state === 'running' ? stageLine(stage) : '');
      const bar = find(item, '.aib-step-bar');
      bar.hidden = state !== 'running';
      if (state === 'running') barOf(bar).style.width = percent(stageShare(shown(), stage));
    });
  }

  // The card at the top of the live part: what the owner can do now, or what the build is busy with for them.
  function ctaCard(): {key: string; html: string} {
    const s = shown();
    if (locked) return lockedCard();
    if (s.error) {
      // An error of our own code is said in words; its message stays on hover, for us.
      const why = s.ourCode ? t('An error in our code, not in the files') : s.error;
      return {
        key: `error:${s.error}`,
        html: `<div class="aib-card bad">
          <span class="aib-card-ic">${icon('alert', 20)}</span>
          <span class="aib-card-text"><b>${esc(t('The build stopped'))}</b><small title="${esc(s.error)}">${esc(why)}</small></span>
          <button class="primary" data-act="resume">${esc(t('Try again'))}</button></div>`,
      };
    }
    const paused = pausedCard(s.paused, {offer, line: accountLine});
    if (paused.key) return paused;
    if (accountLine) {
      // A top-up asked for from the account's menu did not go through.
      return {
        key: `account:${accountLine}`,
        html: `<div class="aib-card bad">
          <span class="aib-card-ic">${icon('wallet', 20)}</span>
          <span class="aib-card-text"><b>${esc(accountLine)}</b></span></div>`,
      };
    }
    if (s.waiting === 'final') {
      const thumb = s.has.shot
        ? `<img src="${base()}/shot?v=${Date.now()}" alt="">`
        : `<span class="aib-card-ic">${icon('house', 22)}</span>`;
      return {
        key: 'final',
        html: `<div class="aib-card asking">
          <span class="aib-card-thumb shot">${thumb}</span>
          <span class="aib-card-text"><b>${esc(t('Your home is ready'))}</b><small>${esc(t('Look at it in 3D and say what to change.'))}</small></span>
          <button class="primary" data-act="review">${esc(t('Look at my home'))}</button></div>`,
      };
    }
    if (s.finished) {
      return {
        key: 'finished',
        html: `<div class="aib-card asking">
          <span class="aib-card-ic">${icon('house', 22)}</span>
          <span class="aib-card-text"><b>${esc(t('Your home is ready'))}</b><small>${esc(t('It opens in the editor: everything stays changeable.'))}</small></span>
          <button class="primary" data-act="open">${esc(t('Open my home'))}</button></div>`,
      };
    }
    if (s.revising) {
      return {
        key: 'busy',
        html: `<div class="aib-card"><span class="aib-card-ic"><i class="spin"></i></span>
          <span class="aib-card-text"><b>${esc(t('Changing your home…'))}</b><small>${esc(t('We show it again when it is done.'))}</small></span></div>`,
      };
    }
    return {key: '', html: ''};
  }

  // The build is not shown to this browser: the way in — signing in, or with the account that started it.
  function lockedCard(): {key: string; html: string} {
    if (locked === 'other') {
      const who = account
        ? t('Signed in as {0}. Sign in with the account that started it.', account.email)
        : '';
      return {
        key: `locked:other:${who}`,
        html: `<div class="aib-card asking">
          <span class="aib-card-ic">${icon('user', 20)}</span>
          <span class="aib-card-text"><b>${esc(t('Not in this account'))}</b><small>${esc(who)}</small></span>
          <button class="primary" data-act="switch-account">${esc(t('Switch account'))}</button></div>`,
      };
    }
    return {
      key: 'locked:signed-out',
      html: `<div class="aib-card asking">
        <span class="aib-card-ic">${icon('user', 20)}</span>
        <span class="aib-card-text"><b>${esc(t('Sign in to see this build'))}</b><small>${esc(t('It is shown only to the account that started it.'))}</small></span>
        <button class="primary" data-act="sign-in">${esc(t('Sign in'))}</button></div>`,
    };
  }

  // The plan: its photo with a line going over it and what the call has found so far; once read, a short card of what it holds.
  function renderReading(): void {
    const status = shown();
    const box = find(root, '.aib-reading');
    const reading = !!status.has?.photo && !status.has?.plan && !status.error;
    const read = !!planRead;
    box.hidden = !reading && !read;
    const mode = read ? 'read' : reading ? 'reading' : '';
    if (box.dataset.mode !== mode) {
      box.dataset.mode = mode;
      // 'read': the plan is read (planRead is there).
      box.innerHTML =
        mode === 'reading'
          ? `<div class="aib-scan"><img src="${base()}/photo" alt=""><i></i></div>
             <div class="aib-reading-line"><i class="spin"></i><span></span></div>
             <div class="aib-tags"></div>`
          : mode === 'read'
            ? `<div class="aib-card aib-plan-read">
                <span class="aib-card-thumb plan">${planRead!.svg}</span>
                <span class="aib-card-text"><b>${esc(t('The plan is read'))}</b><small></small></span>
                <span class="aib-done">${icon('check', 15)}</span></div>`
            : '';
    }
    if (mode === 'reading') {
      // The photo is there from the upload; the plan is read once the video is cut into rooms (it learns the rooms from it).
      const next = !stepRunning('plan') && !status.live?.plan;
      box.classList.toggle('aib-waiting', next);
      setLine(
        find(box, '.aib-reading-line span'),
        next ? t('Your plan is next: first the video is cut into rooms') : planLine(),
      );
      const call = status.live?.plan;
      const names = call?.rooms || [];
      const tags = find(box, '.aib-tags');
      let count = tags.querySelector<HTMLElement>('.aib-tag-count');
      const shown = tags.querySelectorAll('.aib-tag:not(.aib-tag-count)').length;
      for (const name of names.slice(shown))
        tags.insertBefore(el(`<span class="aib-tag">${icon('check', 12)}${esc(name)}</span>`), count);
      const openings = call?.openings || 0;
      if (openings && !count) {
        count = el(`<span class="aib-tag aib-tag-count"></span>`);
        tags.append(count);
      }
      if (count)
        count.textContent = t('{0, plural, one {# door or window} other {# doors and windows}}', openings);
    }
    if (mode === 'read') {
      // The plan is read (planRead is there).
      const counts = planRead!;
      find(box, 'small').textContent = [
        t('{0, plural, one {# room} other {# rooms}}', counts.rooms),
        t('{0, plural, one {# door or window} other {# doors and windows}}', counts.openings),
      ].join(' · ');
    }
  }

  // The furniture being matched with our models or made from parts, and the pieces done: while the furniture stage runs. Each
  // piece keeps its chip where it first came; only its state changes (chips coming and going and moving read as flicker).
  function renderMaking(): void {
    const status = shown();
    const box = find(root, '.aib-making');
    const live: BuildLive = status.live || {};
    const work: BuildPiece[] = live.work || [
      ...(live.making || []).map(piece => ({...piece, state: 'busy'})),
      ...(live.made || []).map(piece => ({...piece, state: 'done'})),
    ];
    const show = stageState(status, STAGES[2]) === 'running' && work.length > 0;
    box.hidden = !show;
    if (!show) return;
    find(box, 'h3 span').textContent = live.madeCount ? t('{0} ready', live.madeCount) : '';
    const chips = find(box, '.aib-chips');
    for (const piece of work) {
      const key = `${piece.room}/${piece.id}`;
      let chip = chips.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`);
      if (!chip) {
        chip = el(
          `<span class="aib-chip" data-key="${esc(key)}"><i class="aib-chip-state"></i><b></b><small></small></span>`,
        );
        chips.append(chip);
      }
      const state = piece.state === 'busy' ? 'busy' : 'done';
      if (chip.dataset.state !== state) {
        chip.dataset.state = state;
        find(chip, '.aib-chip-state').innerHTML =
          state === 'busy' ? '<i class="spin"></i>' : icon('check', 12);
      }
      const name = pieceName(piece);
      const where = nameOf(roomById(piece.room));
      if (find(chip, 'b').textContent !== name) find(chip, 'b').textContent = name;
      if (find(chip, 'small').textContent !== where) find(chip, 'small').textContent = where;
    }
  }

  // Under a room of the video: the furniture found as its call writes, then how many pieces; the pieces made there now.
  function roomLine(room: VideoRoom, looking: boolean): string {
    const status = shown();
    const live: BuildLive = status.live || {};
    const call = live.rooms?.[room.id];
    // A garden or a terrace: its call waits for the plan, and is left out when the plan does not show it.
    if (room.left) return t('Not on the plan: not built');
    if (room.waits) return t('Waits for the plan');
    if (!room.done) {
      if (call?.pieces?.length)
        return `${call.pieces.length} · ${call.pieces.map(pieceName).reverse().join(', ')}`;
      if (!looking) return '';
      // Its call not started yet: the room is being rebuilt in 3D first.
      if (!call && stepRunning('recon')) return t('Measuring in 3D…');
      // Each room whose call works now a step apart in the turn: the cards do not change in step.
      const working = Object.entries(live.rooms || {})
        .filter(([, other]) => other.phase !== 'done')
        .map(([id]) => id);
      return t(inTurn(ROOM_PHRASES, Math.max(0, working.indexOf(room.id))));
    }
    const making = (live.making || []).filter(work => work.room === room.id);
    if (making.length && stageState(status, STAGES[2]) === 'running')
      return t('Making: {0}', making.map(pieceName).join(', '));
    return t('{0, plural, one {# piece} other {# pieces}}', room.pieces || call?.pieces?.length || 0);
  }

  function renderRooms(): void {
    const status = shown();
    const box = find(root, '.aib-rooms');
    const rooms = status.rooms || [];
    const looking = stepRunning('rooms');
    const furnishing = stageState(status, STAGES[2]) === 'running';
    for (const room of rooms) {
      let figure = box.querySelector<HTMLElement>(`[data-id="${room.id}"]`);
      if (!figure) {
        figure = el(`<figure class="aib-room" data-id="${esc(room.id)}">
          <span class="aib-frame"><img alt="" hidden></span>
          <figcaption><span class="aib-room-name"></span><i class="aib-room-state"></i></figcaption>
          <small class="aib-room-line"></small></figure>`);
        box.append(figure);
      }
      const img = find<HTMLImageElement>(figure, 'img');
      if (room.frame && !img.getAttribute('src')) {
        img.onload = () => {
          img.hidden = false;
        };
        img.src = `${base()}/frame/${encodeURIComponent(room.id)}`;
      }
      find(figure, '.aib-room-name').textContent = nameOf(room);
      const busyHere = furnishing && (status.live?.making || []).some(work => work.room === room.id);
      const state = busyHere
        ? 'running'
        : room.done
          ? 'done'
          : room.left
            ? 'left'
            : looking && !room.waits
              ? 'running'
              : 'todo';
      if (figure.dataset.state !== state) {
        figure.dataset.state = state;
        find(figure, '.aib-room-state').innerHTML =
          state === 'done' ? icon('check', 13) : state === 'running' ? '<i class="spin"></i>' : '';
      }
      const line = find(figure, '.aib-room-line');
      const text = roomLine(room, looking);
      if (line.textContent !== text) line.textContent = text;
    }
    find(root, '.aib-found').hidden = !rooms.length;
  }

  // The progress page's title: what the build is at, in a few words.
  function progressTitle(s: BuildStatus | null): string {
    if (locked) return t('AI build');
    if (!s) return t('Building your home');
    if (s.error) return t('The build stopped');
    if (s.paused === 'balance') return t('Waiting for a top-up');
    if (s.paused === 'payments') return t('Waiting for payments');
    if (s.waiting || s.finished) return t('Your home is ready');
    if (s.revising) return t('Changing your home…');
    return t('Building your home');
  }

  function renderProgress(): void {
    if (screen !== 'progress') return;
    const s = status;
    // Not shown to this browser: only the way in, without the stages and the link that would say nothing.
    find(root, '.aib-screen').classList.toggle('aib-locked', !!locked);
    find(root, '.aib-title').textContent = progressTitle(s);
    find(root, '.aib-eta').textContent = s && !locked ? etaText(s.eta) : '';
    const overall = find(root, '.aib-overall');
    overall.hidden = !s || !!s.error || !!locked;
    barOf(overall).style.width = percent(s?.share || 0);
    if (!s) return;
    renderSteps();
    const cta = ctaCard();
    const box = find(root, '.aib-cta');
    if (box.dataset.key !== cta.key) {
      box.dataset.key = cta.key;
      box.innerHTML = cta.html;
    }
    renderMaking();
    renderReading();
    renderRooms();
  }

  async function onCta(e: MouseEvent): Promise<void> {
    const act = targetOf(e).closest<HTMLElement>('[data-act]')?.dataset.act;
    if (act === 'review') startReview();
    else if (act === 'open') openHome();
    else if (act === 'top-up') {
      // The top-up button: act came from it. Bought at the checkout, it comes back to this build, which goes on by itself
      // once the payment is counted.
      buy(targetOf(e).closest('[data-act]') as HTMLButtonElement);
    } else if (act === 'sign-in') askSignIn('see');
    else if (act === 'switch-account') {
      await signOutHere();
      askSignIn('see');
    } else if (act === 'resume') {
      try {
        status = (await post('/resume')) as BuildStatus;
        renderProgress();
      } catch (err) {
        status = {...shown(), error: messageOf(err)};
        renderProgress();
      }
    }
  }

  // ---------- the review ----------

  async function loadIntoEditor(): Promise<void> {
    const res = await fetch(`${base()}/home`, {cache: 'no-store'});
    if (!res.ok) throw new Error(res.statusText);
    const plan = readPlan(await res.text());
    cover(false);
    ed.setPlan(plan, {fit: false});
    quietSetup();
  }

  async function startReview(): Promise<void> {
    try {
      await loadIntoEditor();
    } catch (e) {
      status = {...shown(), error: messageOf(e)};
      renderProgress();
      return;
    }
    screen = 'review';
    closeSignIn();
    root.innerHTML = '';
    headBar = null;
    review = openReview(ed, {
      host: root,
      photo: shown().has?.photo ? `${base()}/photo` : null,
      notes: notesWithRetries(),
      onChange: saveNotes,
      onBack: showProgress,
      onSend: answer,
      upload: uploadPicture,
      pictureUrl: file => `${base()}/owner/${encodeURIComponent(file)}`,
      lastRound: status?.lastRound || null,
      pastRounds: status?.rounds || [],
      account: renderReviewAccount,
      // Only a pin that came back has the button (ai-review.ts report).
      onReport: pin =>
        post('/feedback', {round: (pin.retry as PinRetry).round, n: (pin.retry as PinRetry).n}),
    });
  }

  function closeReview(): void {
    review?.close();
    review = null;
    reviewSlot = null;
  }

  // The owner's answer: changes go to the build and the progress shows them being made; "all right" opens the home.
  async function answer(notes: PinNotes): Promise<void> {
    const count = changeCount(notes);
    const text = notes.text.trim();
    const body = count
      ? {at: 'final', action: 'correct', ...(text ? {text} : {}), pins: pinsToSend(notes.pins)}
      : {at: 'final', action: 'confirm'};
    await post('/answer', body);
    clearNotes();
    answered = 'final';
    status = {...shown(), waiting: null};
    if (!count) return finish();
    showProgress();
    poll();
  }

  async function openHome(): Promise<void> {
    try {
      await loadIntoEditor();
    } catch (e) {
      status = {...shown(), error: messageOf(e)};
      renderProgress();
      return;
    }
    finish();
  }

  // ---------- the end ----------

  function close(): void {
    closed = true;
    clearTimeout(timer);
    closeReview();
    closeSignIn();
    root.remove();
    cover(false);
    ed.setBare(null);
  }

  // The home is the owner's now: the editor as usual, the 3D large.
  function finish(): void {
    close();
    follow(null);
    setAddress(null);
    ed.setMain('3d');
    ed.view.home();
    quietSetup();
    ed.banner(t('Your home is ready. Change anything you like.'), [[t('Got it'), () => ed.banner(), true]]);
  }

  // Back to the start screen; a build that goes on shows there, and can be followed again by its link.
  function exit(): void {
    close();
    setAddress(null);
    // flows.ts adds it before the AI build can open.
    ed.showStart();
  }

  if (buildId) {
    setAddress({build: buildId});
    showProgress();
    poll();
  } else showUpload();
  // Back from a provider's sign-in that did not go through: the sign-in again, saying so, once the offer is known.
  if (signInNotice) accountReady.then(() => askSignIn(buildId ? 'see' : 'build', signInNotice));
  return {close};
}
