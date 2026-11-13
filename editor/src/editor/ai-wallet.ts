// The AI build's package (D-085, D-086): what the owner bought, shown as shares only, used and left in percent, never money. The
// service keeps what is on it; this browser keeps only its key (no account). When the package is used up, a build waits, and
// a top-up lets it go on from where it stopped. A package is bought at the payment provider's checkout page, which sends the
// browser back here with ?payment_id=…&status=…; the service checks the payment itself before it counts it.
//   GET  <api>/api/wallets/offer          {payments: 'dodo' | 'free', price: {amount, currency}}: how a package comes
//   GET  <api>/api/wallets/<key>          {used, left, empty}: shares from 0 to 1 of all that was bought
//   POST <api>/api/checkout               {wallet?, build?} → {url}: the checkout page for one package
//   POST <api>/api/payments/<id>/claim    {key, used, left, empty}: the payment checked and counted once
//   Where the service takes no payments (testing), a package is given free:
//   POST <api>/api/wallets                {key, used, left, empty}: a new package
//   POST <api>/api/wallets/<key>/top-up   {used, left, empty}: one more package
import {t, getLang} from '../i18n/i18n.ts';
import {esc} from './ui.ts';
import {icon} from './icons.ts';

/** A package's price: its amount in the currency's units ('USD'…). */
export interface Price {
  amount: number;
  currency: string;
}

/** How a package comes (GET /api/wallets/offer): bought at a checkout ('dodo') or given free ('free'), and its price. */
export interface WalletOffer {
  payments: 'dodo' | 'free';
  price?: Price | null;
}

/** What is on a package: shares from 0 to 1 of all that was bought, and whether it is used up. */
export interface WalletShare {
  used: number;
  left: number;
  empty: boolean;
}

/** The package this browser holds: its key, and what is on it. */
export interface Wallet extends WalletShare {
  key: string;
}

/** Back from the checkout (claimFromAddress): the package it went to, or it did not go through, or it could not be checked. */
export type PaymentClaim =
  | (Wallet & {failed?: undefined; error?: undefined})
  | {failed: true; error?: undefined}
  | {error: string; failed?: undefined};

/** A failed answer of the service says why in {error}. */
interface ServiceError {
  error?: string;
}

// The package this browser holds: its key only.
const WALLET = 'home-twin-editor:ai-wallet';

function storedWallet(): string | null {
  try {
    return localStorage.getItem(WALLET) || null;
  } catch {
    return null;
  }
}

function storeWallet(key: string): void {
  try {
    localStorage.setItem(WALLET, key);
  } catch {}
}

// The service's answer as the API above describes it (the caller names which one). The service is ours: its answers are
// taken as they are, not checked field by field, as they always were.
async function jsonOf<Answer>(res: Response): Promise<Answer> {
  const data: unknown = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as ServiceError).error || res.statusText);
  return data as Answer;
}

/** How a package comes from the service: bought at a checkout ('dodo') or given free ('free'), and its price. */
export async function walletOffer(api = ''): Promise<WalletOffer> {
  return jsonOf<WalletOffer>(await fetch(`${api}/api/wallets/offer`, {cache: 'no-store'}));
}

/**
 * The package this browser holds, {key, used, left, empty}. With none the service knows: a new one where packages are free,
 * else null — one is bought first.
 */
export async function ensureWallet(api = '', offer: WalletOffer | null = null): Promise<Wallet | null> {
  const key = storedWallet();
  if (key) {
    const res = await fetch(`${api}/api/wallets/${encodeURIComponent(key)}`, {cache: 'no-store'});
    // The service's shares of the package, as the API above says.
    if (res.ok) return {key, ...((await res.json()) as WalletShare)};
    if (res.status !== 404) throw new Error(res.statusText);
  }
  if ((offer || (await walletOffer(api))).payments !== 'free') return null;
  const data = await jsonOf<Wallet>(await fetch(`${api}/api/wallets`, {method: 'POST'}));
  storeWallet(data.key);
  return data;
}

/** To the checkout page for one package: on this browser's package (or a new one), or on the build's own. */
export async function buyPackage(
  api: string,
  {wallet = null, build = null}: {wallet?: string | null; build?: string | null} = {},
): Promise<void> {
  const res = await fetch(`${api}/api/checkout`, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({...(wallet ? {wallet} : {}), ...(build ? {build} : {})}),
  });
  const {url} = await jsonOf<{url: string}>(res);
  location.assign(url);
}

// What the checkout adds to the address on its way back; taken off once read.
const RETURN_PARAMS = ['payment_id', 'status', 'paid', 'email', 'license_key'];

/**
 * Back from the checkout: the payment in the address is checked and counted by the service, and the package it went to is
 * kept in this browser. → null when the address holds no payment; {failed: true} when it did not go through; {error} when it
 * could not be checked; else the package.
 */
export async function claimFromAddress(api = ''): Promise<PaymentClaim | null> {
  const url = new URL(location.href);
  const payment = url.searchParams.get('payment_id');
  const status = url.searchParams.get('status');
  const back = url.searchParams.has('paid') || !!payment;
  for (const name of RETURN_PARAMS) url.searchParams.delete(name);
  if (back) history.replaceState(history.state, '', url);
  if (!payment) return null;
  if (status && status !== 'succeeded') return {failed: true};
  try {
    const data = await jsonOf<Wallet>(
      await fetch(`${api}/api/payments/${encodeURIComponent(payment)}/claim`, {method: 'POST'}),
    );
    storeWallet(data.key);
    return data;
  } catch (e) {
    // fetch and jsonOf fail with an Error.
    return {error: (e as Error).message};
  }
}

/** A package's price as the owner reads it: "$20", "20 $", in their language's way. */
export function priceText(price: Price | null | undefined): string {
  if (!price) return '';
  const whole = Number.isInteger(price.amount);
  return new Intl.NumberFormat(getLang(), {
    style: 'currency',
    currency: price.currency,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(price.amount);
}

/** One more package on this browser's package → {key, used, left, empty}. */
export async function topUpWallet(api: string, key: string): Promise<Wallet> {
  const data = await jsonOf<WalletShare>(
    await fetch(`${api}/api/wallets/${encodeURIComponent(key)}/top-up`, {method: 'POST'}),
  );
  return {key, ...data};
}

/**
 * The shares as whole percents: a little used never reads as 0 % used, and a package not used up never reads as 100 %
 * (it would look like the build should wait).
 */
export function walletPercents(share: WalletShare): {used: number; left: number} {
  const used = share.empty ? 100 : Math.min(99, Math.ceil(share.used * 100));
  return {used, left: 100 - used};
}

/** The package as a small bar of what is used, with what is left beside it; '' when there is none. */
export function walletMeter(share: WalletShare | null | undefined): string {
  if (!share) return '';
  const {used, left} = walletPercents(share);
  const title = t('Package: {0}% used, {1}% left', used, left);
  return `<span class="aib-wallet${share.empty ? ' empty' : ''}" title="${esc(title)}">${icon('wallet', 14)}
    <i class="aib-meter"><i style="width:${used}%"></i></i><span>${esc(t('{0}% left', left))}</span></span>`;
}
