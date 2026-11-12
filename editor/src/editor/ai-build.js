// The AI build (the paid "build my home" service; D-063, D-072, D-073, D-074): screens of its own, apart from the editor's tools.
//   start    — the start screen's card: "Build with AI", or the build this browser follows, live (aiStartCard)
//   upload   — the plan photo and a video of the home; the build starts
//   progress — what the build does now, as it happens: each stage with a line on what it works on and a bar, the rooms on the
//              plan as they are read, each room of the video with the furniture found there, the pieces being made, time left
//   review   — the finished home alone, full screen (ai-review.js), opened by itself when it is ready: pins where something is
//              wrong, words, "All right". Confirmed, the home opens in the editor, theirs to change.
// The service is private; the editor talks to its API only (locally the harness's tools/build-server.ts serves this page):
//   GET  <api>/api/health                         answers: the start screen offers the AI build
//   POST <api>/api/builds                         ← multipart: plan, video… → {id}
//   GET  <api>/api/builds/<id>                    the status: steps, rooms, what the calls found so far (live), time left
//   GET  <api>/api/builds/<id>/plan | home        the plan as read; the home
//   GET  <api>/api/builds/<id>/photo | shot | frame/<room>   the plan photo; the home in 3D; a frame of a room
//   POST <api>/api/builds/<id>/pin-photo?kind=view|photo   a pin's picture (its bytes) → {file}
//   GET  <api>/api/builds/<id>/owner/<file>       a pin's picture
//   POST <api>/api/builds/<id>/answer             {at: 'final', action: 'confirm' | 'correct', text?, pins?}
//   POST <api>/api/builds/<id>/resume             start a stopped build again
import {t, N, getLang} from '../i18n/i18n.js';
import {el, esc} from './ui.js';
import {icon} from './icons.js';
import {readPlan} from '../core/plan-file.js';
import {emptyPlan} from '../core/plan.js';
import {kindName, localRoomName, numberAlike} from '../core/overview.js';
import {byId} from '../core/catalog.js';
import {openReview} from './ai-review.js';
import {changeCount, pinsToSend, pinsToRetry} from './ai-pins.js';

const POLL_MS = 2000;
const START_POLL_MS = 3000;
const NOTES = 'home-twin-editor:ai-notes:';
// The build this browser started or opened last: the start screen shows how it goes until its home is opened.
const FOLLOWED = 'home-twin-editor:ai-build';
// A step works for minutes between the things it finds: meanwhile what it does is named in turn, a new line this often.
const PHRASE_SECONDS = 5;

