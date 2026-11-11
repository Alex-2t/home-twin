// The AI build (the paid "build my home" service; D-063, D-072, D-073): screens of its own, apart from the editor's tools.
//   upload   — the plan photo and a video of the home; the build starts (the start screen's "Build with AI")
//   progress — what the build does now, the rooms it found in the video, about how long is left. When a result is ready for
//              the owner (① the plan as read, ② the whole home) a card offers to look at it: nothing jumps in by itself.
//   review   — that plan or home alone, full screen (ai-review.js): pins where something is wrong, words, "All right".
// Confirmed at ②, the home opens in the editor, theirs to change.
// The service is private; the editor talks to its API only (locally the harness's tools/build-server.ts serves this page):
//   GET  <api>/api/health                         answers: the start screen offers the AI build
//   POST <api>/api/builds                         ← multipart: plan, video… → {id}
//   GET  <api>/api/builds/<id>                    the status: steps, rooms found, the checkpoint waiting, seconds left
//   GET  <api>/api/builds/<id>/plan | home        the plan as read; the home
//   GET  <api>/api/builds/<id>/photo | shot | frame/<room>   the plan photo; the home in 3D; a frame of a room
//   POST <api>/api/builds/<id>/answer             {at, action: 'confirm' | 'correct', text?, pins?}
//   POST <api>/api/builds/<id>/resume             start a stopped build again
import {t, N} from '../i18n/i18n.js';
import {el, esc} from './ui.js';
import {icon} from './icons.js';
import {readPlan} from '../core/plan-file.js';
import {emptyPlan} from '../core/plan.js';
import {roomKind} from '../core/overview.js';
import {openReview} from './ai-review.js';
import {changeCount, pinsToSend} from './ai-pins.js';

const POLL_MS = 2000;
const NOTES = 'home-twin-editor:ai-notes:';

// What the owner sees as stages; each is a few of the build's own steps (the harness's tools/steps.ts). The plan runs beside
// the rooms, so two stages can run at once.
const STAGES = [
  {steps: ['plan'], label: N('Reading the plan'), note: N('Rooms, doors and windows from the photo')},
  {steps: ['split', 'frames', 'recon', 'rooms'], label: N('Rooms from the video'), note: N('The size of each room and what stands there')},
  {steps: ['bind', 'ours', 'parts', 'colours'], label: N('Furniture'), note: N('The shape and colour of each piece')},
  {steps: ['assemble', 'check'], label: N('Assembly'), note: N('Everything in its place, then checked')},
  {steps: ['shot', 'report'], label: N('Final check'), note: N('A last look over the whole home')},
];

// A room of the video before it is matched to the plan has only a guess in English ("hallway"): its kind in the owner's language.
const KIND_NAME = {
  bath: N('Bathroom'),
  kids: N("Kids' room"),
  bed: N('Bedroom'),
  kitchen: N('Kitchen'),
  living: N('Living room'),
  hall: N('Hallway'),
  balcony: N('Balcony'),
  office: N('Office'),
  storage: N('Storage'),
  room: N('Room'),
};
const roomName = room => room.name || t(KIND_NAME[roomKind(room.guess)]);

/** Whether the AI build's service answers here: only then does the start screen offer it. */
export async function aiService(api = '') {
  try {
    const res = await fetch(`${api}/api/health`, {cache: 'no-store'});
    return res.ok && (await res.json()).ok === true;
  } catch {
    return false;
  }
}

/** A small outline of the plan's rooms, north up (the card that offers to check the plan). */
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

function etaText(seconds) {
  if (seconds == null) return '';
  if (seconds < 40) return t('Almost done');
  const minutes = Math.max(1, Math.round(seconds / 60));
  return t('About {0, plural, one {# minute} other {# minutes}} left', minutes);
}

