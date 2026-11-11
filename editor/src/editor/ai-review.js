// The AI build's review (D-073): the plan as read (①) or the whole home (②) alone, full screen, with a panel to answer.
// The owner looks around, puts numbered pins where something is wrong and says what, adds a word for the whole home, and
// answers: all right, or send the changes. Dragging moves the view with either tool; a click with the pin tool puts a pin.
// Nothing moves the view but the owner. The editor underneath only draws (ed.setBare): its own clicks and keys stay out.
import {t} from '../i18n/i18n.js';
import {el, esc} from './ui.js';
import {icon} from './icons.js';
import {newPin, pinLabel, changeCount} from './ai-pins.js';

// The panel on the right (a sheet at the bottom on a narrow screen): the views fit into what it leaves free.
const PANEL_WIDTH = 340;
const NARROW = 720;
const CLICK_PX = 5;

/**
 * at — 'plan' | 'final'; host — where the review's panels go; photo — the plan photo to compare with (①);
 * notes — {pins, text}, changed in place; onChange(notes) after each change; onBack() — back to the progress;
 * onSend(notes) → a promise: the answer is on its way (all right when there are no changes).
 */
export function openReview(ed, {at, host, photo = null, notes, onChange, onBack, onSend}) {
  const isPlan = at === 'plan';
  let view = isPlan ? 'plan' : '3d';
  let tool = 'pin';
  let active = null;
  let hovered = null;
  let photoOpen = false;
  let collapsed = false;
  let sending = false;
  let closed = false;
  let raf = 0;

  const box = el(`<div class="aib-review" data-at="${at}">
    <div class="aib-bar glass">
      <button class="ib" data-act="back" title="${esc(t('Back to the build'))}">${icon('left', 17)}</button>
      <span class="logo">${icon('sparkles', 14)}</span>
      <span class="aib-bar-text"><small>${esc(isPlan ? t('Step 1 of 2') : t('Step 2 of 2'))}</small><b>${esc(isPlan ? t('Check the plan') : t('Check your home'))}</b></span>
    </div>
    <div class="aib-tools glass">
      <button class="ib" data-tool="look" title="${esc(t('Look around (V)'))}">${icon('pointer', 17)}</button>
      <button class="ib" data-tool="pin" title="${esc(t('Pin: click where something is wrong (P)'))}">${icon('mapPin', 17)}</button>
      <span class="sep"></span>
      ${isPlan ? '' : `<div class="seg aib-views"><button data-view="3d">3D</button><button data-view="plan">${esc(t('Plan'))}</button></div>`}
      <button class="ib" data-act="fit" title="${esc(t('Whole home'))}">${icon('fit', 17)}</button>
    </div>
    <aside class="aib-panel glass">
      <header>
        <b>${esc(isPlan ? t('Is the plan right?') : t('Your home is ready'))}</b>
        <button class="ib" data-act="collapse" title="${esc(t('Collapse'))}">${icon('down', 16)}</button>
      </header>
      <div class="aib-panel-body">
        <p class="aib-lead">${esc(isPlan ? t('Compare it with your plan. Pin what is wrong and say what.') : t('Look around in 3D. Pin what is wrong and say what.'))}</p>
        ${photo ? `<button class="aib-photo" data-act="photo"><img src="${photo}" alt=""><span>${icon('image', 14)}${esc(t('Your plan, side by side'))}</span></button>` : ''}
        <ol class="aib-notes"></ol>
        <p class="aib-empty">${icon('mapPin', 15)}<span>${esc(t('Click where something is wrong to put a pin.'))}</span></p>
        <textarea class="aib-general" rows="2" placeholder="${esc(isPlan ? t('Anything else? For example: there is no wall between the kitchen and the living room') : t('Anything else? For example: the floors are light oak'))}"></textarea>
      </div>
      <footer>
        <small class="aib-after"></small>
        <button class="primary" data-act="send"></button>
      </footer>
    </aside>
    ${photo ? `<div class="aib-photo-big glass" hidden><img src="${photo}" alt=""><button class="ib" data-act="photo" title="${esc(t('Close'))}">${icon('x', 16)}</button></div>` : ''}
    <div class="aib-pop glass" hidden>
      <header><span class="aib-num"></span><span class="aib-pop-target"></span></header>
      <textarea rows="3" placeholder="${esc(t('What is wrong here?'))}"></textarea>
      <footer>
        <button class="ib" data-act="pin-delete" title="${esc(t('Delete'))}">${icon('trash', 15)}</button>
        <button class="primary" data-act="pin-done">${esc(t('Done'))}</button>
      </footer>
    </div>
  </div>`);
  host.append(box);
  const panel = box.querySelector('.aib-panel');
  const pop = box.querySelector('.aib-pop');
  const popText = pop.querySelector('textarea');
  const general = box.querySelector('.aib-general');
  general.value = notes.text;
  const pinLayer = el(`<div class="aib-pins"></div>`);
  const panes = {plan: document.getElementById('pane-plan'), '3d': document.getElementById('pane-3d')};

  // ---------- the view ----------

  const narrow = () => innerWidth < NARROW;
  function insets() {
    const left = photoOpen && !narrow() ? Math.min(innerWidth * 0.42, 620) + 24 : 0;
    if (narrow()) return {left: 0, right: 0, bottom: (collapsed ? 56 : panel.offsetHeight) + 16};
    return {left, right: PANEL_WIDTH + 32, bottom: 0};
  }

  // The tools sit in the middle of what the panels leave free (a phone: their own place at the top, styles.css).
  function placeTools() {
    const tools = box.querySelector('.aib-tools');
    const ins = insets();
    tools.style.left = narrow() ? '' : `${(ins.left + innerWidth - ins.right) / 2}px`;
  }

  function fit() {
    placeTools();
    if (view === 'plan') {
      const points = ed.plan.rooms.flatMap(room => room.polygon);
      const ins = insets();
      // the tools: at the bottom, on a phone at the top
      ed.v.fit(points, 40, {l: ins.left, r: ins.right, t: 72, b: ins.bottom + (narrow() ? 8 : 76)});
      ed.v.fitted = false;
      ed.draw();
    } else ed.view.home();
  }

  function setView(next) {
    view = next;
    // Daylight while the owner checks: colours and finishes are what they compare with their video.
    if (view === '3d') ed.view.setNight(false);
    const ins = insets();
    ed.setBare(view, {right: ins.right, bottom: ins.bottom});
    panes[view].append(pinLayer);
    for (const b of box.querySelectorAll('[data-view]')) b.classList.toggle('on', b.dataset.view === view);
    // A frame later: the editor fits a view that changed its place (the small window → the whole screen) when its size changes,
    // which comes after this frame's callbacks; the review's own fit, minding its panel, goes after that.
    requestAnimationFrame(() => requestAnimationFrame(fit));
  }

  function setTool(next) {
    tool = next;
    for (const b of box.querySelectorAll('[data-tool]')) b.classList.toggle('on', b.dataset.tool === tool);
    document.body.classList.toggle('aib-pinning', tool === 'pin');
  }

  // ---------- pins ----------

  function addPin(hit) {
    notes.pins.push(newPin(ed.plan, hit));
    setActive(notes.pins.length - 1);
    changed();
  }

  function removePin(i) {
    notes.pins.splice(i, 1);
    active = null;
    pop.hidden = true;
    changed();
  }

  // The pin being written: its words in the bubble beside it. Left without words, it goes.
  function setActive(i) {
    if (active != null && active !== i && notes.pins[active] && !notes.pins[active].text.trim()) {
      notes.pins.splice(active, 1);
      if (i != null && i > active) i--;
      active = null;
      changed();
    }
    active = i;
    pop.hidden = i == null;
    if (i != null) {
      const pin = notes.pins[i];
      pop.querySelector('.aib-num').textContent = String(i + 1);
      pop.querySelector('.aib-pop-target').textContent = pinLabel(pin, t('Outside'));
      popText.value = pin.text;
      requestAnimationFrame(() => popText.focus({preventScroll: true}));
    }
    renderPins();
    renderNotes();
  }

  function renderPins() {
    pinLayer.replaceChildren(
      ...notes.pins.map((pin, i) => {
        const b = el(`<button class="aib-pin" data-i="${i}">${i + 1}</button>`);
        b.classList.toggle('on', i === active);
        b.classList.toggle('hover', i === hovered);
        b.classList.toggle('draft', !pin.text.trim());
        return b;
      }),
    );
    place();
  }

  // Each frame: pins follow the view (pan, zoom, orbit); the bubble follows its pin.
  function place() {
    const pane = panes[view];
    const paneBox = pane.getBoundingClientRect();
    let activeAt = null;
    pinLayer.childNodes.forEach((b, i) => {
      const pin = notes.pins[i];
      if (!pin) return;
      const [x, y] = view === 'plan' ? ed.v.S([pin.x, pin.y]) : ed.view.project([pin.x, pin.y], pin.z ?? 0);
      // `translate`, not `transform`: the bigger active pin's `scale` would scale a transform's offset too
      b.style.translate = `${x.toFixed(1)}px ${y.toFixed(1)}px`;
      if (i === active) activeAt = [paneBox.left + x, paneBox.top + y];
    });
    if (activeAt && !pop.hidden) {
      const w = pop.offsetWidth;
      const h = pop.offsetHeight;
      const ins = insets();
      const maxLeft = innerWidth - ins.right - w - 12;
      let left = activeAt[0] + 44;
      if (left > maxLeft) left = activeAt[0] - w - 16;
      left = Math.max(12, Math.min(maxLeft, left));
      const top = Math.max(64, Math.min(innerHeight - ins.bottom - h - 12, activeAt[1] - 46));
      pop.style.transform = `translate(${left.toFixed(0)}px, ${top.toFixed(0)}px)`;
    }
  }

  function loop() {
    if (closed) return;
    place();
    raf = requestAnimationFrame(loop);
  }

  // ---------- the panel ----------

  function renderNotes() {
    const list = box.querySelector('.aib-notes');
    list.replaceChildren(
      ...notes.pins.map((pin, i) => {
        const row = el(`<li class="aib-note" data-i="${i}">
          <span class="aib-num">${i + 1}</span>
          <span class="aib-note-body"><small></small><span></span></span>
          <button class="ib" data-act="pin-delete" title="${esc(t('Delete'))}">${icon('trash', 14)}</button>
        </li>`);
        row.classList.toggle('on', i === active);
        row.querySelector('small').textContent = pinLabel(pin, t('Outside'));
        const words = row.querySelector('.aib-note-body>span');
        words.textContent = pin.text.trim() || t('What is wrong here?');
        words.classList.toggle('muted', !pin.text.trim());
        return row;
      }),
    );
    box.querySelector('.aib-empty').hidden = notes.pins.length > 0;
    renderSend();
  }

  function renderSend() {
    const count = changeCount(notes);
    const button = box.querySelector('[data-act=send]');
    button.disabled = sending;
    button.innerHTML = sending
      ? `<i class="spin"></i>${esc(t('Sending…'))}`
      : count
        ? esc(t('Send {0, plural, one {# change} other {# changes}}', count))
        : esc(isPlan ? t('All right, go on') : t('All right, finish'));
    const after = box.querySelector('.aib-after');
    if (after.classList.contains('err')) return;
    after.textContent = count
      ? isPlan
        ? t('We fix the plan and show it again.')
        : t('We change your home and show it again.')
      : isPlan
        ? t('Next, the furniture. We show you the home when it is ready.')
        : t('It opens in the editor: everything stays changeable.');
  }

  function changed() {
    onChange(notes);
    renderPins();
    renderNotes();
  }

  async function send() {
    if (sending) return;
    setActive(null);
    sending = true;
    const after = box.querySelector('.aib-after');
    after.classList.remove('err');
    renderSend();
    try {
      await onSend(notes);
    } catch (e) {
      sending = false;
      after.classList.add('err');
      after.textContent = t('Could not send: {0}', e.message);
      renderSend();
    }
  }

  function togglePhoto() {
    photoOpen = !photoOpen;
    box.querySelector('.aib-photo-big').hidden = !photoOpen;
    fit();
  }

  function toggleCollapsed() {
    collapsed = !collapsed;
    panel.classList.toggle('collapsed', collapsed);
    const b = panel.querySelector('[data-act=collapse]');
    b.innerHTML = icon(collapsed ? 'up' : 'down', 16);
    b.title = collapsed ? t('Expand') : t('Collapse');
    const ins = insets();
    ed.setBare(view, {right: ins.right, bottom: ins.bottom});
  }

  // ---------- input ----------

  box.addEventListener('click', e => {
    const target = e.target.closest('[data-act],[data-tool],[data-view],.aib-note');
    if (!target) return;
    if (target.dataset.tool) return setTool(target.dataset.tool);
    if (target.dataset.view) return setView(target.dataset.view);
    const act = target.dataset.act;
    if (act === 'back') return onBack();
    if (act === 'fit') return fit();
    if (act === 'photo') return togglePhoto();
    if (act === 'collapse') return toggleCollapsed();
    if (act === 'send') return send();
    if (act === 'pin-done') return setActive(null);
    if (act === 'pin-delete') {
      const row = target.closest('.aib-note');
      return removePin(row ? +row.dataset.i : active);
    }
    if (target.classList.contains('aib-note')) setActive(+target.dataset.i);
  });
  box.addEventListener('pointerover', e => {
    const row = e.target.closest('.aib-note');
    const next = row ? +row.dataset.i : null;
    if (next !== hovered) {
      hovered = next;
      renderPins();
    }
  });
  popText.addEventListener('input', () => {
    if (active == null) return;
    notes.pins[active].text = popText.value;
    onChange(notes);
    renderNotes();
    pinLayer.childNodes[active]?.classList.toggle('draft', !popText.value.trim());
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
  pinLayer.addEventListener('click', e => {
    const b = e.target.closest('.aib-pin');
    if (b) setActive(+b.dataset.i);
  });

  // The plan: the editor's own clicks never reach it — a drag pans, a click puts a pin (the wheel still zooms, as in the editor).
  let press = null;
  const onPin = e => !!e.target.closest?.('.aib-pin');
  function planDown(e) {
    if (view !== 'plan' || onPin(e)) return;
    e.stopPropagation();
    e.preventDefault();
    press = {id: e.pointerId, x: e.clientX, y: e.clientY, ox: ed.v.ox, oy: ed.v.oy, moved: false};
    try {
      panes.plan.setPointerCapture(e.pointerId);
    } catch {} // a pointer the browser no longer tracks
  }
  function planMove(e) {
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
  function planUp(e) {
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
  const stop = e => {
    if (view === 'plan') e.stopPropagation();
  };

  // The 3D: dragging orbits as always; a click (no drag) with the pin tool puts a pin on what is under it.
  let press3d = null;
  function down3d(e) {
    if (view !== '3d' || onPin(e)) return;
    press3d = {id: e.pointerId, x: e.clientX, y: e.clientY};
  }
  function up3d(e) {
    if (view !== '3d' || !press3d || e.pointerId !== press3d.id) return;
    const moved = Math.hypot(e.clientX - press3d.x, e.clientY - press3d.y) > CLICK_PX;
    press3d = null;
    if (moved) return;
    if (tool !== 'pin') return setActive(null);
    const hit = ed.view.pick(e.clientX, e.clientY);
    if (hit) addPin(hit);
  }

  // Keys: V and P choose the tool, Esc closes the bubble; the editor's shortcuts are off while the review is open.
  function keys(e) {
    if (e.target.closest?.('.aib-review textarea')) return;
    const key = e.key.toLowerCase();
    if (key === 'v') setTool('look');
    else if (key === 'p') setTool('pin');
    else if (key === 'escape') setActive(null);
    else if ((key === 'delete' || key === 'backspace') && active != null) removePin(active);
    e.stopPropagation();
  }

  function resized() {
    const ins = insets();
    ed.setBare(view, {right: ins.right, bottom: ins.bottom});
    placeTools();
  }

  const listeners = [
    [panes.plan, 'pointerdown', planDown],
    [panes.plan, 'pointermove', planMove],
    [panes.plan, 'pointerup', planUp],
    [panes.plan, 'dblclick', stop],
    [panes['3d'], 'pointerdown', down3d],
    [panes['3d'], 'pointerup', up3d],
    [window, 'keydown', keys],
  ];
  for (const [target, type, fn] of listeners) target.addEventListener(type, fn, true);
  addEventListener('resize', resized);

  function close() {
    if (closed) return;
    closed = true;
    cancelAnimationFrame(raf);
    for (const [target, type, fn] of listeners) target.removeEventListener(type, fn, true);
    removeEventListener('resize', resized);
    document.body.classList.remove('aib-pinning');
    pinLayer.remove();
    box.remove();
    ed.setBare(null);
    ed.view.setNight(!!ed.night?.());
  }

  setTool(tool);
  setView(view);
  renderPins();
  renderNotes();
  loop();
  return {close};
}
