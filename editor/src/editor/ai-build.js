// The AI build screen (the paid "build my home" service, D-063, D-072): the editor follows a build that the service runs and
// shows each result as it comes — the plan as read, then the home as it grows. At the two checkpoints (the plan; the whole
// home) it asks the owner whether it is right: they fix it by hand right here, or say in words what to change.
// The service itself is private; the editor only talks to its API:
//   GET  <api>/api/builds/<id>           the build's status: steps, the checkpoint waiting, finished, error
//   GET  <api>/api/builds/<id>/plan      the plan as read; …/home the home as far as it got; …/photo the plan photo
//   POST <api>/api/builds/<id>/answer    {at, action: 'confirm' | 'correct', text?, plan?}
//   POST <api>/api/builds/<id>/resume    start a stopped build again
import {t} from '../i18n/i18n.js';
import {el, esc} from './ui.js';
import {icon} from './icons.js';
import {readPlan} from '../core/plan-file.js';

// What the owner sees as stages; each is a few of the build's own steps (the harness's tools/steps.ts).
const STAGES = [
  {steps: ['plan'], label: () => t('Plan')},
  {steps: ['split', 'frames', 'recon', 'rooms'], label: () => t('Rooms from the video')},
  {steps: ['bind', 'ours', 'parts', 'colours'], label: () => t('Furniture')},
  {steps: ['assemble', 'check'], label: () => t('Assembly and check')},
  {steps: ['shot', 'report'], label: () => t('Final touches')},
];
const POLL_MS = 2000;

// The parts of a plan the owner edits; the rest (the view, panels) does not count as a change.
const planShape = plan => JSON.stringify({rooms: plan.rooms, openings: plan.openings, furniture: plan.furniture});

