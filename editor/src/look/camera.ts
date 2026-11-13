// @ts-nocheck
// Demo camera: a copy of 3d_floor/apartment/smart-home/web/src/camera-preview.js (D-049): a synthetic hallway frame on a
// 960×540 canvas, no video and no permissions. It also draws the camera tile in “Security”: the tile shows what opens on
// tap. Differences: the window title shows the camera name from HA (it used to be “Camera · Hallway”), the time follows the browser clock.
// In HA the window is replaced by the entity's card (HA layer: moreInfo), and the tile shows the entity_picture frame.
import {t, dateTime} from '../i18n/i18n.ts';

export function drawDemoFeed(c) {
  function poly(points, color) {
    c.fillStyle = color;
    c.beginPath();
    points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath();
    c.fill();
  }
  c.fillStyle = '#a4aaa1';
  c.fillRect(0, 0, 960, 540);
  poly(
    [
      [0, 0],
      [960, 0],
      [620, 120],
      [340, 120],
    ],
    '#c0c1b6',
  );
  poly(
    [
      [0, 540],
      [960, 540],
      [620, 365],
      [340, 365],
    ],
    '#746c58',
  );
  poly(
    [
      [0, 0],
      [340, 120],
      [340, 365],
      [0, 540],
    ],
    '#b0b2a8',
  );
  poly(
    [
      [960, 0],
      [620, 120],
      [620, 365],
      [960, 540],
    ],
    '#898f87',
  );
  c.fillStyle = '#3c4540';
  c.fillRect(411, 153, 139, 213);
  c.strokeStyle = '#d2d2c1';
  c.lineWidth = 6;
  c.strokeRect(407, 148, 147, 219);
  c.fillStyle = '#abb0a3';
  c.fillRect(523, 255, 12, 4);
  c.fillStyle = '#141d19';
  c.beginPath();
  c.arc(480, 226, 3, 0, Math.PI * 2);
  c.fill();
  poly(
    [
      [55, 168],
      [245, 199],
      [245, 390],
      [55, 473],
    ],
    '#535c54',
  );
  poly(
    [
      [69, 184],
      [230, 209],
      [230, 374],
      [69, 441],
    ],
    '#87958c',
  );
  poly(
    [
      [760, 275],
      [909, 308],
      [909, 471],
      [760, 406],
    ],
    '#646352',
  );
  c.save();
  c.beginPath();
  c.moveTo(0, 540);
  c.lineTo(960, 540);
  c.lineTo(620, 365);
  c.lineTo(340, 365);
  c.closePath();
  c.clip();
  c.strokeStyle = '#978d71';
  c.lineWidth = 2;
  for (let y = 390; y < 540; y += 32) {
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(960, y);
    c.stroke();
  }
  for (let x = -400; x < 1500; x += 220) {
    c.beginPath();
    c.moveTo(340, 365);
    c.lineTo(x, 540);
    c.stroke();
  }
  c.restore();
  c.fillStyle = '#e1ddbd';
  c.fillRect(425, 72, 115, 8);
  const v = c.createRadialGradient(480, 270, 120, 480, 270, 560);
  v.addColorStop(0, 'transparent');
  v.addColorStop(1, '#0d191aa0');
  c.fillStyle = v;
  c.fillRect(0, 0, 960, 540);
  for (let i = 0; i < 900; i++) {
    c.fillStyle = Math.random() > 0.5 ? '#ffffff12' : '#00000012';
    c.fillRect(Math.random() * 960, Math.random() * 540, 2, 2);
  }
  c.fillStyle = '#00000008';
  for (let y = 0; y < 540; y += 3) c.fillRect(0, y, 960, 1);
}

// Demo stream window over the dashboard; host is the Shadow DOM root. → close function
export function openCameraPreview(host, name) {
  if (host.querySelector('.camera-dialog')) return;
  const esc = s =>
    String(s ?? '').replace(
      /[&<>"']/g,
      c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c],
    );
  const d = document.createElement('dialog');
  d.className = 'camera-dialog';
  d.setAttribute('aria-labelledby', 'camera-title');
  d.innerHTML = `<header><div><h2 id="camera-title">${esc(name || t('Camera'))}</h2><p>${esc(t('Demo stream'))}</p></div><button aria-label="${esc(t('Close camera'))}" autofocus>×</button></header>
    <div class="camera-feed"><canvas width="960" height="540" aria-label="${esc(t('Simulated hallway view'))}"></canvas><span>${esc(t('● DEMO'))}</span><time></time></div>
    <footer>${esc(t('Simulated video · no real camera connected'))}</footer>`;
  host.append(d);
  const c = d.querySelector('canvas').getContext('2d');
  function draw() {
    if (document.hidden) return;
    drawDemoFeed(c);
    d.querySelector('time').textContent = dateTime(new Date(), {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
    });
  }
  draw();
  const timer = setInterval(draw, 150);
  const cleanup = () => {
    clearInterval(timer);
    d.remove();
  };
  d.addEventListener('close', cleanup, {once: true});
  d.querySelector('button').onclick = () => d.close();
  d.addEventListener('click', e => {
    if (e.target === d) {
      const r = d.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) d.close();
    }
  });
  d.showModal();
  return () => {
    d.close();
    cleanup();
  };
}