// What the owner sees as stages; each is a few of the build's own steps (the harness's tools/steps.ts). The plan runs beside
// the rooms, so two stages can run at once.
const STAGES = [
  {key: 'plan', steps: ['plan'], label: N('Reading the plan'), note: N('Rooms, doors and windows from the photo')},
  {key: 'rooms', steps: ['split', 'frames', 'recon', 'rooms'], label: N('Rooms from the video'), note: N('The size of each room and what stands there')},
  {key: 'furniture', steps: ['bind', 'ours', 'parts', 'colours'], label: N('Furniture'), note: N('The shape and colour of each piece')},
  {key: 'assembly', steps: ['assemble', 'check'], label: N('Assembly'), note: N('Everything in its place, then checked')},
  {key: 'final', steps: ['shot', 'report'], label: N('Final check'), note: N('A last look over the whole home')},
];
// What each step does while it has nothing new to show, named in turn: each line true of that step (a dry word now and then).
const PHRASES = {
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
  planFix: [N('Checking that the walls meet'), N('Setting each window on its wall'), N('Double-checking the plan')],
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
  colours: [N('Measuring the colours'), N('Taking the colours from the frames'), N('Telling beige from cream')],
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
  revise: [N('Making your changes'), N('Reading your pins'), N('Moving things as you asked'), N('Checking the changes landed')],
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
const roomName = room =>
  room.name
    ? getLang() === 'en'
      ? room.name
      : localRoomName(room.name, t)
    : kindName(room.guess, t);

// Each room of the video by its id, named (roomName); two that would read the same are numbered in video order.
function videoRoomNames(rooms) {
  const names = numberAlike(rooms.map(roomName));
  return new Map(rooms.map((room, index) => [room.id, names[index]]));
}

// A piece of furniture as the build lists it ({type, model?, label}): our catalog's name in the owner's language when the room
// call matched it to one, else the call's own words.
function pieceName(piece) {
  const model = byId(piece.type) || (piece.model ? byId(piece.model) : null);
  return model ? t(model.name).replace(/­/g, '') : piece.label;
}

/** Whether the AI build's service answers here: only then does the start screen offer it. */
export async function aiService(api = '') {
  try {
    const res = await fetch(`${api}/api/health`, {cache: 'no-store'});
    return res.ok && (await res.json()).ok === true;
  } catch {
    return false;
  }
}

// ---------- the build this browser follows ----------

function followedBuild() {
  try {
    return localStorage.getItem(FOLLOWED);
  } catch {
    return null;
  }
}

function follow(id) {
  try {
    if (id) localStorage.setItem(FOLLOWED, id);
    else localStorage.removeItem(FOLLOWED);
  } catch {}
}

// ---------- reading a status ----------

function stageState(status, stage) {
  if (!status?.steps?.length) return 'todo';
  if (status.waiting === 'final' && stage.key === 'final') return 'ask';
  if (status.revising && (stage.key === 'assembly' || stage.key === 'final')) return stage.key === 'assembly' ? 'running' : 'todo';
  const states = stage.steps.map(name => status.steps.find(x => x.name === name)?.state || 'todo');
  if (states.some(x => x === 'running')) return 'running';
  if (states.every(x => x === 'done')) return 'done';
  if (states.some(x => x === 'done') && status.alive && !status.error) return 'running';
  return 'todo';
}

// The stage the build is busiest with: the last one running (the plan runs beside the rooms).
function currentStage(status) {
  const running = STAGES.filter(stage => stageState(status, stage) === 'running');
  return running.at(-1) || STAGES.find(stage => stageState(status, stage) !== 'done') || STAGES.at(-1);
}

// How far a stage is, by its steps' usual time and the time they still need (the build server's estimate).
function stageShare(status, stage) {
  const steps = status.steps.filter(x => stage.steps.includes(x.name));
  const typical = steps.reduce((sum, x) => sum + (x.typical || 0), 0);
  const left = steps.reduce((sum, x) => sum + (x.left || 0), 0);
  return typical ? Math.max(0.03, Math.min(0.97, 1 - left / typical)) : 0;
}

function etaText(seconds) {
  if (seconds == null) return '';
  if (seconds < 40) return t('Almost done');
  const minutes = Math.max(1, Math.round(seconds / 60));
  return t('About {0, plural, one {# minute} other {# minutes}} left', minutes);
}

const percent = share => `${Math.round(Math.max(0, Math.min(1, share)) * 100)}%`;

/** A small outline of the plan's rooms, north up. */
function planSvg(plan) {
  const rings = plan.rooms.filter(room => !room.solid).map(room => room.polygon);
  const xs = rings.flat().map(p => p[0]);
  const ys = rings.flat().map(p => p[1]);
  const x0 = Math.min(...xs);
  const y1 = Math.max(...ys);
  const w = Math.max(...xs) - x0;
  const h = y1 - Math.min(...ys);
  const d = ring => 'M' + ring.map(([x, y]) => `${(x - x0).toFixed(2)} ${(y1 - y).toFixed(2)}`).join('L') + 'Z';
  return `<svg viewBox="-.3 -.3 ${(w + 0.6).toFixed(2)} ${(h + 0.6).toFixed(2)}" aria-hidden="true">${rings.map(r => `<path d="${d(r)}"/>`).join('')}</svg>`;
}

// ---------- the start screen's card ----------

/**
 * The start screen's AI card (flows.js offerAi): "Build with AI", or — while a build this browser follows is on its way — that
 * build: the stage it is at, the time left and a bar, kept up to date while the start screen is shown. Opens the build, or
 * the upload for a new one.
 */
export function aiStartCard(ed, card, {api = ''} = {}) {
  const idle = card.innerHTML;
  const another = el(`<button class="aib-start-new" hidden>${icon('plus', 18)}${esc(t('Start another build'))}</button>`);
  card.after(another);
  let shown = null;
  let timer = 0;

  const open = id => openAiBuild(ed, {api, id});
  card.onclick = () => open(shown ? followedBuild() : null);
  another.onclick = () => {
    follow(null);
    show(null);
    open(null);
  };

  function show(status) {
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
    const title = ready ? t('Your home is ready') : stopped ? t('The build stopped') : status.revising ? t('Changing your home…') : t('Your home is being built');
    const note = ready
      ? t('Look at it in 3D and say what to change.')
      : stopped
        ? t('Open it to try again.')
        : [t(currentStage(status).label), etaText(status.eta)].filter(Boolean).join(' · ');
    const badge = ready && status.has?.shot
      ? `<img src="${api}/api/builds/${encodeURIComponent(status.id)}/shot" alt="">`
      : ready
        ? icon('house', 20)
        : stopped
          ? icon('alert', 20)
          : '<i class="aib-start-spin"></i>';
    if (card.dataset.state !== state) {
      card.dataset.state = state;
      card.innerHTML = `<span class="ci aib-start-badge"></span><b></b><span class="aib-start-note"></span><i class="aib-start-meter"><i></i></i>${icon('right', 18)}`;
      card.querySelector('.aib-start-badge').innerHTML = badge;
    }
    card.querySelector('b').textContent = title;
    card.querySelector('.aib-start-note').textContent = note;
    const meter = card.querySelector('.aib-start-meter');
    meter.hidden = ready || stopped;
    meter.firstChild.style.width = percent(status.share || 0);
  }

  async function refresh() {
    clearTimeout(timer);
    timer = setTimeout(refresh, START_POLL_MS);
    const id = followedBuild();
    const onScreen = !card.closest('#start')?.hidden && !document.hidden;
    if (!onScreen) return;
    if (!id) return show(null);
    try {
      const res = await fetch(`${api}/api/builds/${encodeURIComponent(id)}`, {cache: 'no-store'});
      if (res.status === 404) {
        follow(null);
        return show(null);
      }
      if (!res.ok) return;
      const status = await res.json();
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
 * Opens the AI build over the editor: the upload screen, or a build's progress when its id is known (the page's ?build=<id>,
 * the start screen's card). flows — the start screen (flows.js): back to it, and the plan kept aside before a new one replaces it.
 */
export function openAiBuild(ed, {api = '', id = null, flows = ed.flows} = {}) {
  const root = el(`<div class="aib"></div>`);
  document.body.append(root);
  flows?.hideStart();
  let buildId = id;
  let status = null;
  let screen = null;
  let review = null;
  let timer = 0;
  let closed = false;
  // The checkpoint answered just now: until the build moves on, it does not count as waiting.
  let answered = null;
  // The finished home opens by itself once; after "back" the owner opens it from its card.
  let shownFinal = false;
  // The plan as read: its outline and what it holds, once the plan call is done.
  let planRead = null;
  const base = () => `${api}/api/builds/${encodeURIComponent(buildId)}`;
  if (buildId) follow(buildId);

  // ---------- the address and the editor underneath ----------

  function setAddress(value) {
    const url = new URL(location.href);
    if (value) url.searchParams.set('build', value);
    else url.searchParams.delete('build');
    history.replaceState(history.state, '', url);
  }

  // The service builds the home: the editor's own setup steps stay out of the way, without the "setup paused" note.
  function quietSetup() {
    ed.exitWizard();
    ed.banner();
  }

  // A full-screen page of the AI build is up: the 3D under it draws nothing.
  function cover(on) {
    if (on) ed.view.pause?.();
    else ed.view.resume?.();
  }

  // ---------- notes kept while the owner looks (pins and words), per build ----------

  const notesKey = () => `${NOTES}${buildId}:final`;
  function loadNotes() {
    try {
      const saved = JSON.parse(localStorage.getItem(notesKey()) || 'null');
      if (saved && Array.isArray(saved.pins)) return {pins: saved.pins, text: saved.text || ''};
    } catch {}
    return {pins: [], text: ''};
  }
  function saveNotes(notes) {
    try {
      localStorage.setItem(notesKey(), JSON.stringify(notes));
    } catch {}
  }
  function clearNotes() {
    try {
      localStorage.removeItem(notesKey());
    } catch {}
  }
  // The pins of the service's last round that did not work out come back once, as pins to look at again.
  const retriedKey = () => `${NOTES}${buildId}:retried`;
  function notesWithRetries() {
    const notes = loadNotes();
    const round = status?.lastRound?.round;
    if (!round) return notes;
    let retried = 0;
    try {
      retried = Number(localStorage.getItem(retriedKey()) || 0);
    } catch {}
    if (retried >= round) return notes;
    notes.pins.push(...pinsToRetry(status.lastRound));
    saveNotes(notes);
    try {
      localStorage.setItem(retriedKey(), String(round));
    } catch {}
    return notes;
  }

  // ---------- talking to the service ----------

  async function getJson(path) {
    const res = await fetch(base() + path, {cache: 'no-store'});
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
    return res.json();
  }

  // A pin's picture to the service → its name there.
  async function uploadPicture(blob, kind) {
    const res = await fetch(`${base()}/pin-photo?kind=${kind}`, {
      method: 'POST',
      headers: {'content-type': blob.type || 'application/octet-stream'},
      body: blob,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || res.statusText);
    return data.file;
  }

  async function post(path, body) {
    const res = await fetch(base() + path, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify(body || {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || res.statusText);
    return data;
  }

  async function poll() {
    clearTimeout(timer);
    if (closed || !buildId) return;
    try {
      const s = await getJson('');
      if (answered && s.waiting !== answered) answered = null;
      status = answered && s.waiting === answered ? {...s, waiting: null} : s;
      if (status.has?.plan && !planRead) await loadPlanRead();
      if (status.waiting !== 'final') shownFinal = false;
      // The home is ready: straight to it, the pin in hand.
      if (status.waiting === 'final' && screen === 'progress' && !shownFinal) {
        shownFinal = true;
        startReview();
      } else if (screen === 'progress') renderProgress();
    } catch (e) {
      status = {...(status || {steps: [], rooms: [], has: {}}), error: e.message};
      if (screen === 'progress') renderProgress();
    }
    timer = setTimeout(poll, POLL_MS);
  }

  async function loadPlanRead() {
    try {
      const res = await fetch(`${base()}/plan`, {cache: 'no-store'});
      if (!res.ok) return;
      const plan = readPlan(await res.text());
      planRead = {svg: planSvg(plan), rooms: plan.rooms.filter(room => !room.solid).length, openings: plan.openings.length};
    } catch {}
  }

  // ---------- the upload ----------

  function showUpload() {
    screen = 'upload';
    cover(true);
    const files = {plan: null, videos: []};
    const drop = (kind, ic, title, note, accept, multiple) => `
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
            <button class="primary aib-big" data-act="start" disabled>${icon('sparkles', 16)}${esc(t('Build my home'))}</button>
          </div>
          <div class="aib-sending" hidden><i class="aib-meter"><i></i></i><span></span></div>
        </main>
      </div>`;
    const start = root.querySelector('[data-act=start]');
    const sync = () => {
      start.disabled = !files.plan || !files.videos.length;
    };
    const setFiles = (kind, list) => {
      const label = root.querySelector(`.aib-drop[data-kind=${kind}]`);
      const shown = label.querySelector('.aib-drop-file');
      if (kind === 'plan') {
        const image = list.find(f => f.type.startsWith('image/'));
        if (!image) return;
        files.plan = image;
        shown.innerHTML = `<img alt="">`;
        shown.querySelector('img').src = URL.createObjectURL(image);
      } else {
        const videos = list.filter(f => f.type.startsWith('video/'));
        if (!videos.length) return;
        files.videos = videos;
        const megabytes = videos.reduce((sum, f) => sum + f.size, 0) / 1e6;
        shown.innerHTML = `<video muted playsinline preload="metadata"></video><small></small>`;
        shown.querySelector('video').src = URL.createObjectURL(videos[0]) + '#t=1';
        shown.querySelector('small').textContent = t('{0, plural, one {# video} other {# videos}}', videos.length) + ` · ${Math.round(megabytes)} MB`;
      }
      shown.hidden = false;
      label.classList.add('has');
      sync();
    };
    for (const label of root.querySelectorAll('.aib-drop')) {
      const kind = label.dataset.kind;
      const input = label.querySelector('input');
      input.onchange = () => setFiles(kind, [...input.files]);
      label.addEventListener('dragover', e => {
        e.preventDefault();
        label.classList.add('over');
      });
      label.addEventListener('dragleave', () => label.classList.remove('over'));
      label.addEventListener('drop', e => {
        e.preventDefault();
        label.classList.remove('over');
        setFiles(kind, [...e.dataTransfer.files]);
      });
    }
    root.querySelector('[data-act=exit]').onclick = exit;
    start.onclick = () => send(files);
  }

  // The files go up with a progress bar (fetch reports no upload progress); then the build's progress.
  function send(files) {
    const sending = root.querySelector('.aib-sending');
    const bar = sending.querySelector('.aib-meter>i');
    const line = sending.querySelector('span');
    const start = root.querySelector('[data-act=start]');
    start.disabled = true;
    sending.hidden = false;
    sending.classList.remove('err');
    line.textContent = t('Uploading…');
    const form = new FormData();
    // The language the owner reads: the build names the rooms and the furniture in it.
    form.append('lang', getLang());
    form.append('plan', files.plan);
    for (const video of files.videos) form.append('video', video);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${api}/api/builds`);
    xhr.upload.onprogress = e => {
      if (!e.lengthComputable) return;
      const share = e.loaded / e.total;
      bar.style.width = `${Math.round(share * 100)}%`;
      line.textContent = t('Uploading… {0}%', Math.round(share * 100));
    };
    const failed = message => {
      sending.classList.add('err');
      line.textContent = t('Could not upload: {0}', message);
      start.disabled = false;
    };
    xhr.onerror = () => failed(t('no connection'));
    xhr.onload = async () => {
      let data = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status >= 300 || !data.id) return failed(data.error || xhr.statusText);
      // A new home: the plan open now is kept aside ("Restore previous plan"), the editor starts clean.
      await flows?.keepPrev?.();
      await ed.underlay.clear();
      ed.setPlan(emptyPlan(), {fit: false});
      quietSetup();
      buildId = data.id;
      follow(buildId);
      setAddress(buildId);
      showProgress();
      poll();
    };
    xhr.send(form);
  }

  // ---------- the progress ----------

  function showProgress() {
    closeReview();
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
    root.querySelector('[data-act=exit]').onclick = exit;
    root.querySelector('[data-act=copy]').onclick = async e => {
      const button = e.currentTarget;
      try {
        await navigator.clipboard.writeText(location.href);
        button.textContent = t('Copied');
      } catch {
        button.textContent = location.href;
      }
    };
    root.querySelector('.aib-cta').addEventListener('click', onCta);
    renderProgress();
  }

  const stepRunning = name => status.steps?.find(x => x.name === name)?.state === 'running';
  const roomById = id => status.rooms?.find(room => room.id === id);
  const nameOf = room => videoRoomNames(status.rooms || []).get(room?.id) ?? roomName(room || {guess: ''});
  // A line that changes every few seconds, the same for everyone looking at the same moment; offset — another place in the turn.
  const turn = () => Math.floor(Date.now() / 1000 / PHRASE_SECONDS);
  const inTurn = (list, offset = 0) => list[(turn() + offset) % list.length];
  // What the step does, in turn.
  const phrase = step => t(inTurn(PHRASES[step]));
  // Every other turn: a line about the work in hand (its room or piece in turn too), what the step does between — the line never
  // stands still for long, and each room still gets its turn.
  const inHalfTurn = list => list[Math.floor(turn() / 2) % list.length];
  const between = (line, step) => (turn() % 2 ? t(inHalfTurn(PHRASES[step])) : line);

  // What the plan call is at: thinking (what it works out, in turn), writing (the rooms as they come), or fixing what our code found.
  function planLine() {
    const call = status.live?.plan;
    if (call && call.round > 0) return phrase('planFix');
    if (call?.phase === 'writing' && call.rooms.length) return t('Found: {0}', call.rooms.at(-1));
    if (call?.phase === 'writing') return t('Writing down the plan');
    return phrase('plan');
  }

  // The line under a running stage: what it is working on right now.
  function stageLine(stage) {
    const live = status.live || {};
    if (stage.key === 'plan') return planLine();
    if (stage.key === 'rooms') {
      if (stepRunning('split')) return phrase('split');
      if (stepRunning('frames')) return phrase('frames');
      const rooms = Object.entries(live.rooms || {});
      const writing = rooms.filter(([, call]) => call.phase === 'writing' && call.pieces.length);
      if (writing.length) {
        const [id, call] = writing.at(-1);
        return `${nameOf(roomById(id))}: ${pieceName(call.pieces.at(-1))}`;
      }
      const looking = rooms.filter(([, call]) => call.phase !== 'done').map(([id]) => roomById(id)).filter(Boolean);
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
      if (status.revising && checking.length) return between(t('Changing: {0}', nameOf(inHalfTurn(checking))), 'revise');
      if (status.revising) return phrase('revise');
      if (stepRunning('assemble')) return phrase('assemble');
      if (checking.length) return between(t('Second look: {0}', nameOf(inHalfTurn(checking))), 'check');
      return phrase('check');
    }
    return phrase(stepRunning('shot') ? 'shot' : 'report');
  }

  // The small count beside a stage's name.
  function stageMeta(stage, state) {
    const live = status.live || {};
    if (state === 'ask') return t('Ready to check');
    if (state !== 'running') return '';
    if (stage.key === 'plan' && live.plan?.rooms?.length) return t('{0, plural, one {# room} other {# rooms}}', live.plan.rooms.length);
    // A room left out (an open-air space the plan does not show) is not counted: its call is not made.
    const builtRooms = (status.rooms || []).filter(room => !room.left);
    if (stage.key === 'rooms' && builtRooms.length) return t('{0} of {1}', builtRooms.filter(room => room.done).length, builtRooms.length);
    if (stage.key === 'furniture' && live.madeCount) return t('{0} ready', live.madeCount);
    if (stage.key === 'assembly' && stepRunning('check') && !status.revising) {
      const total = status.rooms.filter(room => room.name).length;
      return total ? t('{0} of {1}', Math.min(total, live.checked?.length || 0), total) : '';
    }
    return '';
  }

  // A line that changed comes in softly; the same line stays still.
  function setLine(node, text) {
    node.hidden = !text;
    if (node.textContent === text) return;
    node.textContent = text;
    node.classList.remove('aib-swap');
    void node.offsetWidth;
    node.classList.add('aib-swap');
  }

  function renderSteps() {
    STAGES.forEach((stage, i) => {
      const item = root.querySelector(`.aib-step[data-stage="${stage.key}"]`);
      const state = stageState(status, stage);
      if (!item.classList.contains(`st-${state}`)) {
        item.className = `aib-step st-${state}`;
        item.querySelector('.aib-dot').innerHTML =
          state === 'done' ? icon('check', 13) : state === 'running' ? '<i class="spin"></i>' : state === 'ask' ? icon('eye', 13) : String(i + 1);
      }
      item.querySelector('em').textContent = stageMeta(stage, state);
      setLine(item.querySelector('.aib-step-live'), state === 'running' ? stageLine(stage) : '');
      const bar = item.querySelector('.aib-step-bar');
      bar.hidden = state !== 'running';
      if (state === 'running') bar.firstChild.style.width = percent(stageShare(status, stage));
    });
  }

  // The card at the top of the live part: what the owner can do now, or what the build is busy with for them.
  function ctaCard() {
    const s = status;
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

  // The plan: its photo with a line going over it and what the call has found so far; once read, a short card of what it holds.
  function renderReading() {
    const box = root.querySelector('.aib-reading');
    const reading = !!status.has?.photo && !status.has?.plan && !status.error;
    const read = !!planRead;
    box.hidden = !reading && !read;
    const mode = read ? 'read' : reading ? 'reading' : '';
    if (box.dataset.mode !== mode) {
      box.dataset.mode = mode;
      box.innerHTML =
        mode === 'reading'
          ? `<div class="aib-scan"><img src="${base()}/photo" alt=""><i></i></div>
             <div class="aib-reading-line"><i class="spin"></i><span></span></div>
             <div class="aib-tags"></div>`
          : mode === 'read'
            ? `<div class="aib-card aib-plan-read">
                <span class="aib-card-thumb plan">${planRead.svg}</span>
                <span class="aib-card-text"><b>${esc(t('The plan is read'))}</b><small></small></span>
                <span class="aib-done">${icon('check', 15)}</span></div>`
            : '';
    }
    if (mode === 'reading') {
      // The photo is there from the upload; the plan is read once the video is cut into rooms (it learns the rooms from it).
      const next = !stepRunning('plan') && !status.live?.plan;
      box.classList.toggle('aib-waiting', next);
      setLine(box.querySelector('.aib-reading-line span'), next ? t('Your plan is next: first the video is cut into rooms') : planLine());
      const call = status.live?.plan;
      const names = call?.rooms || [];
      const tags = box.querySelector('.aib-tags');
      let count = tags.querySelector('.aib-tag-count');
      const shown = tags.querySelectorAll('.aib-tag:not(.aib-tag-count)').length;
      for (const name of names.slice(shown)) tags.insertBefore(el(`<span class="aib-tag">${icon('check', 12)}${esc(name)}</span>`), count);
      const openings = call?.openings || 0;
      if (openings && !count) {
        count = el(`<span class="aib-tag aib-tag-count"></span>`);
        tags.append(count);
      }
      if (count) count.textContent = t('{0, plural, one {# door or window} other {# doors and windows}}', openings);
    }
    if (mode === 'read') {
      box.querySelector('small').textContent = [
        t('{0, plural, one {# room} other {# rooms}}', planRead.rooms),
        t('{0, plural, one {# door or window} other {# doors and windows}}', planRead.openings),
      ].join(' · ');
    }
  }

  // The furniture being matched with our models or made from parts, and the pieces done: while the furniture stage runs. Each
  // piece keeps its chip where it first came; only its state changes (chips coming and going and moving read as flicker).
  function renderMaking() {
    const box = root.querySelector('.aib-making');
    const live = status.live || {};
    const work =
      live.work ||
      [
        ...(live.making || []).map(piece => ({...piece, state: 'busy'})),
        ...(live.made || []).map(piece => ({...piece, state: 'done'})),
      ];
    const show = stageState(status, STAGES[2]) === 'running' && work.length > 0;
    box.hidden = !show;
    if (!show) return;
    box.querySelector('h3 span').textContent = live.madeCount ? t('{0} ready', live.madeCount) : '';
    const chips = box.querySelector('.aib-chips');
    for (const piece of work) {
      const key = `${piece.room}/${piece.id}`;
      let chip = chips.querySelector(`[data-key="${CSS.escape(key)}"]`);
      if (!chip) {
        chip = el(`<span class="aib-chip" data-key="${esc(key)}"><i class="aib-chip-state"></i><b></b><small></small></span>`);
        chips.append(chip);
      }
      const state = piece.state === 'busy' ? 'busy' : 'done';
      if (chip.dataset.state !== state) {
        chip.dataset.state = state;
        chip.querySelector('.aib-chip-state').innerHTML = state === 'busy' ? '<i class="spin"></i>' : icon('check', 12);
      }
      const name = pieceName(piece);
      const where = nameOf(roomById(piece.room));
      if (chip.querySelector('b').textContent !== name) chip.querySelector('b').textContent = name;
      if (chip.querySelector('small').textContent !== where) chip.querySelector('small').textContent = where;
    }
  }

  // Under a room of the video: the furniture found as its call writes, then how many pieces; the pieces made there now.
  function roomLine(room, looking) {
    const live = status.live || {};
    const call = live.rooms?.[room.id];
    // A garden or a terrace: its call waits for the plan, and is left out when the plan does not show it.
    if (room.left) return t('Not on the plan: not built');
    if (room.waits) return t('Waits for the plan');
    if (!room.done) {
      if (call?.pieces?.length) return `${call.pieces.length} · ${call.pieces.map(pieceName).reverse().join(', ')}`;
      if (!looking) return '';
      // Its call not started yet: the room is being rebuilt in 3D first.
      if (!call && stepRunning('recon')) return t('Measuring in 3D…');
      // Each room whose call works now a step apart in the turn: the cards do not change in step.
      const working = Object.entries(live.rooms || {}).filter(([, other]) => other.phase !== 'done').map(([id]) => id);
      return t(inTurn(ROOM_PHRASES, Math.max(0, working.indexOf(room.id))));
    }
    const making = (live.making || []).filter(work => work.room === room.id);
    if (making.length && stageState(status, STAGES[2]) === 'running') return t('Making: {0}', making.map(pieceName).join(', '));
    return t('{0, plural, one {# piece} other {# pieces}}', room.pieces || call?.pieces?.length || 0);
  }

  function renderRooms() {
    const box = root.querySelector('.aib-rooms');
    const rooms = status.rooms || [];
    const looking = stepRunning('rooms');
    const furnishing = stageState(status, STAGES[2]) === 'running';
    for (const room of rooms) {
      let figure = box.querySelector(`[data-id="${room.id}"]`);
      if (!figure) {
        figure = el(`<figure class="aib-room" data-id="${esc(room.id)}">
          <span class="aib-frame"><img alt="" hidden></span>
          <figcaption><span class="aib-room-name"></span><i class="aib-room-state"></i></figcaption>
          <small class="aib-room-line"></small></figure>`);
        box.append(figure);
      }
      const img = figure.querySelector('img');
      if (room.frame && !img.getAttribute('src')) {
        img.onload = () => {
          img.hidden = false;
        };
        img.src = `${base()}/frame/${encodeURIComponent(room.id)}`;
      }
      figure.querySelector('.aib-room-name').textContent = nameOf(room);
      const busyHere = furnishing && (status.live?.making || []).some(work => work.room === room.id);
      const state = busyHere ? 'running' : room.done ? 'done' : room.left ? 'left' : looking && !room.waits ? 'running' : 'todo';
      if (figure.dataset.state !== state) {
        figure.dataset.state = state;
        figure.querySelector('.aib-room-state').innerHTML =
          state === 'done' ? icon('check', 13) : state === 'running' ? '<i class="spin"></i>' : '';
      }
      const line = figure.querySelector('.aib-room-line');
      const text = roomLine(room, looking);
      if (line.textContent !== text) line.textContent = text;
    }
    root.querySelector('.aib-found').hidden = !rooms.length;
  }

  function renderProgress() {
    if (screen !== 'progress') return;
    const s = status;
    const title = !s
      ? t('Building your home')
      : s.error
        ? t('The build stopped')
        : s.waiting || s.finished
          ? t('Your home is ready')
          : s.revising
            ? t('Changing your home…')
            : t('Building your home');
    root.querySelector('.aib-title').textContent = title;
    root.querySelector('.aib-eta').textContent = s ? etaText(s.eta) : '';
    const overall = root.querySelector('.aib-overall');
    overall.hidden = !s || !!s.error;
    overall.firstChild.style.width = percent(s?.share || 0);
    if (!s) return;
    renderSteps();
    const cta = ctaCard();
    const box = root.querySelector('.aib-cta');
    if (box.dataset.key !== cta.key) {
      box.dataset.key = cta.key;
      box.innerHTML = cta.html;
    }
    renderMaking();
    renderReading();
    renderRooms();
  }

  async function onCta(e) {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'review') startReview();
    else if (act === 'open') openHome();
    else if (act === 'resume') {
      try {
        status = await post('/resume');
        renderProgress();
      } catch (err) {
        status = {...status, error: err.message};
        renderProgress();
      }
    }
  }

  // ---------- the review ----------

  async function loadIntoEditor() {
    const res = await fetch(`${base()}/home`, {cache: 'no-store'});
    if (!res.ok) throw new Error(res.statusText);
    const plan = readPlan(await res.text());
    cover(false);
    ed.setPlan(plan, {fit: false});
    quietSetup();
  }

  async function startReview() {
    try {
      await loadIntoEditor();
    } catch (e) {
      status = {...status, error: e.message};
      renderProgress();
      return;
    }
    screen = 'review';
    root.innerHTML = '';
    review = openReview(ed, {
      host: root,
      photo: status.has?.photo ? `${base()}/photo` : null,
      notes: notesWithRetries(),
      onChange: saveNotes,
      onBack: showProgress,
      onSend: answer,
      upload: uploadPicture,
      pictureUrl: file => `${base()}/owner/${encodeURIComponent(file)}`,
      lastRound: status?.lastRound || null,
      pastRounds: status?.rounds || [],
    });
  }

  function closeReview() {
    review?.close();
    review = null;
  }

  // The owner's answer: changes go to the build and the progress shows them being made; "all right" opens the home.
  async function answer(notes) {
    const count = changeCount(notes);
    const text = notes.text.trim();
    const body = count
      ? {at: 'final', action: 'correct', ...(text ? {text} : {}), pins: pinsToSend(notes.pins)}
      : {at: 'final', action: 'confirm'};
    await post('/answer', body);
    clearNotes();
    answered = 'final';
    status = {...status, waiting: null};
    if (!count) return finish();
    showProgress();
    poll();
  }

  async function openHome() {
    try {
      await loadIntoEditor();
    } catch (e) {
      status = {...status, error: e.message};
      renderProgress();
      return;
    }
    finish();
  }

  // ---------- the end ----------

  function close() {
    closed = true;
    clearTimeout(timer);
    closeReview();
    root.remove();
    cover(false);
    ed.setBare(null);
  }

  // The home is the owner's now: the editor as usual, the 3D large.
  function finish() {
    close();
    follow(null);
    setAddress(null);
    ed.setMain('3d');
    ed.view.home();
    quietSetup();
    ed.banner(t('Your home is ready. Change anything you like.'), [[t('Got it'), () => ed.banner(), true]]);
  }

  // Back to the start screen; a build that goes on shows there, and can be followed again by its link.
  function exit() {
    close();
    setAddress(null);
    ed.showStart();
  }

  if (buildId) {
    setAddress(buildId);
    showProgress();
    poll();
  } else showUpload();
  return {close};
}