export function startBuild(ed, id, {api = ''} = {}) {
  const base = `${api}/api/builds/${encodeURIComponent(id)}`;
  ed.flows.hideStart();
  // The service builds the home: the editor's own setup steps (outline, rooms, windows…) stay out of the way meanwhile,
  // without the "setup paused" note.
  const quietSetup = () => {
    ed.exitWizard();
    ed.banner();
  };
  quietSetup();

  const panel = el(`<section class="build glass" aria-live="polite"></section>`);
  document.body.append(panel);
  let status = null;
  let collapsed = false;
  // What is in the editor now, and what it was when we put it there: an edit by the owner differs from it.
  let shownText = {plan: null, home: null};
  let shownShape = null;
  // An answer on its way: the checkpoint it answers, until the build moves on.
  let sending = null;
  let note = '';

  // ---------- talking to the service ----------

  async function getJson(path) {
    const res = await fetch(base + path, {cache: 'no-store'});
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
    return res.json();
  }

  async function post(path, body) {
    const res = await fetch(base + path, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify(body || {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || res.statusText);
    return data;
  }

  // Put the plan or the home into the editor when it is new (the same text twice is not loaded again).
  async function show(what) {
    const res = await fetch(`${base}/${what}`, {cache: 'no-store'});
    if (!res.ok) return;
    const text = await res.text();
    if (text === shownText[what]) return;
    let plan;
    try {
      plan = readPlan(text);
    } catch {
      return;
    }
    shownText = {plan: null, home: null, [what]: text};
    ed.setPlan(plan);
    quietSetup();
    shownShape = planShape(ed.plan);
  }

  const editedByOwner = () => shownShape != null && planShape(ed.plan) !== shownShape;

  async function answer(at, action, text = '') {
    sending = at;
    render();
    try {
      await post('/answer', {
        at,
        action,
        ...(text.trim() ? {text: text.trim()} : {}),
        ...(editedByOwner() ? {plan: ed.plan} : {}),
      });
      note = '';
      // The build takes the owner's plan as it is: what is in the editor is now what the build has.
      if (editedByOwner()) shownShape = planShape(ed.plan);
    } catch (e) {
      sending = null;
      ed.banner(t('Could not send: {0}', e.message), [[t('Got it'), () => ed.banner()]]);
    }
    render();
  }

  // ---------- following the build ----------

  // The results worth showing at each moment: the plan until it is confirmed (the binding comes right after), then the home as
  // it grows. A corrected result at the same checkpoint differs in text and replaces what was shown.
  async function follow(s) {
    const done = name => s.steps.find(x => x.name === name)?.state === 'done';
    if (s.waiting === 'plan' || (s.has.plan && !done('bind') && !s.waiting)) await show('plan');
    else if (s.has.home && (s.waiting === 'final' || s.finished || done('assemble'))) {
      // While the owner edits at a checkpoint, the editor is theirs: nothing is loaded over their work.
      if (!(s.waiting && editedByOwner())) await show('home');
    }
  }

  async function poll() {
    try {
      const s = await getJson('');
      const moved = !status || JSON.stringify(s) !== JSON.stringify(status);
      if (sending && s.waiting !== sending) sending = null;
      status = s;
      if (moved) {
        await follow(s);
        render();
      } else showEditNote();
    } catch (e) {
      status = {error: e.message, steps: [], has: {}};
      render();
    }
    if (!status?.finished) setTimeout(poll, POLL_MS);
  }

  // ---------- the panel ----------

  function stageState(stage) {
    const states = stage.steps.map(name => status?.steps.find(x => x.name === name)?.state || 'todo');
    if (states.every(x => x === 'done')) return 'done';
    if (states.some(x => x === 'running')) return 'running';
    if (states.some(x => x === 'done')) return 'running';
    return 'todo';
  }

  function stagesStrip() {
    const items = STAGES.map(stage => {
      const state = stageState(stage);
      const mark = state === 'done' ? icon('check', 13) : state === 'running' ? '<i class="spin"></i>' : '';
      return `<li class="${state}"><span class="mark">${mark}</span>${esc(stage.label())}</li>`;
    });
    return `<ol class="stages">${items.join('')}</ol>`;
  }

  function header(title) {
    return `<header><b>${esc(title)}</b>
      <button class="ib" data-act="collapse" title="${esc(collapsed ? t('Expand') : t('Collapse'))}">${icon(collapsed ? 'up' : 'down', 15)}</button></header>`;
  }

  // A checkpoint: the question, a field for words, "send" and "all right".
  function checkpointCard(at) {
    const plan = at === 'plan';
    const title = plan ? t('Is the plan right?') : t('Your home is ready');
    const text = plan
      ? t('Check the rooms, doors and windows. Fix them right on the plan, or tell us what is wrong.')
      : t('Look at it in 3D. Fix things by hand, or tell us what to change.');
    const placeholder = plan
      ? t('For example: there is no wall between the kitchen and the living room')
      : t('For example: the sofa is grey, the rug by the bed is round');
    const busy = sending === at;
    const photo = plan
      ? `<button class="build-thumb" data-act="photo" title="${esc(t('The plan photo'))}"><img src="${base}/photo" alt="${esc(t('The plan photo'))}"></button>`
      : '';
    return `${header(title)}
      ${stagesStrip()}
      <div class="build-ask">${photo}<p>${esc(text)}</p></div>
      <textarea rows="2" placeholder="${esc(placeholder)}" ${busy ? 'disabled' : ''}>${esc(note)}</textarea>
      <small class="edit-note" hidden></small>
      <div class="row">
        ${busy ? `<span class="wait"><i class="spin"></i>${esc(plan ? t('Fixing the plan…') : t('Changing the home…'))}</span>` : ''}
        <button class="soft" data-act="correct" ${busy || !note.trim() ? 'disabled' : ''}>${esc(t('Send'))}</button>
        <button class="primary" data-act="confirm" ${busy ? 'disabled' : ''}>${esc(plan ? t('All right, go on') : t('Done'))}</button>
      </div>`;
  }

  // Under the field at a checkpoint, once the owner has edited the plan: at ① their edits go with the answer; at ② words
  // rebuild the home, so edits made by hand now would be lost.
  function showEditNote() {
    const small = panel.querySelector('.edit-note');
    if (!small) return;
    const edited = editedByOwner(),
      plan = status?.waiting === 'plan';
    small.hidden = !edited;
    small.classList.toggle('warn', edited && !plan);
    small.textContent = plan ? t('Your edits go with it') : t('Words rebuild the home: hand edits made now are lost');
  }

  function render() {
    // A render while the owner types keeps their place in the field.
    const typing = document.activeElement === panel.querySelector('textarea'),
      caret = typing ? document.activeElement.selectionStart : 0;
    panel.classList.toggle('collapsed', collapsed);
    if (!status) {
      panel.innerHTML = `${header(t('AI build'))}<p class="muted"><i class="spin"></i></p>`;
    } else if (status.error) {
      panel.innerHTML = `${header(t('AI build'))}${stagesStrip()}
        <p class="err">${esc(t('The build stopped: {0}', status.error))}</p>
        <div class="row"><button class="primary" data-act="resume">${esc(t('Try again'))}</button></div>`;
    } else if (status.waiting) {
      panel.innerHTML = checkpointCard(status.waiting);
    } else if (status.finished) {
      panel.innerHTML = `${header(t('AI build'))}${stagesStrip()}
        <p>${esc(t('The home is built. Everything can be changed by hand now.'))}</p>
        <div class="row"><button class="primary" data-act="close">${esc(t('Close'))}</button></div>`;
    } else {
      const now = STAGES.find(stage => stageState(stage) === 'running') || STAGES.find(stage => stageState(stage) === 'todo');
      const going = sending ? t('Building on…') : now ? now.label() + '…' : t('AI build');
      panel.innerHTML = `${header(t('AI build'))}${stagesStrip()}<p class="muted"><i class="spin"></i>${esc(going)}</p>`;
    }
    const field = panel.querySelector('textarea');
    if (field) {
      field.oninput = () => {
        note = field.value;
        panel.querySelector('[data-act=correct]').disabled = !note.trim() || !!sending;
      };
      field.onkeydown = e => e.stopPropagation(); // the editor's shortcuts stay out of the text
      if (typing) {
        field.focus();
        field.setSelectionRange(caret, caret);
      }
    }
    showEditNote();
  }

  panel.addEventListener('click', async e => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    if (act === 'collapse') {
      collapsed = !collapsed;
      render();
    } else if (act === 'confirm') answer(status.waiting, 'confirm');
    else if (act === 'correct') answer(status.waiting, 'correct', note);
    else if (act === 'photo') openPhoto();
    else if (act === 'close') panel.remove();
    else if (act === 'resume') {
      try {
        status = await post('/resume');
        render();
        poll();
      } catch (err) {
        ed.banner(t('Could not send: {0}', err.message), [[t('Got it'), () => ed.banner()]]);
      }
    }
  });

  // The plan photo, large, next to the plan as read: a click or Esc closes it.
  function openPhoto() {
    const view = el(`<div class="build-photo" role="dialog" aria-label="${esc(t('The plan photo'))}"><img src="${base}/photo" alt=""></div>`);
    const close = () => {
      view.remove();
      removeEventListener('keydown', esc_);
    };
    const esc_ = e => {
      if (e.key === 'Escape') close();
    };
    view.onclick = close;
    addEventListener('keydown', esc_);
    document.body.append(view);
  }

  render();
  poll();
}
