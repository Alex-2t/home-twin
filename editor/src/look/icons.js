// Apartment card icons: a copy of 3d_floor/apartment/smart-home/web/src/icons.js (D-049). Do not edit: our own go in look.js.
const shapes = {
  surveillance:
    '<path d="m4 5 13 2-3 8L2 10z"/><path d="m17 8 4 1-2 5-4-1M8 13v5h8m0-3v6"/><path d="m5 8 7 1"/>',
  droplet: '<path d="M12 3C10 6 5 11 5 15a7 7 0 0 0 14 0c0-4-5-9-7-12Z"/>',
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
  bulb: '<path d="M9 18h6m-5 3h4M8.5 14.5a6 6 0 1 1 7 0c-1 .7-1.5 1.5-1.5 3.5h-4c0-2-.5-2.8-1.5-3.5Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  moon: '<path d="M20 15.5A9 9 0 0 1 8.5 4 9 9 0 1 0 20 15.5Z"/>',
  cube: '<path d="m12 3 9 5v9l-9 5-9-5V8zM3 8l9 5 9-5m-9 5v9M7.5 5.5l9 5"/>',
  layers: '<path d="m12 3 10 6-10 6L2 9Zm-9 11 9 5 9-5M3 18l9 5 9-5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  reset: '<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>',
  power: '<path d="M12 2v10m-6-7a9 9 0 1 0 12 0"/>',
  chart: '<path d="M4 20V11M10 20V5M16 20v-6M21 20H3"/>',
  star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9Z"/>',
  grip: '<path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" stroke-width="2.6"/>',
  up: '<path d="m6 15 6-6 6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  bolt: '<path d="M13.5 2.5 5 13.5h6.5l-1 8 8.5-11h-6.5l1-8Z"/>',
  arrow: '<path d="m9 5 7 7-7 7"/>',
  bed: '<path d="M3 18V7m18 11V9M3 13h18M7 9h5v4H7zM3 18v3m18-3v3M3 17h18"/>',
  kitchen: '<path d="M4 3v6a3 3 0 0 0 6 0V3M7 3v18M17 3v8h4M21 3v18"/>',
  sofa: '<path d="M5 11V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v4M4 10a2 2 0 0 0-2 2v6h20v-6a2 2 0 0 0-4 0v2H6v-2a2 2 0 0 0-2-2Zm0 8v3m16-3v3"/>',
  bath: '<path d="M4 13V6a3 3 0 0 1 6 0M2 13h20v3a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4zm4 7v2m12-2v2"/>',
  door: '<path d="M5 21V3h14v18M3 21h18M15 12h.01"/>',
  camera: '<path d="M14 8l7-4v16l-7-4"/><rect x="3" y="6" width="11" height="12" rx="2"/>',
  window: '<path d="M3 3h18v18H3zm9 0v18M3 12h18"/>',
  strip: '<path d="M3 7h18v4H3zm3 8v4m6-4v6m6-6v4"/>',
  device: '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8m-4-4v4"/>',
  link: '<path d="m10 13 4-4m-6 6-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m2 2 2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0" transform="translate(1 0) scale(.95)"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  curtain: '<path d="M2 3h20M6 3v18M18 3v18"/><path d="M6 3c3.6 2 3.6 13 0 18M18 3c-3.6 2-3.6 13 0 18"/>',
  blind: '<path d="M3 3h18v3.5H3z"/><path d="M12 6.5v6M8.5 12.5h7v2.5h-7z"/>',
  cove: '<path d="M3 4h18M5 4v3.5h14V4"/><path d="M7 11.5c1.5 1 3.1 1.5 5 1.5s3.5-.5 5-1.5M9.5 15.4c.8.5 1.6.8 2.5.8s1.7-.3 2.5-.8"/>',
  'cover-open': '<path d="M12 4v16"/><path d="m9 9-3.5 3L9 15M15 9l3.5 3L15 15"/>',
  'cover-close': '<path d="M12 4v16"/><path d="m5.5 9 3.5 3-3.5 3M18.5 9 15 12l3.5 3"/>',
  'cover-up': '<path d="M12 20V5"/><path d="m6 11 6-6 6 6"/>',
  'cover-down': '<path d="M12 4v15"/><path d="m6 13 6 6 6-6"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="2.5"/>',
  expand: '<path d="M3 9V3h6m6 0h6v6M3 15v6h6m6 0h6v-6"/>',
  collapse: '<path d="M9 3v6H3m12-6v6h6M9 21v-6H3m12 6v-6h6"/>',
  wind: '<path d="M9.6 4.6a2 2 0 1 1 1.4 3.4H2M12.6 19.4a2 2 0 1 0 1.4-3.4H2M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2"/>',
  fan: '<circle cx="12" cy="12" r="1.6"/><path d="M12 10.4c0-2.6.4-6.4 3.1-6.4 2 0 2.8 2.2 1.5 3.8-1.1 1.4-3 2.2-4.6 2.6Z"/><path d="M13.6 12c2.6 0 6.4.4 6.4 3.1 0 2-2.2 2.8-3.8 1.5-1.4-1.1-2.2-3-2.6-4.6Z"/><path d="M12 13.6c0 2.6-.4 6.4-3.1 6.4-2 0-2.8-2.2-1.5-3.8 1.1-1.4 3-2.2 4.6-2.6Z"/><path d="M10.4 12c-2.6 0-6.4-.4-6.4-3.1 0-2 2.2-2.8 3.8-1.5 1.4 1.1 2.2 3 2.6 4.6Z"/>',
  towel: '<path d="M6 3.5v17M18 3.5v17"/><path d="M6 7h12M6 12h12M6 17h12"/>',
  thermometer: '<path d="M14 14.8V5a2 2 0 1 0-4 0v9.8a4 4 0 1 0 4 0Z"/><path d="M12 9v6"/>',
  eye: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z"/><circle cx="12" cy="12" r="2.6"/>',
  sliders:
    '<path d="M4 7h9m4 0h3M4 12h3m4 0h9M4 17h11m4 0h1"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="17" r="2"/>',
  vacuum: '<circle cx="12" cy="12" r="9"/><path d="M4.5 9h15"/><circle cx="12" cy="14.5" r="1.5"/>',
  // Air conditioner modes: cool and auto (a sun halved with a snowflake).
  snowflake:
    '<path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7"/><path d="m9 3.5 3 2.5 3-2.5M9 20.5l3-2.5 3 2.5M4 10.9l3.7-1.3-.7-3.8M20 13.1l-3.7 1.3.7 3.8M4 13.1l3.7 1.3-.7 3.8M20 10.9l-3.7-1.3.7-3.8"/>',
  'sun-snow':
    '<path d="M10 9a3 3 0 0 0 0 6M10 3v1.5M10 19.5V21M3 12h1.5M4.3 6.3l1.1 1.1M4.3 17.7l1.1-1.1"/><path d="M14 3v18M14 7.5l3.5-2.5M14 16.5l3.5 2.5M14 12h7M20.5 9.5 18 12l2.5 2.5"/>',
  // Leak: a drop above a puddle.
  leak: '<path d="M12 3c-1.7 2.5-4.5 5.2-4.5 7.8a4.5 4.5 0 0 0 9 0C16.5 8.2 13.7 5.5 12 3Z"/><path d="M3 19.5c1.5 0 1.5-1 3-1s1.5 1 3 1 1.5-1 3-1 1.5 1 3 1 1.5-1 3-1 1.5 1 3 1"/>',
  flame:
    '<path d="M12 3c.6 3.2 5 5.4 5 10.3a5 5 0 0 1-10 0c0-2.1.9-3.6 2.1-4.6.1 1.9.9 3.1 2 3.1-.5-2.9 0-5.8.9-8.8Z"/>',
  // Weather for the forecast strip in the overview: the same kinds weatherCondition returns.
  cloud: '<path d="M7 18.5h10a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.7 1.4A3.4 3.4 0 0 0 7 18.5Z"/>',
  partly:
    '<circle cx="8" cy="8" r="3"/><path d="M8 2.5v1M2.5 8h1M4.1 4.1l.7.7M11.9 4.1l-.7.7"/><path d="M10 20.5h7.5a3.5 3.5 0 0 0 .3-7 5 5 0 0 0-9.3 1.4A2.8 2.8 0 0 0 10 20.5Z"/>',
  'moon-cloud':
    '<path d="M11 8.75A4.5 4.5 0 0 1 5.25 3a4.5 4.5 0 1 0 5.75 5.75Z"/><path d="M10 20.5h7.5a3.5 3.5 0 0 0 .3-7 5 5 0 0 0-9.3 1.4A2.8 2.8 0 0 0 10 20.5Z"/>',
  rain: '<path d="M7 15h10a3.6 3.6 0 0 0 .4-7.2 5 5 0 0 0-9.7 1.2A3 3 0 0 0 7 15Z"/><path d="m8.5 18-1 2.5m5-2.5-1 2.5m5-2.5-1 2.5"/>',
  snow: '<path d="M7 15h10a3.6 3.6 0 0 0 .4-7.2 5 5 0 0 0-9.7 1.2A3 3 0 0 0 7 15Z"/><circle cx="8" cy="19" r=".9" fill="currentColor"/><circle cx="12" cy="20.5" r=".9" fill="currentColor"/><circle cx="16" cy="19" r=".9" fill="currentColor"/>',
  fog: '<path d="M4 8h16M3 12h18M5 16h14"/>',
  storm:
    '<path d="M7 15h10a3.6 3.6 0 0 0 .4-7.2 5 5 0 0 0-9.7 1.2A3 3 0 0 0 7 15Z"/><path d="m12.5 15.5-2 3h3l-2 3"/>',
  sunset:
    '<path d="M3 19h18M7 19a5 5 0 0 1 10 0M12 4v6m-2.5-2.5L12 10l2.5-2.5M4.6 13.6l1.2.9m13.6-.9-1.2.9"/>',
  sunrise:
    '<path d="M3 19h18M7 19a5 5 0 0 1 10 0M12 10V4M9.5 6.5 12 4l2.5 2.5M4.6 13.6l1.2.9m13.6-.9-1.2.9"/>',
  // Notification types and their settings.
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  alert:
    '<path d="M10.3 4.2 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z"/><path d="M12 9.5v4M12 17h.01"/>',
  hand: '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12m0-1.5v-6a1.5 1.5 0 0 1 3 0V12m0-5.5a1.5 1.5 0 0 1 3 0V13m0-3.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1.6a6 6 0 0 1-4.6-2.2L4.3 15a1.6 1.6 0 0 1 2.4-2.1L8 14.2"/>',
  sparkle:
    '<path d="M12 3.5 13.8 9a2 2 0 0 0 1.2 1.2l5.5 1.8-5.5 1.8a2 2 0 0 0-1.2 1.2L12 20.5 10.2 15A2 2 0 0 0 9 13.8L3.5 12 9 10.2A2 2 0 0 0 10.2 9Z"/><path d="M19 3v4M17 5h4"/>',
  leaf: '<path d="M5 19c0-8 5-13 15-14-1 10-6 15-14 15"/><path d="M5 19c3-4 6-7 10-9"/>',
  wifi: '<path d="M2.5 8.8a14 14 0 0 1 19 0M5.5 12.2a9.5 9.5 0 0 1 13 0M8.6 15.6a5 5 0 0 1 6.8 0M12 19.5h.01"/>',
  'wifi-off':
    '<path d="M3 3l18 18M8.6 15.6a5 5 0 0 1 6.8 0M5.5 12.2a9.6 9.6 0 0 1 4.3-2.4M14.5 9.8a9.6 9.6 0 0 1 4 2.4M2.5 8.8a14 14 0 0 1 4-2.6M10.5 4.6a14 14 0 0 1 11 4.2M12 19.5h.01"/>',
  server:
    '<rect x="3" y="3.5" width="18" height="7" rx="2"/><rect x="3" y="13.5" width="18" height="7" rx="2"/><path d="M7 7h.01M7 17h.01M11 7h6M11 17h6"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
};
export const icon = name =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[name] || shapes.bulb}</svg>`;
export const roomIcon = {
  bedroom: 'bed',
  kitchen: 'kitchen',
  living: 'sofa',
  bathroom: 'bath',
  hall: 'door',
  panorama: 'window',
};
