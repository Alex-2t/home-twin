// The AI build's package (D-085): what the owner bought, shown as shares only, used and left in percent, never money. The service
// keeps what is on it; this browser keeps only its key (no account). When the package is used up, a build waits, and a top-up
// lets it go on from where it stopped.
//   GET  <api>/api/wallets/<key>          {used, left, empty}: shares from 0 to 1 of all that was bought
//   POST <api>/api/wallets                {key, used, left, empty}: a new package
//   POST <api>/api/wallets/<key>/top-up   {used, left, empty}: one more package
import {t} from '../i18n/i18n.js';
import {esc} from './ui.js';
import {icon} from './icons.js';

// The package this browser holds: its key only.
const WALLET = 'home-twin-editor:ai-wallet';

function storedWallet() {
  try {
    return localStorage.getItem(WALLET) || null;
  } catch {
    return null;
  }
}

function storeWallet(key) {
  try {
    localStorage.setItem(WALLET, key);
  } catch {}
}

async function jsonOf(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

/** The package this browser holds, {key, used, left, empty}; a new one when it holds none the service knows. */
export async function ensureWallet(api = '') {
  const key = storedWallet();
  if (key) {
    const res = await fetch(`${api}/api/wallets/${encodeURIComponent(key)}`, {cache: 'no-store'});
    if (res.ok) return {key, ...(await res.json())};
    if (res.status !== 404) throw new Error(res.statusText);
  }
  const data = await jsonOf(await fetch(`${api}/api/wallets`, {method: 'POST'}));
  storeWallet(data.key);
  return data;
}

/** One more package on this browser's package → {key, used, left, empty}. */
export async function topUpWallet(api, key) {
  const data = await jsonOf(await fetch(`${api}/api/wallets/${encodeURIComponent(key)}/top-up`, {method: 'POST'}));
  return {key, ...data};
}

/**
 * The shares as whole percents: a little used never reads as 0 % used, and a package not used up never reads as 100 %
 * (it would look like the build should wait).
 */
export function walletPercents(share) {
  const used = share.empty ? 100 : Math.min(99, Math.ceil(share.used * 100));
  return {used, left: 100 - used};
}

/** The package as a small bar of what is used, with what is left beside it; '' when there is none. */
export function walletMeter(share) {
  if (!share) return '';
  const {used, left} = walletPercents(share);
  const title = t('Package: {0}% used, {1}% left', used, left);
  return `<span class="aib-wallet${share.empty ? ' empty' : ''}" title="${esc(title)}">${icon('wallet', 14)}
    <i class="aib-meter"><i style="width:${used}%"></i></i><span>${esc(t('{0}% left', left))}</span></span>`;
}
