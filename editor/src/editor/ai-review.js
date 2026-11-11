// The AI build's review (D-073, D-074): the finished home alone, full screen, in 3D or on the plan, with a panel to answer.
// It opens with the pin in hand and a hint: the owner turns the home, puts numbered pins where something is wrong and says
// what, adds a word for the whole home, and answers: all right, or send the changes. Dragging moves the view with either
// tool; a click with the pin tool puts a pin. Nothing moves the view but the owner. The editor underneath only draws
// (ed.setBare): its own clicks and keys stay out.
// Each pin keeps what the owner was looking at when they put it (the view, the spot ringed) and takes photos or screenshots
// they add, dropped or pasted onto its bubble or its row (D-076): the service's model sees what they mean. Pins that did
// not work out last time come back with why.
import {t, N} from '../i18n/i18n.js';
import {el, esc} from './ui.js';
import {icon} from './icons.js';
import {newPin, pinLabel, changeCount, MAX_PIN_PHOTOS} from './ai-pins.js';

// The panel on the right (a sheet at the bottom on a narrow screen): the views fit into what it leaves free.
const PANEL_WIDTH = 340;
const NARROW = 720;
const CLICK_PX = 5;
// The view a pin keeps, and a photo before it goes: at most this many pixels on the long side.
const VIEW_PIXELS = 1280;
const PHOTO_PIXELS = 1600;
// The ring round the spot in the kept view, as the service's drawing rings it (harness tools/home.mjs roomDiagram).
const RING = '#d6249f';
// Why a pin did not work out last time, by the service's reason (harness tools/owner-result.ts).
const MISSED = {
  'no-fix': N('Not understood'),
  refused: N('Did not fit there'),
  undone: N('Would block a door or a wall'),
  unchanged: N('Nothing changed'),
  box: N('No model for it yet: a plain box'),
  'no-room': N('Outside the home'),
};
const missedText = retry => (retry?.codes || []).map(code => t(MISSED[code] || MISSED.unchanged)).join(' · ');
const isPicture = file => /^image\//.test(file.type) || /\.(heic|heif)$/i.test(file.name || '');

/**
 * host — where the review's panels go; photo — the plan photo to compare with; notes — {pins, text}, changed in place;
 * onChange(notes) after each change; onBack() — back to the progress; onSend(notes) → a promise: the answer is on its way
 * (all right when there are no changes); upload(blob, 'view' | 'photo') → a promise of the picture's name at the service;
 * pictureUrl(name) → where to show it; lastRound — the service's last round (how many pins worked out).
 */
