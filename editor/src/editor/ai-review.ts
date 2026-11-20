// The AI build's review (D-073, D-074): the finished home alone, full screen, in 3D or on the plan, with a panel to answer.
// It opens with the pin in hand and a hint: the owner turns the home, puts numbered pins where something is wrong and says
// what, adds a word for the whole home, and answers: all right, or send the changes. Dragging moves the view with either
// tool; a click with the pin tool puts a pin. Nothing moves the view but the owner. The editor underneath only draws
// (ed.setBare): its own clicks and keys stay out.
// Each pin keeps what the owner was looking at when they put it (the view, the spot ringed) and takes photos or screenshots
// they add, dropped or pasted onto its bubble or its row (D-076): the service's model sees what they mean. Pins that did
// not work out last time come back with why.
import {t} from '../i18n/i18n.ts';
import {zOf} from '../core/catalog.ts';
import {$, el, esc, find, tip} from './ui.ts';
import {icon} from './icons.ts';
import {reportStatusWords} from './ai-reports.ts';
import {
  newPin,
  pinLabel,
  pinWords,
  changeCount,
  MAX_PIN_PHOTOS,
  reportOf,
  retryText,
  understoodText,
} from './ai-pins.ts';
import type {Pin, PinHit, PinNotes, PinRound, ReportView, RoundPin} from './ai-pins.ts';
import type {CanvasPoint, Editor, Pane} from './editor-types.ts';

/** A thing the service could not place clear (it stands where the editor draws it red): which, where, and what to call it. */
export interface UnplacedThing {
  id: string;
  x: number;
  y: number;
  /** Its short name and its room, in the owner's language (null: none). A service before them sends only `say`. */
  thing?: string | null;
  room?: string | null;
  /** The thing in one phrase, in the owner's language (an older service: the thing and why). */
  say: string;
}

/** A spot on the home a marker points at: on the plan, and how high (3D). */
interface MarkerSpot {
  x: number;
  y: number;
  z?: number;
}

/** What openReview is given (see its comment). */
export interface ReviewOptions {
  host: HTMLElement;
  photo?: string | null;
  notes: PinNotes;
  onChange: (notes: PinNotes) => void;
  onBack: () => void;
  onSend: (notes: PinNotes) => Promise<void>;
  upload?: ((blob: Blob, kind: 'view' | 'photo') => Promise<string>) | null;
  pictureUrl?: ((name: string) => string) | null;
  lastRound?: PinRound | null;
  pastRounds?: PinRound[];
  unplaced?: UnplacedThing[];
  onReport?: ((pin: Pin, comment: string) => Promise<unknown>) | null;
  /** The pins sent to the developer and where each stands (D-129): shown on the pin instead of the button. */
  reports?: ReportView[];
  account?: ((slot: HTMLElement) => void) | null;
}

/** The review's tools: look around, or put pins. */
type ReviewTool = 'look' | 'pin';

/** A pin of an earlier round that was made, with its round. */
type PastPin = RoundPin & {round: number};

/** A spot on the sketch, in its canvas pixels; an arrow from one to another. */
type SketchPoint = [number, number];
type SketchArrow = [from: SketchPoint, to: SketchPoint];

/** A handler on a target for the events of its own type (a pointer, a key, a drag). */
type Listener = [target: EventTarget, type: string, handler: (e: never) => void];

// The panel on the right (a sheet at the bottom on a narrow screen): the views fit into what it leaves free.
const PANEL_WIDTH = 340;
const NARROW = 720;
const CLICK_PX = 5;
/**
 * A pin's photo in its thumbnail. One the service no longer has shows as a quiet placeholder that says so, not as a broken
 * image.
 */
function showPinPhoto(thumb: HTMLElement, link: HTMLAnchorElement, url: string): void {
  const image = find<HTMLImageElement>(thumb, 'img');
  link.href = url || '#';
  image.addEventListener(
    'error',
    () => {
      const unavailableText = t('Photo unavailable');
      link.removeAttribute('href');
      link.title = unavailableText;
      link.setAttribute('aria-label', unavailableText);
      image.replaceWith(el(`<span class="aib-thumb-gone">${icon('image', 16)}</span>`));
    },
    {once: true},
  );
  image.src = url;
}

// The view a pin keeps, and a photo before it goes: at most this many pixels on the long side.
const VIEW_PIXELS = 1280;
const PHOTO_PIXELS = 1600;
// The ring round the spot in the kept view, as the service's drawing rings it (harness tools/home.mjs roomDiagram).
const RING = '#d6249f';
// What the pen in a pin's bubble does, and what sending a pin to the developer gives: on hover, in a few words.
const SKETCH_TIP = (): string => t('Screenshot with arrows: show what goes where');
const REPORT_TIP = (): string =>
  t('The developer sees your pin and what we answered, and teaches the app to do it');
const isPicture = (file: File): boolean =>
  /^image\//.test(file.type) || /\.(heic|heif)$/i.test(file.name || '');
// The element an event is on: clicks and pointers on the page land on elements. Where the page itself can be the target (keys,
// drags over the window), the code asks `closest?.` as it always did.
const targetOf = (e: Event): Element => e.target as Element;

/**
 * host — where the review's panels go; photo — the plan photo to compare with; notes — {pins, text}, changed in place;
 * onChange(notes) after each change; onBack() — back to the progress; onSend(notes) → a promise: the answer is on its way
 * (all right when there are no changes); upload(blob, 'view' | 'photo') → a promise of the picture's name at the service;
 * pictureUrl(name) → where to show it; lastRound — the service's last round (how many pins worked out); unplaced — the things
 * the service could not place clear, each listed by its short name and room, to move in the editor; onReport(pin) → a
 * promise: a pin that came back is sent to the developer (what the app could not do, or did wrong); account(slot) fills the
 * account's place above the button that sends the changes (the balance, and a top-up once it is used up; ai-build.ts), and
 * fills it again itself when the account changes.
 */