/**
 * Opens the AI build over the editor: the upload screen, or a build's progress when its id is known (the page's ?build=<id>).
 * flows — the start screen (flows.js): back to it, and the plan kept aside before a new one replaces it.
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
  // The plan as read, as an outline for its card: the text it was made from, and the picture.
  let planCard = {text: null, svg: ''};
  const base = () => `${api}/api/builds/${encodeURIComponent(buildId)}`;

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

  // ---------- notes kept while the owner looks (pins and words), per build and checkpoint ----------

  const notesKey = at => `${NOTES}${buildId}:${at}`;
  function loadNotes(at) {
    try {
      const saved = JSON.parse(localStorage.getItem(notesKey(at)) || 'null');
      if (saved && Array.isArray(saved.pins)) return {pins: saved.pins, text: saved.text || ''};
    } catch {}
    return {pins: [], text: ''};
  }
  function saveNotes(at, notes) {
    try {
      localStorage.setItem(notesKey(at), JSON.stringify(notes));
    } catch {}
  }
  function clearNotes(at) {
    try {
      localStorage.removeItem(notesKey(at));
    } catch {}
  }

  // ---------- talking to the service ----------

  async function getJson(path) {
    const res = await fetch(base() + path, {cache: 'no-store'});
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
    return res.json();
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
      if (status.waiting === 'plan' && status.has.plan) await loadPlanCard();
      if (screen === 'progress') renderProgress();
    } catch (e) {
      status = {...(status || {steps: [], rooms: [], has: {}}), error: e.message};
      if (screen === 'progress') renderProgress();
    }
    timer = setTimeout(poll, POLL_MS);
  }

  async function loadPlanCard() {
    const res = await fetch(`${base()}/plan`, {cache: 'no-store'});
    if (!res.ok) return;
    const text = await res.text();
    if (text === planCard.text) return;
    try {
      planCard = {text, svg: planSvg(readPlan(text))};
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
        <main class="aib-progress">
          <ol class="aib-steps"></ol>
          <section class="aib-live">
            <div class="aib-cta"></div>
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

  function stageState(stage) {
    const s = status;
    if (!s?.steps?.length) return 'todo';
    if (s.waiting === 'plan' && stage === STAGES[0]) return 'ask';
    if (s.waiting === 'final' && stage === STAGES[4]) return 'ask';
    if (s.revising && (stage === STAGES[3] || stage === STAGES[4])) return 'running';
    const states = stage.steps.map(name => s.steps.find(x => x.name === name)?.state || 'todo');
    if (states.some(x => x === 'running')) return 'running';
    if (states.every(x => x === 'done')) return 'done';
    if (states.some(x => x === 'done') && s.alive && !s.error) return 'running';
    return 'todo';
  }

  function stageMeta(stage, state) {
    const s = status;
    if (state === 'ask') return t('Ready to check');
    if (stage === STAGES[0] && state === 'running' && s.has?.plan) return t('Fixing…');
    if (stage === STAGES[1] && s.rooms?.length && state !== 'done') {
      return t('{0} of {1}', s.rooms.filter(r => r.done).length, s.rooms.length);
    }
    return '';
  }

  function renderSteps() {
    const items = STAGES.map((stage, i) => {
      const state = stageState(stage);
      const dot =
        state === 'done' ? icon('check', 13) : state === 'running' ? '<i class="spin"></i>' : state === 'ask' ? icon('eye', 13) : String(i + 1);
      const meta = stageMeta(stage, state);
      return `<li class="aib-step st-${state}">
        <span class="aib-dot">${dot}</span>
        <span class="aib-step-text"><b>${esc(t(stage.label))}</b><small>${esc(t(stage.note))}</small></span>
        ${meta ? `<em>${esc(meta)}</em>` : ''}
      </li>`;
    });
    return items.join('');
  }

  // The card at the top of the live part: what the owner can do now, or what the build is busy with for them.
  function ctaCard() {
    const s = status;
    if (s.error) {
      return {
        key: `error:${s.error}`,
        html: `<div class="aib-card bad">
          <span class="aib-card-ic">${icon('alert', 20)}</span>
          <span class="aib-card-text"><b>${esc(t('The build stopped'))}</b><small>${esc(s.error)}</small></span>
          <button class="primary" data-act="resume">${esc(t('Try again'))}</button></div>`,
      };
    }
    if (s.waiting === 'plan') {
      return {
        key: `plan:${planCard.text?.length}`,
        html: `<div class="aib-card asking">
          <span class="aib-card-thumb plan">${planCard.svg}</span>
          <span class="aib-card-text"><b>${esc(t('The plan is ready'))}</b><small>${esc(t('Check the rooms, doors and windows. The video is being read meanwhile.'))}</small></span>
          <button class="primary" data-act="review-plan">${esc(t('Check the plan'))}</button></div>`,
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
          <button class="primary" data-act="review-final">${esc(t('Look at my home'))}</button></div>`,
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
    const busy = s.revising
      ? t('Changing your home…')
      : stageState(STAGES[0]) === 'running' && s.has?.plan
        ? t('Fixing the plan…')
        : null;
    if (busy) {
      return {
        key: `busy:${busy}`,
        html: `<div class="aib-card"><span class="aib-card-ic"><i class="spin"></i></span>
          <span class="aib-card-text"><b>${esc(busy)}</b><small>${esc(t('We show it again when it is done.'))}</small></span></div>`,
      };
    }
    return {key: '', html: ''};
  }

  function renderRooms() {
    const box = root.querySelector('.aib-rooms');
    const rooms = status.rooms || [];
    const looking = status.steps?.find(x => x.name === 'rooms')?.state === 'running';
    for (const room of rooms) {
      let figure = box.querySelector(`[data-id="${room.id}"]`);
      if (!figure) {
        figure = el(`<figure class="aib-room" data-id="${esc(room.id)}">
          <span class="aib-frame"><img alt="" hidden></span>
          <figcaption><span class="aib-room-name"></span><i class="aib-room-state"></i></figcaption></figure>`);
        box.append(figure);
      }
      const img = figure.querySelector('img');
      if (room.frame && !img.getAttribute('src')) {
        img.onload = () => {
          img.hidden = false;
        };
        img.src = `${base()}/frame/${encodeURIComponent(room.id)}`;
      }
      figure.querySelector('.aib-room-name').textContent = roomName(room);
      const state = room.done ? 'done' : looking ? 'running' : 'todo';
      if (figure.dataset.state !== state) {
        figure.dataset.state = state;
        figure.querySelector('.aib-room-state').innerHTML =
          state === 'done' ? icon('check', 13) : state === 'running' ? '<i class="spin"></i>' : '';
      }
    }
    root.querySelector('.aib-found').hidden = !rooms.length;
  }

  // Until the plan is read: the plan photo with a line going over it.
  function renderReading() {
    const box = root.querySelector('.aib-reading');
    const show = !!status.has?.photo && !status.has?.plan && !status.error;
    box.hidden = !show;
    if (show && !box.firstChild) {
      box.innerHTML = `<div class="aib-scan"><img src="${base()}/photo" alt=""><i></i></div>
        <span><i class="spin"></i>${esc(t('Reading your plan…'))}</span>`;
    }
  }

  function renderProgress() {
    if (screen !== 'progress') return;
    const s = status;
    const title = !s
      ? t('Building your home')
      : s.error
        ? t('The build stopped')
        : s.waiting
          ? t('Your turn')
          : s.finished
            ? t('Your home is ready')
            : t('Building your home');
    root.querySelector('.aib-title').textContent = title;
    root.querySelector('.aib-eta').textContent = s ? etaText(s.eta) : '';
    if (!s) {
      root.querySelector('.aib-steps').innerHTML = renderStepsSkeleton();
      return;
    }
    root.querySelector('.aib-steps').innerHTML = renderSteps();
    const cta = ctaCard();
    const box = root.querySelector('.aib-cta');
    if (box.dataset.key !== cta.key) {
      box.dataset.key = cta.key;
      box.innerHTML = cta.html;
    }
    renderReading();
    renderRooms();
  }

  const renderStepsSkeleton = () =>
    STAGES.map(
      (stage, i) => `<li class="aib-step st-todo"><span class="aib-dot">${i + 1}</span>
        <span class="aib-step-text"><b>${esc(t(stage.label))}</b><small>${esc(t(stage.note))}</small></span></li>`,
    ).join('');

  async function onCta(e) {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'review-plan') startReview('plan');
    else if (act === 'review-final') startReview('final');
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

  async function loadIntoEditor(what) {
    const res = await fetch(`${base()}/${what}`, {cache: 'no-store'});
    if (!res.ok) throw new Error(res.statusText);
    const plan = readPlan(await res.text());
    cover(false);
    ed.setPlan(plan, {fit: false});
    quietSetup();
  }

  async function startReview(at) {
    try {
      await loadIntoEditor(at === 'plan' ? 'plan' : 'home');
    } catch (e) {
      status = {...status, error: e.message};
      renderProgress();
      return;
    }
    screen = 'review';
    root.innerHTML = '';
    review = openReview(ed, {
      at,
      host: root,
      photo: at === 'plan' ? `${base()}/photo` : null,
      notes: loadNotes(at),
      onChange: notes => saveNotes(at, notes),
      onBack: showProgress,
      onSend: notes => answer(at, notes),
    });
  }

  function closeReview() {
    review?.close();
    review = null;
  }

  // The owner's answer: changes go to the build and the progress shows them being made; "all right" at ② opens the home.
  async function answer(at, notes) {
    const count = changeCount(notes);
    const text = notes.text.trim();
    const body = count
      ? {at, action: 'correct', ...(text ? {text} : {}), pins: pinsToSend(notes.pins)}
      : {at, action: 'confirm'};
    await post('/answer', body);
    clearNotes(at);
    answered = at;
    status = {...status, waiting: null};
    if (!count && at === 'final') return finish();
    showProgress();
    poll();
  }

  async function openHome() {
    try {
      await loadIntoEditor('home');
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
    setAddress(null);
    ed.setMain('3d');
    ed.view.home();
    quietSetup();
    ed.banner(t('Your home is ready. Change anything you like.'), [[t('Got it'), () => ed.banner(), true]]);
  }

  // Back to the start screen; a build that goes on can be followed again by its link.
  function exit() {
    close();
    setAddress(null);
    ed.showStart();
  }

  if (buildId) {
    showProgress();
    poll();
  } else showUpload();
  return {close};
}