export function openReview(
  ed,
  {host, photo = null, notes, onChange, onBack, onSend, upload = null, pictureUrl = null, lastRound = null},
) {
  let view = '3d';
  let tool = 'pin';
  let active = null;
  let hovered = null;
  let photoOpen = false;
  let collapsed = false;
  let sending = false;
  let closed = false;
  let raf = 0;

  const box = el(`<div class="aib-review">
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
    <aside class="aib-panel glass">
      <header>
        <b>${esc(t('Your home is ready'))}</b>
        <button class="ib" data-act="collapse" title="${esc(t('Collapse'))}">${icon('down', 16)}</button>
      </header>
      <div class="aib-panel-body">
        <p class="aib-lead">${esc(t('Look around in 3D. Pin what is wrong and say what.'))}</p>
        <p class="aib-last" hidden></p>
        ${photo ? `<button class="aib-photo" data-act="photo"><img src="${photo}" alt=""><span>${icon('image', 14)}${esc(t('Your plan, side by side'))}</span></button>` : ''}
        <ol class="aib-notes"></ol>
        <p class="aib-empty">${icon('mapPin', 15)}<span>${esc(t('Click where something is wrong to put a pin.'))}</span></p>
        <textarea class="aib-general" rows="2" placeholder="${esc(t('Anything else? For example: the floors are light oak'))}"></textarea>
      </div>
      <footer>
        <small class="aib-after"></small>
        <button class="primary" data-act="send"></button>
      </footer>
    </aside>
    ${photo ? `<div class="aib-photo-big glass" hidden><img src="${photo}" alt=""><button class="ib" data-act="photo" title="${esc(t('Close'))}">${icon('x', 16)}</button></div>` : ''}
    <div class="aib-pop glass" hidden>
      <header><span class="aib-num"></span><span class="aib-pop-target"></span></header>
      <p class="aib-retry" hidden></p>
      <textarea rows="3" placeholder="${esc(t('What is wrong here?'))}"></textarea>
      <div class="aib-thumbs" hidden></div>
      <small class="aib-photo-err" hidden></small>
      <footer>
        <button class="ib" data-act="pin-delete" title="${esc(t('Delete'))}">${icon('trash', 15)}</button>
        ${upload ? `<button class="ib" data-act="pin-photo" title="${esc(t('Add a photo or a screenshot (or drop or paste it here)'))}">${icon('image', 15)}</button><input type="file" accept="image/*" multiple hidden>` : ''}
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
  const hint = box.querySelector('.aib-hint');
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

  // The hint and the pin tool's pulse: until the first pin, or until the owner closes it.
  function hideHint() {
    hint.hidden = true;
    box.querySelector('[data-tool=pin]').classList.remove('aib-pulse');
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
    hideHint();
    const pin = newPin(ed.plan, hit);
    notes.pins.push(pin);
    keepView(pin);
    setActive(notes.pins.length - 1);
    changed();
  }

  function removePin(i) {
    notes.pins.splice(i, 1);
    active = null;
    pop.hidden = true;
    changed();
  }

  // The pin being written: its words in the bubble beside it. Left without words or photos, it goes.
  const empty = pin => !pin.text.trim() && !pin.photos?.length && !(uploading.get(pin) > 0);
  function setActive(i) {
    if (active != null && active !== i && notes.pins[active] && empty(notes.pins[active])) {
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
      const retry = pop.querySelector('.aib-retry');
      retry.hidden = !pin.retry;
      retry.textContent = pin.retry ? t('Last time: {0}', missedText(pin.retry)) : '';
      popText.value = pin.text;
      photoError('');
      requestAnimationFrame(() => popText.focus({preventScroll: true}));
    }
    renderThumbs();
    renderPins();
    renderNotes();
  }

  // ---------- pictures: what the owner saw, and the photos they add ----------

  // Pictures on their way to the service, per pin.
  const uploading = new Map();

  function photoError(text) {
    const line = pop.querySelector('.aib-photo-err');
    line.hidden = !text;
    line.textContent = text;
  }

  function renderThumbs() {
    const row = pop.querySelector('.aib-thumbs');
    const pin = active != null ? notes.pins[active] : null;
    const busy = pin ? uploading.get(pin) || 0 : 0;
    row.hidden = !pin || (!pin.photos?.length && !busy);
    if (row.hidden) return row.replaceChildren();
    row.replaceChildren(
      ...pin.photos.map((name, k) => {
        const thumb = el(`<span class="aib-thumb"><a target="_blank" rel="noopener"><img alt=""></a>
          <button class="ib" data-act="photo-remove" data-k="${k}" title="${esc(t('Remove the photo'))}">${icon('x', 11)}</button></span>`);
        thumb.querySelector('a').href = pictureUrl?.(name) || '#';
        thumb.querySelector('img').src = pictureUrl?.(name) || '';
        return thumb;
      }),
      ...Array.from({length: busy}, () => el(`<span class="aib-thumb busy"><i class="spin"></i></span>`)),
    );
  }

  // A photo made smaller before it goes (a phone's photo is many megabytes); one the browser cannot read goes as it is.
  async function shrink(file) {
    try {
      const bitmap = await createImageBitmap(file, {imageOrientation: 'from-image'});
      const k = Math.min(1, PHOTO_PIXELS / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * k);
      canvas.height = Math.round(bitmap.height * k);
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close?.();
      return (await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85))) || file;
    } catch {
      return file;
    }
  }

  async function addPhotos(pin, files) {
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
          photoError(t('Could not add the photo: {0}', e.message));
        } finally {
          uploading.set(pin, uploading.get(pin) - 1);
          changed();
          renderThumbs();
        }
      }),
    );
  }

  // What the owner was looking at when they put the pin, the spot ringed: the view as it is now (on the plan, its canvas).
  async function keepView(pin) {
    if (!upload) return;
    try {
      const source = view === 'plan' ? ed.v.cv : ed.view.snapshot?.();
      if (!source?.width) return;
      const at = view === 'plan' ? ed.v.S([pin.x, pin.y]) : ed.view.project([pin.x, pin.y], pin.z ?? 0);
      const ratio = source.width / (source.clientWidth || source.width);
      const k = Math.min(1, VIEW_PIXELS / source.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(source.width * k);
      canvas.height = Math.round(source.height * k);
      const g = canvas.getContext('2d');
      g.fillStyle = getComputedStyle(document.body).backgroundColor || '#f3f4f6';
      g.fillRect(0, 0, canvas.width, canvas.height);
      g.drawImage(source, 0, 0, canvas.width, canvas.height);
      const x = at[0] * ratio * k;
      const y = at[1] * ratio * k;
      const radius = Math.max(16, canvas.width / 60);
      for (const [colour, width] of [['#fff', 7], [RING, 4]]) {
        g.beginPath();
        g.arc(x, y, radius, 0, Math.PI * 2);
        g.strokeStyle = colour;
        g.lineWidth = width;
        g.stroke();
      }
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.82));
      if (!blob) return;
      const name = await upload(blob, 'view');
      if (notes.pins.includes(pin)) {
        pin.view = name;
        onChange(notes);
      }
    } catch {} // the view helps the service; a pin goes without it as well
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

  // The hint points at the pin tool, wherever the tools have moved (a phone: under them, styles.css).
  function placeHint() {
    if (hint.hidden || narrow()) return;
    const button = box.querySelector('[data-tool=pin]').getBoundingClientRect();
    hint.style.left = `${(button.left + button.width / 2).toFixed(0)}px`;
  }

  function loop() {
    if (closed) return;
    place();
    placeHint();
    raf = requestAnimationFrame(loop);
  }

  // ---------- the panel ----------

  function renderNotes() {
    const list = box.querySelector('.aib-notes');
    list.replaceChildren(
      ...notes.pins.map((pin, i) => {
        const row = el(`<li class="aib-note" data-i="${i}">
          <span class="aib-num">${i + 1}</span>
          <span class="aib-note-body"><small></small><span></span><em class="aib-retry" hidden></em></span>
          ${pin.photos?.length ? `<span class="aib-note-photos" title="${esc(t('{0, plural, one {# photo} other {# photos}}', pin.photos.length))}">${icon('image', 12)}${pin.photos.length}</span>` : ''}
          <button class="ib" data-act="pin-delete" title="${esc(t('Delete'))}">${icon('trash', 14)}</button>
        </li>`);
        row.classList.toggle('on', i === active);
        row.querySelector('small').textContent = pinLabel(pin, t('Outside'));
        const retry = row.querySelector('.aib-retry');
        retry.hidden = !pin.retry;
        retry.textContent = pin.retry ? t('Last time: {0}', missedText(pin.retry)) : '';
        const words = row.querySelector('.aib-note-body>span');
        words.textContent = pin.text.trim() || t('What is wrong here?');
        words.classList.toggle('muted', !pin.text.trim());
        return row;
      }),
    );
    box.querySelector('.aib-empty').hidden = notes.pins.length > 0;
    renderSend();
  }

  // How the last round went: how many pins worked out; those that did not are pinned again.
  function renderLast() {
    const line = box.querySelector('.aib-last');
    const pins = lastRound?.pins || [];
    line.hidden = !pins.length;
    if (!pins.length) return;
    const done = pins.filter(pin => pin.made === 'yes').length;
    line.classList.toggle('all', done === pins.length);
    line.textContent =
      done === pins.length
        ? t('All {0} changes are made.', pins.length)
        : t('{0} of {1} changes are made. The rest are pinned again: a photo helps.', done, pins.length);
  }

  function renderSend() {
    const count = changeCount(notes);
    const button = box.querySelector('[data-act=send]');
    button.disabled = sending;
    button.innerHTML = sending
      ? `<i class="spin"></i>${esc(t('Sending…'))}`
      : count
        ? esc(t('Send {0, plural, one {# change} other {# changes}}', count))
        : esc(t('All right, finish'));
    const after = box.querySelector('.aib-after');
    if (after.classList.contains('err')) return;
    after.textContent = count ? t('We change your home and show it again.') : t('It opens in the editor: everything stays changeable.');
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
    if (act === 'hint-close') return hideHint();
    if (act === 'fit') return fit();
    if (act === 'photo') return togglePhoto();
    if (act === 'collapse') return toggleCollapsed();
    if (act === 'send') return send();
    if (act === 'pin-done') return setActive(null);
    if (act === 'pin-photo') return pop.querySelector('input[type=file]')?.click();
    if (act === 'photo-remove' && active != null) {
      notes.pins[active].photos.splice(+target.dataset.k, 1);
      changed();
      return renderThumbs();
    }
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
  // Photos: chosen, pasted into the bubble, or dropped onto it or onto a pin's row.
  pop.querySelector('input[type=file]')?.addEventListener('change', e => {
    if (active != null) addPhotos(notes.pins[active], e.target.files);
    e.target.value = '';
  });
  popText.addEventListener('paste', e => {
    const files = [...(e.clipboardData?.files || [])].filter(isPicture);
    if (!files.length || active == null) return;
    e.preventDefault();
    addPhotos(notes.pins[active], files);
  });
  // A file dropped anywhere goes to the pin under it (its row) or the pin being written, never opens in the browser in the
  // page's place.
  const carriesFiles = e => [...(e.dataTransfer?.types || [])].includes('Files');
  const dropPin = e => {
    const row = e.target.closest?.('.aib-note');
    return row ? +row.dataset.i : active;
  };
  let lit = null;
  const light = target => {
    if (lit === target) return;
    lit?.classList.remove('aib-drop');
    lit = target;
    lit?.classList.add('aib-drop');
  };
  function dragOver(e) {
    if (!carriesFiles(e)) return;
    e.preventDefault();
    const i = upload ? dropPin(e) : null;
    e.dataTransfer.dropEffect = i == null ? 'none' : 'copy';
    light(i == null ? null : e.target.closest?.('.aib-note') || pop);
  }
  function dragLeave(e) {
    if (!e.relatedTarget) light(null);
  }
  function drop(e) {
    if (!carriesFiles(e)) return;
    e.preventDefault();
    light(null);
    const i = upload ? dropPin(e) : null;
    if (i == null || !notes.pins[i]) return;
    if (i !== active) setActive(i);
    addPhotos(notes.pins[i], e.dataTransfer.files);
  }
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
    [window, 'dragover', dragOver],
    [window, 'dragleave', dragLeave],
    [window, 'drop', drop],
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
  if (notes.pins.length) hideHint();
  else box.querySelector('[data-tool=pin]').classList.add('aib-pulse');
  setView(view);
  renderPins();
  renderNotes();
  renderLast();
  loop();
  return {close};
}