export function openReview(
  ed: Editor,
  {
    host,
    photo = null,
    notes,
    onChange,
    onBack,
    onSend,
    upload = null,
    pictureUrl = null,
    lastRound = null,
    pastRounds = [],
    unplaced = [],
    onReport = null,
    reports: reportsAtStart = [],
    account = null,
  }: ReviewOptions,
): {close(): void; setReports(reports: ReportView[]): void} {
  let reports = reportsAtStart;
  // The pins of earlier rounds that were made: listed faded in the panel, not on the home; one shows on the home while its row is
  // pointed at or opened (one that was not done after all can be pinned again).
  const pastPins: PastPin[] = pastRounds.flatMap(round =>
    (round.pins || []).filter(pin => pin.made === 'yes').map(pin => ({...pin, round: round.round})),
  );
  let pastOpen: number | null = null;
  let pastHovered: number | null = null;
  // The thing that did not fit whose row is open (tapped) or pointed at: a marker shows where it stands.
  let unplacedOpen: number | null = null;
  let unplacedHovered: number | null = null;
  let view: Pane = '3d';
  let tool: ReviewTool = 'pin';
  let active: number | null = null;
  // The open pin as it was when its bubble opened: Cancel puts it back (a new pin, empty then, goes).
  let opened: {pin: Pin; text: string; photos: string[]} | null = null;
  let hovered: number | null = null;
  let photoOpen = false;
  let collapsed = false;
  let sending = false;
  let closed = false;
  let raf = 0;

  const box = el(`<div class="aib-review">
    <div class="aib-top">
      <div class="aib-bar glass">
        <button class="ib" data-act="back" title="${esc(t('Back to the build'))}">${icon('left', 17)}</button>
        <span class="logo">${icon('sparkles', 14)}</span>
        <span class="aib-bar-text"><b>${esc(t('Check your home'))}</b></span>
      </div>
      <div class="aib-tools glass">
        <button class="ib" data-tool="look" title="${esc(t('Look around (V)'))}">${icon('pointer', 17)}</button>
        <button class="ib" data-tool="pin" title="${esc(t('Pin: click where something is wrong (P)'))}">${icon('mapPin', 17)}</button>
        <span class="sep"></span>
        <div class="seg aib-views"><button data-view="3d">3D</button><button data-view="plan">${esc(t('Plan'))}</button></div>
        <button class="ib" data-act="fit" title="${esc(t('Whole home'))}">${icon('fit', 17)}</button>
      </div>
      <div class="aib-hint glass" role="status">
        <span class="aib-hint-ic">${icon('mapPin', 16)}</span>
        <span>${esc(t('Turn the home any way you like. Click where something is wrong and write what to change.'))}</span>
        <button class="ib" data-act="hint-close" title="${esc(t('Close'))}">${icon('x', 14)}</button>
      </div>
    </div>
    <aside class="aib-panel glass">
      <header>
        <b>${esc(t('Your home is ready'))}</b>
        <button class="ib" data-act="collapse" title="${esc(t('Collapse'))}">${icon('down', 16)}</button>
      </header>
      <div class="aib-panel-body">
        <p class="aib-lead">${esc(t('Look around in 3D. Pin what is wrong and say what.'))}</p>
        <p class="aib-last" hidden></p>
        <ul class="aib-cannot" hidden></ul>
        ${photo ? `<button class="aib-photo" data-act="photo"><img src="${photo}" alt=""><span>${icon('image', 14)}${esc(t('Your plan, side by side'))}</span></button>` : ''}
        <ol class="aib-notes"></ol>
        <details class="aib-past" hidden><summary></summary><ol class="aib-notes"></ol></details>
        <p class="aib-empty">${icon('mapPin', 15)}<span>${esc(t('Click where something is wrong to put a pin.'))}</span></p>
        <textarea class="aib-general" rows="2" placeholder="${esc(t('Anything else? For example: the floors are light oak'))}"></textarea>
      </div>
      <footer>
        <div class="aib-review-account"></div>
        <small class="aib-after"></small>
        <button class="primary" data-act="send"></button>
      </footer>
    </aside>
    ${photo ? `<div class="aib-photo-big glass" hidden><img src="${photo}" alt=""><button class="ib" data-act="photo" title="${esc(t('Close'))}">${icon('x', 16)}</button></div>` : ''}
    <div class="aib-pop glass" hidden>
      <header><span class="aib-num"></span><span class="aib-pop-target"></span></header>
      <div class="aib-thread" hidden></div>
      ${
        onReport
          ? `<div class="aib-report-box" hidden>
        <button class="soft aib-report" data-act="pin-report">${esc(t('Send to the developer'))}</button>
        <div class="aib-report-form" hidden>
          <input class="aib-report-line" maxlength="300" placeholder="${esc(t('What is wrong? Not required'))}">
          <button class="primary" data-act="pin-report-send">${esc(t('Send'))}</button>
        </div>
        <p class="aib-report-status" hidden></p>
      </div>`
          : ''
      }
      <textarea rows="3" placeholder="${esc(t('What is wrong here?'))}"></textarea>
      ${upload ? '<div class="aib-thumbs"></div><input type="file" accept="image/*" multiple hidden>' : ''}
      <small class="aib-photo-err" hidden></small>
      <footer>
        <button class="ib" data-act="pin-delete" aria-label="${esc(t('Delete'))}">${icon('trash', 15)}</button>
        ${upload ? `<button class="ib" data-act="pin-sketch" aria-label="${esc(SKETCH_TIP())}">${icon('pen', 15)}</button>` : ''}
        <button class="soft aib-cancel" data-act="pin-cancel">${esc(t('Cancel'))}</button>
        <button class="primary" data-act="pin-done">${esc(t('Done'))}</button>
      </footer>
    </div>
    <div class="aib-pop aib-past-pop glass" hidden>
      <header><span class="aib-num">${icon('check', 13)}</span><span class="aib-pop-target"></span></header>
      <p class="aib-past-when"></p>
      <p class="aib-past-text"></p>
      <div class="aib-thumbs"></div>
      <footer>
        <button class="soft" data-act="past-again">${esc(t('Not done? Pin it again'))}</button>
        <button class="primary" data-act="past-close">${esc(t('Close'))}</button>
      </footer>
    </div>
  </div>`);
  host.append(box);
  const panel = find(box, '.aib-panel');
  const pop = find(box, '.aib-pop:not(.aib-past-pop)');
  // The bubble's buttons say what they are at once on hover (a title waits a second or more, and the owner saw nothing).
  tip(find(pop, '[data-act=pin-delete]'), t('Delete'));
  const sketchButton = pop.querySelector<HTMLElement>('[data-act=pin-sketch]');
  if (sketchButton) tip(sketchButton, SKETCH_TIP());
  const reportButton = pop.querySelector<HTMLElement>('[data-act=pin-report]');
  if (reportButton) tip(reportButton, REPORT_TIP());
  const pastPop = find(box, '.aib-past-pop');
  const popText = find<HTMLTextAreaElement>(pop, 'textarea');
  const general = find<HTMLTextAreaElement>(box, '.aib-general');
  general.value = notes.text;
  const hint = find(box, '.aib-hint');
  const pinLayer = el(`<div class="aib-pins"></div>`);
  const panes: Record<Pane, HTMLElement> = {plan: $('pane-plan'), '3d': $('pane-3d')};

  // ---------- the view ----------

  const narrow = (): boolean => innerWidth < NARROW;
  function insets(): {left: number; right: number; bottom: number} {
    const left = photoOpen && !narrow() ? Math.min(innerWidth * 0.42, 620) + 24 : 0;
    if (narrow()) return {left: 0, right: 0, bottom: (collapsed ? 56 : panel.offsetHeight) + 16};
    return {left, right: PANEL_WIDTH + 32, bottom: 0};
  }

  // Where the view is clear of the bar and the tools at the top: on a phone the tools are up there too, on a second row when
  // the title and they do not fit side by side (styles.css .aib-top).
  function topClear(): number {
    const bottoms = ['.aib-bar', '.aib-tools'].map(
      selector => find(box, selector).getBoundingClientRect().bottom,
    );
    return Math.max(...bottoms);
  }

  // The tools sit in the middle of what the panels leave free (a phone: their own place at the top, styles.css); what opens
  // under them on a phone (the plan photo) starts below them.
  function placeTools(): void {
    const tools = find(box, '.aib-tools');
    const ins = insets();
    tools.style.left = narrow() ? '' : `${(ins.left + innerWidth - ins.right) / 2}px`;
    box.style.setProperty('--aib-top', `${Math.round(topClear() + 8)}px`);
  }

  // The hint and the pin tool's pulse: until the first pin, or until the owner closes it.
  function hideHint(): void {
    hint.hidden = true;
    find(box, '[data-tool=pin]').classList.remove('aib-pulse');
  }

  function fit(): void {
    placeTools();
    if (view === 'plan') {
      const points = ed.plan.rooms.flatMap(room => room.polygon);
      const ins = insets();
      // the tools: at the bottom, on a phone at the top
      const top = narrow() ? topClear() + 16 : 72;
      ed.v.fit(points, 40, {l: ins.left, r: ins.right, t: top, b: ins.bottom + (narrow() ? 8 : 76)});
      ed.v.fitted = false;
      ed.draw();
    } else ed.view.home();
  }

  function setView(next: Pane): void {
    view = next;
    // Daylight while the owner checks: colours and finishes are what they compare with their video.
    if (view === '3d') ed.view.setNight(false);
    const ins = insets();
    ed.setBare(view, {right: ins.right, bottom: ins.bottom});
    panes[view].append(pinLayer);
    for (const b of box.querySelectorAll<HTMLElement>('[data-view]'))
      b.classList.toggle('on', b.dataset.view === view);
    // A frame later: the editor fits a view that changed its place (the small window → the whole screen) when its size changes,
    // which comes after this frame's callbacks; the review's own fit, minding its panel, goes after that.
    requestAnimationFrame(() => requestAnimationFrame(fit));
  }

  function setTool(next: ReviewTool): void {
    tool = next;
    for (const b of box.querySelectorAll<HTMLElement>('[data-tool]'))
      b.classList.toggle('on', b.dataset.tool === tool);
    document.body.classList.toggle('aib-pinning', tool === 'pin');
  }

  // ---------- pins ----------

  function addPin(hit: PinHit): void {
    hideHint();
    const pin = newPin(ed.plan, hit);
    notes.pins.push(pin);
    keepView(pin);
    setActive(notes.pins.length - 1);
    changed();
  }

  // Cancel: the pin's words and photos as they were when the bubble opened, then the bubble closes.
  function cancelPin(): void {
    const pin = active != null ? notes.pins[active] : null;
    if (pin && opened?.pin === pin) {
      pin.text = opened.text;
      pin.photos = [...opened.photos];
      changed();
    }
    setActive(null);
  }

  function removePin(i: number): void {
    notes.pins.splice(i, 1);
    active = null;
    pop.hidden = true;
    changed();
  }

  // The pin being written: its words in the bubble beside it. Left without words or photos, it goes.
  const empty = (pin: Pin): boolean =>
    !pinWords(pin) && !pin.photos?.length && !((uploading.get(pin) ?? 0) > 0);

  // A pin that came back is a conversation (the owner: it should be a dialog): the owner's words of earlier rounds and the
  // app's answers, then the words the app answered last and its answer — how it understood the pin, why it was not done or
  // what it asks — and the box under them for the owner's answer.
  function renderThread(pin: Pin): void {
    const thread = find(pop, '.aib-thread');
    const turn = (who: 'owner' | 'app', text: string): HTMLElement => {
      const line = el(`<p class="aib-turn ${who}"></p>`);
      line.textContent = text;
      return line;
    };
    const turns = (pin.thread || []).map(each => turn(each.who, each.text));
    if (pin.said?.trim()) turns.push(turn('owner', pin.said));
    if (pin.retry) {
      const answer = el('<p class="aib-turn app"></p>');
      const understood = understoodText(pin.retry);
      if (understood) answer.append(el(`<span class="aib-understood">${esc(understood)}</span>`));
      answer.append(el(`<span class="aib-retry">${esc(retryText(pin.retry))}</span>`));
      turns.push(answer);
    }
    thread.replaceChildren(...turns);
    thread.hidden = !turns.length;
    requestAnimationFrame(() => (thread.scrollTop = thread.scrollHeight));
  }
  function setActive(i: number | null): void {
    if (i != null && pastOpen != null) {
      pastOpen = null;
      pastPop.hidden = true;
    }
    if (active != null && active !== i && notes.pins[active] && empty(notes.pins[active])) {
      notes.pins.splice(active, 1);
      if (i != null && i > active) i--;
      active = null;
      changed();
    }
    const reopened = i != null && i === active;
    active = i;
    pop.hidden = i == null;
    if (i == null) opened = null;
    if (i != null) {
      const pin = notes.pins[i];
      if (!reopened) opened = {pin, text: pin.text, photos: [...(pin.photos ?? [])]};
      find(pop, '.aib-num').textContent = String(i + 1);
      find(pop, '.aib-pop-target').textContent = pinLabel(pin, t('Outside'));
      renderThread(pin);
      renderReport(pin);
      popText.value = pin.text;
      // a pin that came back is answered: the box is for the owner's answer to what the app said
      popText.placeholder = pin.said != null ? t('Your answer') : t('What is wrong here?');
      photoError('');
      requestAnimationFrame(() => popText.focus({preventScroll: true}));
    }
    renderThumbs();
    renderPins();
    renderNotes();
  }

  // ---------- pictures: what the owner saw, and the photos they add ----------

  // Pictures on their way to the service, per pin.
  const uploading = new Map<Pin, number>();

  function photoError(text: string): void {
    const line = find(pop, '.aib-photo-err');
    line.hidden = !text;
    line.textContent = text;
  }

  function renderThumbs(): void {
    const row = pop.querySelector<HTMLElement>('.aib-thumbs');
    if (!row) return;
    const pin = active != null ? notes.pins[active] : null;
    const busy = pin ? uploading.get(pin) || 0 : 0;
    if (!pin) return row.replaceChildren();
    const room = (pin.photos?.length || 0) + busy < MAX_PIN_PHOTOS;
    // Where a photo goes, in sight: a dropping place while there is none, then a small one after the photos.
    const tile =
      !pin.photos?.length && !busy
        ? el(
            `<button class="aib-drop-tile" data-act="pin-photo">${icon('image', 16)}<span>${esc(t('Drop a photo or a screenshot here — or click'))}</span></button>`,
          )
        : room
          ? el(
              `<button class="aib-thumb aib-add" data-act="pin-photo" title="${esc(t('Add a photo'))}">${icon('plus', 15)}</button>`,
            )
          : null;
    row.replaceChildren(
      ...pin.photos.map((name, k) => {
        const thumb = el(`<span class="aib-thumb"><a target="_blank" rel="noopener"><img alt=""></a>
          <button class="ib" data-act="photo-remove" data-k="${k}" title="${esc(t('Remove the photo'))}">${icon('x', 11)}</button></span>`);
        showPinPhoto(thumb, find<HTMLAnchorElement>(thumb, 'a'), pictureUrl?.(name) || '');
        return thumb;
      }),
      ...Array.from({length: busy}, () => el(`<span class="aib-thumb busy"><i class="spin"></i></span>`)),
      ...(tile ? [tile] : []),
    );
  }

  // A photo made smaller before it goes (a phone's photo is many megabytes); one the browser cannot read goes as it is.
  async function shrink(file: File): Promise<Blob> {
    try {
      const bitmap = await createImageBitmap(file, {imageOrientation: 'from-image'});
      const k = Math.min(1, PHOTO_PIXELS / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * k);
      canvas.height = Math.round(bitmap.height * k);
      // A new canvas always gives its 2D context.
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close?.();
      return (await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85))) || file;
    } catch {
      return file;
    }
  }

  async function addPhotos(pin: Pin | undefined, files: Iterable<File>): Promise<void> {
    if (!upload || !pin) return;
    const pictures = [...files].filter(isPicture);
    if (!pictures.length) return photoError(t('Only pictures can be added.'));
    photoError('');
    const room = MAX_PIN_PHOTOS - pin.photos.length - (uploading.get(pin) || 0);
    if (room <= 0) return photoError(t('Up to {0} photos for one pin.', MAX_PIN_PHOTOS));
    await Promise.all(
      pictures.slice(0, room).map(async file => {
        uploading.set(pin, (uploading.get(pin) || 0) + 1);
        renderThumbs();
        try {
          const name = await upload(await shrink(file), 'photo');
          pin.photos.push(name);
        } catch (e) {
          // upload and shrink fail with an Error.
          photoError(t('Could not add the photo: {0}', (e as Error).message));
        } finally {
          // Counted above, before the upload.
          uploading.set(pin, uploading.get(pin)! - 1);
          changed();
          renderThumbs();
        }
      }),
    );
  }

  // The view as it is now (on the plan, its canvas), at most VIEW_PIXELS wide, with the pin's spot ringed when given.
  function viewCanvas(pin: Pin | null): HTMLCanvasElement | null {
    const source = view === 'plan' ? ed.v.cv : ed.view.snapshot?.();
    if (!source?.width) return null;
    const ratio = source.width / (source.clientWidth || source.width);
    const k = Math.min(1, VIEW_PIXELS / source.width);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(source.width * k);
    canvas.height = Math.round(source.height * k);
    // A new canvas always gives its 2D context.
    const g = canvas.getContext('2d')!;
    g.fillStyle = getComputedStyle(document.body).backgroundColor || '#f3f4f6';
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.drawImage(source, 0, 0, canvas.width, canvas.height);
    if (pin) {
      const at = view === 'plan' ? ed.v.S([pin.x, pin.y]) : ed.view.project([pin.x, pin.y], pin.z ?? 0);
      const radius = Math.max(16, canvas.width / 60);
      for (const [colour, width] of [
        ['#fff', 7],
        [RING, 4],
      ] as const) {
        g.beginPath();
        g.arc(at[0] * ratio * k, at[1] * ratio * k, radius, 0, Math.PI * 2);
        g.strokeStyle = colour;
        g.lineWidth = width;
        g.stroke();
      }
    }
    return canvas;
  }

  // A screenshot with arrows: the view as it is now; the owner drags from where to where (as many arrows as they like), and it is
  // added to the pin's photos.
  function openSketch(pin: Pin): void {
    const shot = viewCanvas(null);
    if (!shot || !upload) return;
    const overlay = el(`<div class="aib-sketch">
      <div class="aib-sketch-bar glass">
        <span>${icon('pen', 15)}${esc(t('Drag to draw an arrow'))}</span>
        <button class="soft" data-k="undo">${icon('undo', 15)}${esc(t('Undo'))}</button>
        <button class="soft" data-k="cancel">${esc(t('Cancel'))}</button>
        <button class="primary" data-k="attach">${esc(t('Add to the pin'))}</button>
      </div>
      <canvas></canvas>
    </div>`);
    document.body.append(overlay);
    const canvas = find<HTMLCanvasElement>(overlay, 'canvas');
    canvas.width = shot.width;
    canvas.height = shot.height;
    // A new canvas always gives its 2D context.
    const g = canvas.getContext('2d')!;
    const width = Math.max(4, shot.width / 220);
    const arrows: SketchArrow[] = [];
    let drawing: SketchArrow | null = null;
    const arrow = ([a, b]: SketchArrow): void => {
      const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const head = width * 4.5;
      const tip = (turn: number, length: number): SketchPoint => [
        b[0] - length * Math.cos(angle + turn),
        b[1] - length * Math.sin(angle + turn),
      ];
      g.lineCap = 'round';
      g.lineJoin = 'round';
      for (const [colour, line] of [
        ['#fff', width + 4],
        ['#ff3b30', width],
      ] as const) {
        g.strokeStyle = colour;
        g.fillStyle = colour;
        g.lineWidth = line;
        const end = tip(0, head * 0.6);
        g.beginPath();
        g.moveTo(a[0], a[1]);
        g.lineTo(end[0], end[1]);
        g.stroke();
        g.beginPath();
        g.moveTo(b[0], b[1]);
        for (const p of [tip(-0.45, head), tip(0.45, head)]) g.lineTo(p[0], p[1]);
        g.closePath();
        g.fill();
        if (colour === '#fff') g.stroke();
      }
    };
    const draw = (): void => {
      g.drawImage(shot, 0, 0);
      for (const a of drawing ? [...arrows, drawing] : arrows) arrow(a);
    };
    draw();
    const at = (e: PointerEvent): SketchPoint => {
      const r = canvas.getBoundingClientRect();
      return [
        ((e.clientX - r.left) * canvas.width) / r.width,
        ((e.clientY - r.top) * canvas.height) / r.height,
      ];
    };
    canvas.addEventListener('pointerdown', e => {
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {} // a pointer the browser no longer tracks
      drawing = [at(e), at(e)];
    });
    canvas.addEventListener('pointermove', e => {
      if (!drawing) return;
      drawing[1] = at(e);
      draw();
    });
    canvas.addEventListener('pointerup', () => {
      if (drawing && Math.hypot(drawing[1][0] - drawing[0][0], drawing[1][1] - drawing[0][1]) > 10)
        arrows.push(drawing);
      drawing = null;
      draw();
    });
    const close = (): void => {
      overlay.remove();
      removeEventListener('keydown', onKey, true);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      close();
    };
    addEventListener('keydown', onKey, true);
    find(overlay, '.aib-sketch-bar').addEventListener('click', async e => {
      const k = targetOf(e).closest<HTMLElement>('[data-k]')?.dataset.k;
      if (k === 'undo') {
        arrows.pop();
        draw();
      } else if (k === 'cancel') close();
      else if (k === 'attach') {
        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
        close();
        if (blob) addPhotos(pin, [new File([blob], 'screenshot.jpg', {type: 'image/jpeg'})]);
      }
    });
  }

  // What the owner was looking at when they put the pin, the spot ringed. A pin put in 3D keeps the camera too: the service
  // looks at the changed home from there, to tell whether what the owner pinned is put right as they see it (D-081).
  async function keepView(pin: Pin): Promise<void> {
    // the whole canvas, as the picture below is: the review's panel moves the view's own target off its middle
    if (view === '3d') pin.camera = ed.view.getFrameView();
    if (!upload) return;
    try {
      const canvas = viewCanvas(pin);
      if (!canvas) return;
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.82));
      if (!blob) return;
      const name = await upload(blob, 'view');
      if (notes.pins.includes(pin)) {
        pin.view = name;
        onChange(notes);
      }
    } catch {} // the view helps the service; a pin goes without it as well
  }

  function renderPins(): void {
    const shownPast = pastPins
      .map((pin, k) => ({pin, k}))
      .filter(({k}) => k === pastOpen || k === pastHovered);
    const shownUnplaced = unplaced
      .map((thing, k) => ({thing, k}))
      .filter(({k}) => k === unplacedOpen || k === unplacedHovered);
    pinLayer.replaceChildren(
      ...shownUnplaced.map(({thing, k}) => {
        const b = el(
          `<button class="aib-pin unplaced" data-u="${k}" title="${esc(unplacedLabel(thing))}">${icon('alert', 14)}</button>`,
        );
        b.classList.toggle('on', k === unplacedOpen);
        return b;
      }),
      ...shownPast.map(({pin, k}) => {
        const b = el(
          `<button class="aib-pin past" data-p="${k}" title="${esc(pin.text)}">${icon('check', 13)}</button>`,
        );
        b.classList.toggle('on', k === pastOpen);
        return b;
      }),
      ...notes.pins.map((pin, i) => {
        const b = el(`<button class="aib-pin" data-i="${i}">${i + 1}</button>`);
        b.classList.toggle('on', i === active);
        b.classList.toggle('hover', i === hovered);
        b.classList.toggle('draft', !pinWords(pin));
        return b;
      }),
    );
    place();
  }

  // ---------- the pins of earlier rounds that were made ----------

  function openPast(k: number): void {
    setActive(null);
    pastOpen = k;
    const pin = pastPins[k];
    pastPop.hidden = pin == null;
    if (pin) {
      find(pastPop, '.aib-pop-target').textContent = pinLabel(pin, t('Outside'));
      find(pastPop, '.aib-past-when').textContent = t('Done in round {0}', pin.round);
      find(pastPop, '.aib-past-text').textContent = pin.text;
      find(pastPop, '.aib-thumbs').replaceChildren(
        ...(pin.photos || []).map(name => {
          const thumb = el<HTMLAnchorElement>(
            `<a class="aib-thumb" target="_blank" rel="noopener"><img alt=""></a>`,
          );
          showPinPhoto(thumb, thumb, pictureUrl?.(name) || '');
          return thumb;
        }),
      );
    }
    renderPins();
    renderPast();
  }

  function closePast(): void {
    pastOpen = null;
    pastPop.hidden = true;
    renderPins();
    renderPast();
  }

  // Not done after all: a pin of this round at the same spot, with the same words and pictures, to send again.
  function pinAgain(): void {
    const pin = pastOpen == null ? undefined : pastPins[pastOpen];
    if (!pin) return;
    notes.pins.push({
      x: pin.x,
      y: pin.y,
      ...(pin.z != null ? {z: pin.z} : {}),
      room: pin.room || null,
      roomName: pin.roomName || null,
      item: pin.item || null,
      itemName: pin.itemName || null,
      text: pin.text,
      view: pin.view || null,
      photos: [...(pin.photos || [])],
    });
    closePast();
    setActive(notes.pins.length - 1);
    changed();
  }

  function renderPast(): void {
    const details = find(box, '.aib-past');
    details.hidden = !pastPins.length;
    if (!pastPins.length) return;
    find(details, 'summary').textContent = t(
      '{0, plural, one {# change done earlier} other {# changes done earlier}}',
      pastPins.length,
    );
    find(details, '.aib-notes').replaceChildren(
      ...pastPins.map((pin, k) => {
        const row = el(`<li class="aib-note past" data-p="${k}">
          <span class="aib-num">${icon('check', 12)}</span>
          <span class="aib-note-body"><small></small><span></span></span></li>`);
        row.classList.toggle('on', k === pastOpen);
        find(row, 'small').textContent = pinLabel(pin, t('Outside'));
        find(row, '.aib-note-body>span').textContent = pin.text;
        return row;
      }),
    );
  }

  // Where a marker on the home points: a pin of this round (data-i), of an earlier one (data-p), or a thing that did not fit
  // (data-u).
  function markerSpot(b: HTMLElement): MarkerSpot | undefined {
    if (b.dataset.u != null) {
      const thing = unplaced[Number(b.dataset.u)];
      return thing && unplacedSpot(thing);
    }
    if (b.dataset.p != null) return pastPins[Number(b.dataset.p)];
    return notes.pins[Number(b.dataset.i)];
  }

  // A thing that did not fit: the marker stands on its top, where it shows above whatever it stands in.
  function unplacedSpot(thing: UnplacedThing): MarkerSpot {
    const item = ed.plan.furniture.find(candidate => candidate.id === thing.id);
    return {x: thing.x, y: thing.y, z: item ? zOf(item) + item.h : 0};
  }

  // Each frame: pins follow the view (pan, zoom, orbit); the bubble follows its pin.
  function place(): void {
    const pane = panes[view];
    const paneBox = pane.getBoundingClientRect();
    let activeAt: CanvasPoint | null = null;
    let pastAt: CanvasPoint | null = null;
    // The layer holds only the pins' buttons.
    (pinLayer.childNodes as NodeListOf<HTMLElement>).forEach(b => {
      const past = b.dataset.p != null;
      const spot = markerSpot(b);
      if (!spot) return;
      const [x, y] =
        view === 'plan' ? ed.v.S([spot.x, spot.y]) : ed.view.project([spot.x, spot.y], spot.z ?? 0);
      // `translate`, not `transform`: the bigger active pin's `scale` would scale a transform's offset too
      b.style.translate = `${x.toFixed(1)}px ${y.toFixed(1)}px`;
      if (!past && Number(b.dataset.i) === active) activeAt = [paneBox.left + x, paneBox.top + y];
      if (past && Number(b.dataset.p) === pastOpen) pastAt = [paneBox.left + x, paneBox.top + y];
    });
    const bubbles: Array<[HTMLElement, CanvasPoint | null]> = [
      [pop, activeAt],
      [pastPop, pastAt],
    ];
    for (const [bubble, at] of bubbles) {
      if (!at || bubble.hidden) continue;
      const w = bubble.offsetWidth;
      const h = bubble.offsetHeight;
      const ins = insets();
      const maxLeft = innerWidth - ins.right - w - 12;
      let left = at[0] + 44;
      if (left > maxLeft) left = at[0] - w - 16;
      left = Math.max(12, Math.min(maxLeft, left));
      const top = Math.max(
        narrow() ? topClear() + 8 : 64,
        Math.min(innerHeight - ins.bottom - h - 12, at[1] - 46),
      );
      bubble.style.transform = `translate(${left.toFixed(0)}px, ${top.toFixed(0)}px)`;
    }
  }

  // The hint points at the pin tool, wherever the tools have moved (a phone: under them, styles.css).
  function placeHint(): void {
    if (hint.hidden || narrow()) return;
    const button = find(box, '[data-tool=pin]').getBoundingClientRect();
    hint.style.left = `${(button.left + button.width / 2).toFixed(0)}px`;
  }

  function loop(): void {
    if (closed) return;
    place();
    placeHint();
    raf = requestAnimationFrame(loop);
  }

  // ---------- the panel ----------

  function renderNotes(): void {
    const list = find(box, '.aib-notes');
    list.replaceChildren(
      ...notes.pins.map((pin, i) => {
        const row = el(`<li class="aib-note" data-i="${i}">
          <span class="aib-num">${i + 1}</span>
          <span class="aib-note-body"><small></small><span></span><em class="aib-retry" hidden></em><em class="aib-understood" hidden></em><em class="aib-report-status" hidden></em>${onReport ? `<button class="soft aib-report" data-act="pin-report" hidden>${esc(t('Send to the developer'))}</button>` : ''}</span>
          ${pin.photos?.length ? `<span class="aib-note-photos" title="${esc(t('{0, plural, one {# photo} other {# photos}}', pin.photos.length))}">${icon('image', 12)}${pin.photos.length}</span>` : ''}
          <button class="ib" data-act="pin-delete" title="${esc(t('Delete'))}">${icon('trash', 14)}</button>
        </li>`);
        row.classList.toggle('on', i === active);
        find(row, 'small').textContent = pinLabel(pin, t('Outside'));
        const retry = find(row, '.aib-retry');
        retry.hidden = !pin.retry;
        retry.textContent = pin.retry ? retryText(pin.retry) : '';
        const understood = find(row, '.aib-understood');
        understood.textContent = understoodText(pin.retry);
        understood.hidden = !understood.textContent;
        showReportStatus(find(row, '.aib-report-status'), pin);
        // A pin that came back can be sent to the developer from its row too (the owner looked for the button here).
        const rowReport = row.querySelector<HTMLElement>('[data-act=pin-report]');
        if (rowReport) {
          rowReport.hidden = !pin.retry || !!reportStatusText(pin);
          tip(rowReport, REPORT_TIP());
        }
        const words = find(row, '.aib-note-body>span');
        words.textContent = pinWords(pin) || t('What is wrong here?');
        words.classList.toggle('muted', !pinWords(pin));
        return row;
      }),
    );
    find(box, '.aib-empty').hidden = notes.pins.length > 0;
    renderSend();
  }

  // How the last round went: how many pins worked out; those that did not are pinned again.
  function renderLast(): void {
    const line = find(box, '.aib-last');
    const pins = lastRound?.pins || [];
    line.hidden = !pins.length;
    if (!pins.length) return;
    const done = pins.filter(pin => pin.made === 'yes').length;
    line.classList.toggle('all', done === pins.length);
    line.textContent =
      done === pins.length
        ? t('{0, plural, one {The change is made.} other {All # changes are made.}}', pins.length)
        : t('{0} of {1} changes are made. The rest are pinned again, each with why.', done, pins.length);
  }

  // A thing that did not fit, by its short name and room ("Base cabinets · Kitchen").
  function unplacedLabel(thing: UnplacedThing): string {
    return [thing.thing, thing.room].filter(Boolean).join(' · ') || thing.say;
  }

  // The things the service could not place clear, each told once in a few words: which, and that the owner moves it in the
  // editor. A tap on a row shows where it stands (as a pin of an earlier round does); an older service's phrase (the thing and
  // why) keeps D-083's words.
  function renderUnplaced(): void {
    const list = find(box, '.aib-cannot');
    list.hidden = !unplaced.length;
    list.replaceChildren(
      ...unplaced.map((thing, k) => {
        const row = el(`<li><button class="aib-unplaced" data-u="${k}">
          <span class="aib-num">${icon('alert', 13)}</span>
          <span class="aib-note-body"><small></small><span></span></span></button></li>`);
        const named = thing.thing !== undefined || thing.room !== undefined;
        find(row, '.aib-unplaced').classList.toggle('on', k === unplacedOpen);
        find(row, 'small').textContent = named ? unplacedLabel(thing) : '';
        find(row, 'small').hidden = !named;
        find(row, '.aib-note-body>span').textContent = named
          ? t('Did not fit: move it in the editor')
          : t('We can’t do this yet: {0}', thing.say);
        return row;
      }),
    );
  }

  // A tap on a thing's row (or its marker) shows it on the home; another tap hides it.
  function toggleUnplaced(k: number): void {
    unplacedOpen = unplacedOpen === k ? null : k;
    renderPins();
    renderUnplaced();
  }

  function renderSend(): void {
    const count = changeCount(notes);
    const button = find<HTMLButtonElement>(box, '[data-act=send]');
    button.disabled = sending;
    button.innerHTML = sending
      ? `<i class="spin"></i>${esc(t('Sending…'))}`
      : count
        ? esc(t('Send {0, plural, one {# change} other {# changes}}', count))
        : esc(t('All right, finish'));
    const after = find(box, '.aib-after');
    if (after.classList.contains('err')) return;
    after.textContent = count
      ? t('We change your home and show it again.')
      : t('It opens in the editor: everything stays changeable.');
  }

  function changed(): void {
    onChange(notes);
    renderPins();
    renderNotes();
  }

  async function send(): Promise<void> {
    if (sending) return;
    setActive(null);
    sending = true;
    const after = find(box, '.aib-after');
    after.classList.remove('err');
    renderSend();
    try {
      await onSend(notes);
    } catch (e) {
      sending = false;
      after.classList.add('err');
      // onSend fails with an Error (ai-build.ts post).
      after.textContent = t('Could not send: {0}', (e as Error).message);
      renderSend();
    }
  }

  function togglePhoto(): void {
    photoOpen = !photoOpen;
    find(box, '.aib-photo-big').hidden = !photoOpen;
    fit();
  }

  function toggleCollapsed(): void {
    collapsed = !collapsed;
    panel.classList.toggle('collapsed', collapsed);
    const b = find(panel, '[data-act=collapse]');
    b.innerHTML = icon(collapsed ? 'up' : 'down', 16);
    b.title = collapsed ? t('Expand') : t('Collapse');
    const ins = insets();
    ed.setBare(view, {right: ins.right, bottom: ins.bottom});
  }

  // ---------- sending a pin to the developer ----------

  // A pin that came back (not done, can't do yet, not understood) can go to the developer, once, with a line of the owner's
  // own (D-129). Then the pin shows where it stands instead of the button: sent, being looked at, fixed, or can't be done
  // with the developer's note.
  const reporting = new Set<Pin>();
  // The pin whose line is open, before it is sent.
  let reportOpen: Pin | null = null;

  /** What the pin says of its report, or '' when it was not sent. */
  function reportStatusText(pin: Pin): string {
    const report = reportOf(pin, reports);
    if (!report && !pin.retry?.reported) return '';
    return reportStatusWords(report?.status ?? 'sent', report?.note);
  }

  function showReportStatus(line: HTMLElement, pin: Pin): void {
    const text = reportStatusText(pin);
    line.textContent = text;
    line.hidden = !text;
    line.dataset.status = reportOf(pin, reports)?.status ?? 'sent';
  }

  function renderReport(pin: Pin): void {
    const reportBox = pop.querySelector<HTMLElement>('.aib-report-box');
    if (!reportBox) return;
    reportBox.hidden = !pin?.retry;
    if (!pin?.retry) return;
    const statusLine = find(reportBox, '.aib-report-status');
    showReportStatus(statusLine, pin);
    const sent = !statusLine.hidden;
    const formOpen = !sent && reportOpen === pin;
    find(reportBox, '.aib-report').hidden = sent || formOpen;
    find(reportBox, '.aib-report-form').hidden = !formOpen;
    find<HTMLButtonElement>(reportBox, '[data-act=pin-report-send]').disabled = reporting.has(pin);
  }

  function openReportLine(pin: Pin | undefined): void {
    if (!pin?.retry || pin.retry.reported) return;
    reportOpen = pin;
    renderReport(pin);
    const line = find<HTMLInputElement>(pop, '.aib-report-line');
    line.value = '';
    line.focus();
  }

  async function report(pin: Pin | undefined): Promise<void> {
    if (!pin?.retry || pin.retry.reported || reporting.has(pin)) return;
    const comment = find<HTMLInputElement>(pop, '.aib-report-line').value.trim();
    reporting.add(pin);
    renderReport(pin);
    try {
      // The button that leads here is there only with onReport.
      await onReport!(pin, comment);
      pin.retry = {...pin.retry, reported: true};
      reportOpen = null;
      changed();
    } catch {
      photoError(t('Not sent: check the connection and try again'));
    } finally {
      reporting.delete(pin);
      if (active != null && notes.pins[active] === pin) renderReport(pin);
    }
  }

  // "Send to the developer" in the bubble opens its line there; in a row it opens that pin's bubble with the line, after the
  // bubble has put the focus in its text (setActive), so the line keeps it.
  function reportFrom(button: HTMLElement): void {
    const row = button.closest<HTMLElement>('.aib-note');
    if (!row) {
      if (active != null) openReportLine(notes.pins[active]);
      return;
    }
    const pin = notes.pins[Number(row.dataset.i)];
    setActive(Number(row.dataset.i));
    requestAnimationFrame(() => openReportLine(pin));
  }

  /** The reports as the service tells them now: the pin open and the list show where each stands. */
  function setReports(next: ReportView[]): void {
    reports = next;
    renderNotes();
    if (active != null && notes.pins[active]) renderReport(notes.pins[active]);
  }

  // ---------- input ----------

  box.addEventListener('click', e => {
    const unplacedRow = targetOf(e).closest<HTMLElement>('.aib-unplaced');
    if (unplacedRow) return toggleUnplaced(Number(unplacedRow.dataset.u));
    const target = targetOf(e).closest<HTMLElement>('[data-act],[data-tool],[data-view],.aib-note');
    if (target?.classList.contains('past')) return openPast(Number(target.dataset.p));
    if (!target) return;
    // The markup's tools and views are these.
    if (target.dataset.tool) return setTool(target.dataset.tool as ReviewTool);
    if (target.dataset.view) return setView(target.dataset.view as Pane);
    const act = target.dataset.act;
    if (act === 'back') return onBack();
    if (act === 'hint-close') return hideHint();
    if (act === 'fit') return fit();
    if (act === 'photo') return togglePhoto();
    if (act === 'collapse') return toggleCollapsed();
    if (act === 'send') return send();
    if (act === 'pin-done') return setActive(null);
    if (act === 'pin-cancel') return cancelPin();
    if (act === 'pin-photo') return pop.querySelector<HTMLInputElement>('input[type=file]')?.click();
    if (act === 'pin-sketch' && active != null) return openSketch(notes.pins[active]);
    if (act === 'past-close') return closePast();
    if (act === 'past-again') return pinAgain();
    if (act === 'pin-report') return reportFrom(target);
    if (act === 'pin-report-send' && active != null) return report(notes.pins[active]);
    if (act === 'photo-remove' && active != null) {
      notes.pins[active].photos.splice(Number(target.dataset.k), 1);
      changed();
      return renderThumbs();
    }
    if (act === 'pin-delete') {
      const row = target.closest<HTMLElement>('.aib-note');
      // Not on a row: the bubble's button, and the bubble is open only with a pin active.
      return removePin(row ? Number(row.dataset.i) : (active as number));
    }
    if (target.classList.contains('aib-note')) setActive(Number(target.dataset.i));
  });
  box.addEventListener('pointerover', e => {
    const row = targetOf(e).closest<HTMLElement>('.aib-note');
    const past = row?.classList.contains('past');
    const next = row && !past ? Number(row.dataset.i) : null;
    const nextPast = row && past ? Number(row.dataset.p) : null;
    const unplacedRow = targetOf(e).closest<HTMLElement>('.aib-unplaced');
    const nextUnplaced = unplacedRow ? Number(unplacedRow.dataset.u) : null;
    if (next !== hovered || nextPast !== pastHovered || nextUnplaced !== unplacedHovered) {
      hovered = next;
      pastHovered = nextPast;
      unplacedHovered = nextUnplaced;
      renderPins();
    }
  });
  // Off the rows, to the home or anywhere outside the panel: no row is pointed at.
  box.addEventListener('pointerout', e => {
    // Where the pointer went: an element, or nothing (out of the window).
    if ((e.relatedTarget as Element | null)?.closest?.('.aib-note,.aib-unplaced')) return;
    if (hovered == null && pastHovered == null && unplacedHovered == null) return;
    hovered = null;
    pastHovered = null;
    unplacedHovered = null;
    renderPins();
  });
  popText.addEventListener('input', () => {
    if (active == null) return;
    notes.pins[active].text = popText.value;
    onChange(notes);
    renderNotes();
    pinLayer.querySelector(`[data-i="${active}"]`)?.classList.toggle('draft', !popText.value.trim());
  });
  popText.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      setActive(null);
    } else if (e.key === 'Escape') setActive(null);
  });
  general.addEventListener('input', () => {
    notes.text = general.value;
    onChange(notes);
    renderSend();
  });
  general.addEventListener('keydown', e => e.stopPropagation());
  // The line sent with a pin to the developer: Enter sends it, Escape closes it unsent.
  pop.querySelector('.aib-report-line')?.addEventListener('keydown', event => {
    const e = event as KeyboardEvent;
    e.stopPropagation();
    if (active == null) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      report(notes.pins[active]);
    } else if (e.key === 'Escape') {
      reportOpen = null;
      renderReport(notes.pins[active]);
    }
  });
  // Photos: chosen, pasted into the bubble, or dropped onto it or onto a pin's row.
  pop.querySelector('input[type=file]')?.addEventListener('change', e => {
    // The file input the handler is on; a file input always has its list.
    const input = e.target as HTMLInputElement;
    if (active != null) addPhotos(notes.pins[active], input.files!);
    input.value = '';
  });
  popText.addEventListener('paste', e => {
    const files = [...(e.clipboardData?.files || [])].filter(isPicture);
    if (!files.length || active == null) return;
    e.preventDefault();
    addPhotos(notes.pins[active], files);
  });
  // A file dropped anywhere goes to the pin under it (its row) or the pin being written, never opens in the browser in the
  // page's place.
  const carriesFiles = (e: DragEvent): boolean => [...(e.dataTransfer?.types || [])].includes('Files');
  const dropPin = (e: DragEvent): number | null => {
    const row = targetOf(e).closest?.<HTMLElement>('.aib-note');
    return row ? Number(row.dataset.i) : active;
  };
  let lit: Element | null = null;
  const light = (target: Element | null): void => {
    if (lit === target) return;
    lit?.classList.remove('aib-drop-over');
    lit = target;
    lit?.classList.add('aib-drop-over');
  };
  // dataTransfer: carriesFiles saw it.
  function dragOver(e: DragEvent): void {
    if (!carriesFiles(e)) return;
    e.preventDefault();
    const i = upload ? dropPin(e) : null;
    e.dataTransfer!.dropEffect = i == null ? 'none' : 'copy';
    light(i == null ? null : targetOf(e).closest?.('.aib-note') || pop);
  }
  function dragLeave(e: DragEvent): void {
    if (!e.relatedTarget) light(null);
  }
  function drop(e: DragEvent): void {
    if (!carriesFiles(e)) return;
    e.preventDefault();
    light(null);
    const i = upload ? dropPin(e) : null;
    if (i == null || !notes.pins[i]) return;
    if (i !== active) setActive(i);
    addPhotos(notes.pins[i], e.dataTransfer!.files);
  }
  pinLayer.addEventListener('click', e => {
    const b = targetOf(e).closest<HTMLElement>('.aib-pin');
    if (b?.dataset.u != null) toggleUnplaced(Number(b.dataset.u));
    else if (b?.dataset.p != null) openPast(Number(b.dataset.p));
    else if (b) setActive(Number(b.dataset.i));
  });

  // The plan: the editor's own clicks never reach it — a drag pans, a click puts a pin (the wheel still zooms, as in the editor).
  let press: {id: number; x: number; y: number; ox: number; oy: number; moved: boolean} | null = null;
  const onPin = (e: Event): boolean => !!targetOf(e).closest?.('.aib-pin');
  function planDown(e: PointerEvent): void {
    if (view !== 'plan' || onPin(e)) return;
    e.stopPropagation();
    e.preventDefault();
    press = {id: e.pointerId, x: e.clientX, y: e.clientY, ox: ed.v.ox, oy: ed.v.oy, moved: false};
    try {
      panes.plan.setPointerCapture(e.pointerId);
    } catch {} // a pointer the browser no longer tracks
  }
  function planMove(e: PointerEvent): void {
    if (view !== 'plan' || onPin(e)) return;
    e.stopPropagation();
    if (!press || e.pointerId !== press.id) return;
    const dx = e.clientX - press.x;
    const dy = e.clientY - press.y;
    if (Math.hypot(dx, dy) > CLICK_PX) press.moved = true;
    if (!press.moved) return;
    ed.v.ox = press.ox + dx;
    ed.v.oy = press.oy + dy;
    ed.v.fitted = false;
    ed.draw();
  }
  function planUp(e: PointerEvent): void {
    if (view !== 'plan' || !press || e.pointerId !== press.id) return;
    e.stopPropagation();
    const click = !press.moved;
    press = null;
    if (!click) return;
    if (tool !== 'pin') return setActive(null);
    const canvas = ed.v.cv.getBoundingClientRect();
    const [x, y] = ed.v.W([e.clientX - canvas.left, e.clientY - canvas.top]);
    addPin({p: [+x.toFixed(3), +y.toFixed(3)]});
  }
  const stop = (e: Event): void => {
    if (view === 'plan') e.stopPropagation();
  };

  // The 3D: dragging orbits as always; a click (no drag) with the pin tool puts a pin on what is under it.
  let press3d: {id: number; x: number; y: number} | null = null;
  function down3d(e: PointerEvent): void {
    if (view !== '3d' || onPin(e)) return;
    press3d = {id: e.pointerId, x: e.clientX, y: e.clientY};
  }
  function up3d(e: PointerEvent): void {
    if (view !== '3d' || !press3d || e.pointerId !== press3d.id) return;
    const moved = Math.hypot(e.clientX - press3d.x, e.clientY - press3d.y) > CLICK_PX;
    press3d = null;
    if (moved) return;
    if (tool !== 'pin') return setActive(null);
    const hit = ed.view.pick(e.clientX, e.clientY);
    if (hit) addPin(hit);
  }

  // Keys: V and P choose the tool, Esc closes the bubble; the editor's shortcuts are off while the review is open. What is
  // typed into the review's fields and the sign-in (ai-account-ui.ts) is theirs.
  function keys(e: KeyboardEvent): void {
    // typing in a field is not a shortcut: a letter or Backspace in the line sent to the developer stays in it
    if (targetOf(e).closest?.('.aib-review textarea, .aib-review input, .aib-sign')) return;
    const key = e.key.toLowerCase();
    if (key === 'v') setTool('look');
    else if (key === 'p') setTool('pin');
    else if (key === 'escape') setActive(null);
    else if ((key === 'delete' || key === 'backspace') && active != null) removePin(active);
    e.stopPropagation();
  }

  function resized(): void {
    const ins = insets();
    ed.setBare(view, {right: ins.right, bottom: ins.bottom});
    placeTools();
  }

  const listeners: Listener[] = [
    [panes.plan, 'pointerdown', planDown],
    [panes.plan, 'pointermove', planMove],
    [panes.plan, 'pointerup', planUp],
    [panes.plan, 'dblclick', stop],
    [panes['3d'], 'pointerdown', down3d],
    [panes['3d'], 'pointerup', up3d],
    [window, 'keydown', keys],
    [window, 'dragover', dragOver],
    [window, 'dragleave', dragLeave],
    [window, 'drop', drop],
  ];
  // Each handler is on the events of its own type.
  for (const [target, type, fn] of listeners) target.addEventListener(type, fn as EventListener, true);
  addEventListener('resize', resized);

  function close(): void {
    if (closed) return;
    closed = true;
    cancelAnimationFrame(raf);
    for (const [target, type, fn] of listeners) target.removeEventListener(type, fn as EventListener, true);
    removeEventListener('resize', resized);
    document.body.classList.remove('aib-pinning');
    pinLayer.remove();
    box.remove();
    ed.setBare(null);
    ed.view.setNight(!!ed.night?.());
  }

  account?.(find(box, '.aib-review-account'));
  setTool(tool);
  // after a round the owner already knows how to pin: the first-time hint came back over the home each round
  if (notes.pins.length || pastRounds.length) hideHint();
  else find(box, '[data-tool=pin]').classList.add('aib-pulse');
  setView(view);
  renderPins();
  renderNotes();
  renderLast();
  renderUnplaced();
  renderPast();
  loop();
  return {close, setReports};
}
