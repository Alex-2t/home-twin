// The AI build's account (D-088): who is signed in, what is left of what they bought (shares only, D-085), and buying
// more (D-086). The money is not in this browser: the payments service keeps the account and its balance, and its session
// cookie (HttpOnly, set by the service) says who this browser is. Clearing the browser only signs out; signing in again
// brings the balance back. The service is reached at the AI build's own address (/pay/…), so the cookie is first-party:
//   GET  <api>/pay/offer                     {payments, mode, price, signIn, site}: how a package comes, its price, the sign-in
//                                            ways, and the service's public address (where a tab opens from Home Assistant)
//   POST <api>/pay/auth/email/start          {email, lang} → {minutes}: a 6-digit code goes to the email
//   POST <api>/pay/auth/email/verify         {email, code} → the account; the service sets the session cookie
//   GET  <api>/pay/auth/<google|github>/start?return=<path>   the provider's sign-in, then back to <path>
//                                            (a failed one comes back with ?signin=failed, a cancelled one ?signin=cancelled)
//   GET  <site>/pay/auth/<google|github>/start?link=<id>   the same from Home Assistant's panel (D-133), in a tab of its
//                                            own: the account goes to the link, the tab lands on <site>/?signin=linked
//                                            (link-failed, link-cancelled) and is not signed in itself
//   POST <api>/pay/auth/link                 {link, secret}: the panel asks until the tab is through → 202 meanwhile; the
//                                            account (the integration keeps its session); 410 LINK_FAILED {outcome}, LINK_GONE
//   GET  <api>/pay/me                        the account {email, providers, balance}; 401 SIGNED_OUT. The balance is
//                                            {current: {used, left}, packages, packagesLeft, used, left, empty, bought}:
//                                            packages are spent one after another (D-108), current is the one being spent,
//                                            packagesLeft the full ones after it; used/left are of all bought (older
//                                            services give only those); bought is false until a first package;
//                                            expiresAt (ISO, null with nothing left) is when what is left expires, 30 days
//                                            after the last purchase, and expired says the balance ran out that way (D-135)
//   POST <api>/pay/auth/sign-out
//   POST <api>/pay/checkout                  {return, lang} → {url}: the provider's checkout for one package; it comes back to
//                                            <return>?paid=1&payment_id=…&status=…
//   POST <api>/pay/payments/<id>/claim       the payment checked with the provider and counted once → the account;
//                                            402 PAYMENT_FAILED, 404 PAYMENT_UNKNOWN, 409 PAYMENT_NOT_OURS. Signed out
//                                            (bought from Home Assistant, D-132): only {credited}
//   POST <api>/pay/test/top-up               a free test package, only where the service takes no payments
// Public POSTs are JSON (the service refuses anything else). A refusal says why in {error}: a code such as SIGNED_OUT.
// Where the AI build runs without the service (local work), /pay/offer answers 404: there are no accounts, builds are free.
import {t, N, getLang, dateTime} from '../i18n/i18n.ts';
import {esc} from './ui.ts';
import {icon} from './icons.ts';

/** A sign-in provider the service may offer besides email. */
export type Provider = 'google' | 'github';

/** A way to sign in: a code by email, or a provider. */
export type SignInWay = 'email' | Provider;

/** A package's price: its amount in the currency's units ('USD'…). */
export interface Price {
  amount: number;
  currency: string;
}

/** How a package comes (GET /pay/offer): bought at a checkout ('dodo') or given free for testing ('free'), its price, and the sign-in ways. */
export interface Offer {
  payments: 'dodo' | 'free';
  /** The checkout's mode: 'test' takes test cards only. */
  mode: 'test' | 'live' | null;
  price: Price | null;
  signIn: SignInWay[];
  /** The service's public address: a provider's sign-in from Home Assistant opens a tab there. null: an older service. */
  site: string | null;
}

/** One package's shares, from 0 to 1. */
export interface PackageShare {
  used: number;
  left: number;
}

/**
 * What is left on the account (D-108): packages are spent one after another in the order bought, so the owner sees the
 * current package in percent and how many full packages wait after it. Also whether nothing is left, and whether a
 * package was ever bought (a new account is empty too, but it has used nothing).
 */
export interface BalanceShare {
  /** Of all that was bought (what an older service gives); the screens show `current`. */
  used: number;
  left: number;
  empty: boolean;
  bought: boolean;
  /** How many packages were bought. */
  packages: number;
  /** Full packages after the current one. */
  packagesLeft: number;
  /** The package being spent now. */
  current: PackageShare;
  /** When what is left expires, ISO (D-135); null with nothing left, and from an older service. */
  expiresAt: string | null;
  /** Nothing is left because the balance expired (D-135), not because it was spent. */
  expired: boolean;
}

/** The signed-in account (GET /pay/me): its email, the providers it has signed in with, and its balance. */
export interface Account {
  email: string;
  providers: Provider[];
  balance: BalanceShare;
}

/** A refusal of the service by its code ('SIGNED_OUT', 'CODE_WRONG'…), with the HTTP status it came with. */
export class AccountError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

/** The code a refusal comes with when the browser is not signed in (any route that needs an account). */
export const SIGNED_OUT = 'SIGNED_OUT';

// ---------- the service's answers, checked ----------

type Fields = Record<string, unknown>;

const isFields = (value: unknown): value is Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isProvider = (value: unknown): value is Provider => value === 'google' || value === 'github';

const isSignInWay = (value: unknown): value is SignInWay => value === 'email' || isProvider(value);

/** A share from 0 to 1; anything else reads as 0. */
function shareOf(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function priceFrom(value: unknown): Price | null {
  if (!isFields(value)) return null;
  if (typeof value.amount !== 'number' || typeof value.currency !== 'string') return null;
  return {amount: value.amount, currency: value.currency};
}

/** The offer in the service's answer; throws when the answer is not one. */
export function offerFrom(data: unknown): Offer {
  if (!isFields(data) || (data.payments !== 'dodo' && data.payments !== 'free'))
    throw new AccountError('BAD_ANSWER', 0);
  const mode = data.mode === 'test' || data.mode === 'live' ? data.mode : null;
  const ways = Array.isArray(data.signIn) ? data.signIn.filter(isSignInWay) : [];
  // Email is always there: the service offers it with no setup.
  const signIn: SignInWay[] = ways.includes('email') ? ways : ['email', ...ways];
  const site =
    typeof data.site === 'string' && /^https?:\/\/[^/]/.test(data.site)
      ? data.site.replace(/\/+$/, '')
      : null;
  return {payments: data.payments, mode, price: priceFrom(data.price), signIn, site};
}

/** A count of packages: a whole number from 0; anything else reads as `fallback`. */
function countOf(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) return fallback;
  return value;
}

/** A package's shares in the service's answer; null when it gives none. */
function packageShareFrom(value: unknown): PackageShare | null {
  if (!isFields(value)) return null;
  return {used: shareOf(value.used), left: shareOf(value.left)};
}

/** The balance's shares in the service's answer; a missing balance reads as nothing left. */
export function balanceFrom(value: unknown): BalanceShare {
  if (!isFields(value)) {
    return {
      used: 1,
      left: 0,
      empty: true,
      bought: false,
      packages: 0,
      packagesLeft: 0,
      current: {used: 1, left: 0},
      expiresAt: null,
      expired: false,
    };
  }
  const empty = value.empty === true;
  // A service that does not say yet: something left means something was bought; nothing left reads as used up.
  const bought = typeof value.bought === 'boolean' ? value.bought : true;
  const used = shareOf(value.used);
  const left = shareOf(value.left);
  // A service from before D-108 tells only shares of all that was bought: they read as one package.
  const current = packageShareFrom(value.current) ?? {used, left};
  const packages = countOf(value.packages, bought ? 1 : 0);
  const packagesLeft = countOf(value.packagesLeft, 0);
  const expiresAt =
    typeof value.expiresAt === 'string' && Number.isFinite(Date.parse(value.expiresAt))
      ? value.expiresAt
      : null;
  const expired = value.expired === true;
  return {used, left, empty, bought, packages, packagesLeft, current, expiresAt, expired};
}

/** The account in the service's answer; throws when the answer is not one. */
export function accountFrom(data: unknown): Account {
  if (!isFields(data) || typeof data.email !== 'string') throw new AccountError('BAD_ANSWER', 0);
  const providers = Array.isArray(data.providers) ? data.providers.filter(isProvider) : [];
  return {email: data.email, providers, balance: balanceFrom(data.balance)};
}

// ---------- talking to the service ----------

/** The answer's JSON, or {} when it has none. */
async function bodyOf(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

/** The answer's data when it is ok; else an AccountError with the code the service gave (or the HTTP status text). */
async function answerOf(res: Response): Promise<unknown> {
  const data = await bodyOf(res);
  if (res.ok) return data;
  const code =
    isFields(data) && typeof data.error === 'string' ? data.error : res.statusText || String(res.status);
  throw new AccountError(code, res.status);
}

const getFrom = (url: string): Promise<Response> => fetch(url, {cache: 'no-store'});

/** A public POST: JSON, as the service asks of every page. */
const postTo = (url: string, body: Fields = {}): Promise<Response> =>
  fetch(url, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body)});

/** How a package comes, and the sign-in ways; null where the AI build has no accounts (local work: nothing is charged). */
export async function accountOffer(api = ''): Promise<Offer | null> {
  const res = await getFrom(`${api}/pay/offer`);
  if (res.status === 404) return null;
  return offerFrom(await answerOf(res));
}

/** The signed-in account; null when this browser is signed out. */
export async function currentAccount(api = ''): Promise<Account | null> {
  const res = await getFrom(`${api}/pay/me`);
  if (res.status === 401) return null;
  return accountFrom(await answerOf(res));
}

/** A sign-in code to the email, in the owner's language (the service answers the same whether or not it has the email). */
export async function sendSignInCode(api: string, email: string): Promise<void> {
  await answerOf(await postTo(`${api}/pay/auth/email/start`, {email, lang: getLang()}));
}

/** The code typed in: signs this browser in → the account. */
export async function verifySignInCode(api: string, email: string, code: string): Promise<Account> {
  return accountFrom(await answerOf(await postTo(`${api}/pay/auth/email/verify`, {email, code})));
}

/** Where the browser goes to sign in with a provider; it comes back to returnPath (a path on this site). */
export function providerSignInUrl(api: string, provider: Provider, returnPath: string): string {
  return `${api}/pay/auth/${provider}/start?return=${encodeURIComponent(returnPath)}`;
}

// ---------- a provider's sign-in from Home Assistant's panel (D-133) ----------

/** A link id or its secret: 24 random bytes, base64url (the service takes 22 characters and more). */
export function newLinkToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** The tab's address for a provider's sign-in that goes to the link, not to the tab: on the service's own site. */
export function linkSignInUrl(site: string, provider: Provider, link: string): string {
  return `${site}/pay/auth/${provider}/start?link=${encodeURIComponent(link)}`;
}

/** What the panel hears when it asks for its link. */
export type LinkAnswer =
  | {state: 'waiting'}
  | {state: 'signed-in'; account: Account}
  | {state: 'ended'; why: 'failed' | 'cancelled' | 'gone'};

/** The panel's ask for its link: still waiting for the tab, signed in (the integration now keeps the session), or ended. */
export async function askSignInLink(api: string, link: string, secret: string): Promise<LinkAnswer> {
  const res = await postTo(`${api}/pay/auth/link`, {link, secret});
  if (res.status === 202) return {state: 'waiting'};
  if (res.status === 410 || res.status === 404) {
    const data = await bodyOf(res);
    const cancelled = isFields(data) && data.outcome === 'cancelled';
    const failed = isFields(data) && data.error === 'LINK_FAILED';
    return {state: 'ended', why: cancelled ? 'cancelled' : failed ? 'failed' : 'gone'};
  }
  return {state: 'signed-in', account: accountFrom(await answerOf(res))};
}

export async function signOut(api = ''): Promise<void> {
  await answerOf(await postTo(`${api}/pay/auth/sign-out`));
}

/** The provider's checkout page for one package on this account; it comes back to returnPath. */
export async function checkoutUrl(api: string, returnPath: string): Promise<string> {
  const data = await answerOf(await postTo(`${api}/pay/checkout`, {return: returnPath, lang: getLang()}));
  if (!isFields(data) || typeof data.url !== 'string') throw new AccountError('BAD_ANSWER', 0);
  return data.url;
}

/** A free test package, where the service takes no payments → the account with it. */
export async function testTopUp(api = ''): Promise<Account> {
  return accountFrom(await answerOf(await postTo(`${api}/pay/test/top-up`)));
}

/** The payment the browser came back with, checked by the service and counted once → the account with it. */
export async function claimPayment(api: string, payment: string): Promise<Account> {
  return accountFrom(
    await answerOf(await postTo(`${api}/pay/payments/${encodeURIComponent(payment)}/claim`)),
  );
}

/**
 * A payment counted from a browser that is not signed in (D-132: bought from Home Assistant's panel, whose integration holds the
 * session); the service then says only that it was counted.
 */
export async function claimPaymentSignedOut(api: string, payment: string): Promise<void> {
  await answerOf(await postTo(`${api}/pay/payments/${encodeURIComponent(payment)}/claim`));
}

/** Until D-088 this browser kept its package's key here; the balance is on the account now, and the key is of no use. */
const OLD_WALLET_KEY = 'home-twin-editor:ai-wallet';

/** The package's key an older editor kept in this browser, taken away. */
export function forgetOldWallet(): void {
  try {
    localStorage.removeItem(OLD_WALLET_KEY);
  } catch {}
}

// ---------- the address ----------

/** What the address brings back from the checkout or a provider's sign-in. */
export interface AddressReturn {
  /** The payment the checkout came back with. */
  payment: string | null;
  /** The checkout's word on it ('succeeded'…); null when it gave none. */
  paymentStatus: string | null;
  /**
   * A provider's sign-in that did not go through; or one from Home Assistant's panel (D-133), which ends in a tab of its own:
   * through (linked), or not.
   */
  signIn: SignInReturn | null;
  /** The address without what was read: put back in its place so a reload does not read it again. */
  clean: string;
  /** Whether anything was read (the address is to be replaced). */
  found: boolean;
}

// What the checkout and the sign-in add to the address on their way back.
const RETURN_PARAMS = ['payment_id', 'status', 'paid', 'email', 'license_key', 'signin'];

const SIGN_IN_RETURNS = ['failed', 'cancelled', 'linked', 'link-failed', 'link-cancelled'] as const;
export type SignInReturn = (typeof SIGN_IN_RETURNS)[number];
const isSignInReturn = (value: string | null): value is SignInReturn =>
  (SIGN_IN_RETURNS as readonly (string | null)[]).includes(value);

/** What the address brings back (see AddressReturn); href is the page's address. */
export function readReturn(href: string): AddressReturn {
  const url = new URL(href);
  const params = url.searchParams;
  const signInParam = params.get('signin');
  const signIn = isSignInReturn(signInParam) ? signInParam : null;
  const found = RETURN_PARAMS.some(name => params.has(name));
  const payment = params.get('payment_id');
  const paymentStatus = params.get('status');
  for (const name of RETURN_PARAMS) params.delete(name);
  return {payment, paymentStatus, signIn, clean: url.href, found};
}

/** The path of an address, with its query and hash: where a sign-in or the checkout comes back to. */
export function pathOf(href: string): string {
  const url = new URL(href);
  return url.pathname + url.search + url.hash;
}

// ---------- what the owner reads ----------

/** A refusal or failure in the owner's words. */
export function refusalText(error: unknown): string {
  // fetch fails with a TypeError when there is no connection.
  if (error instanceof TypeError) return t('No connection. Try again.');
  if (!(error instanceof AccountError)) return error instanceof Error ? error.message : String(error);
  if (error.code === SIGNED_OUT) return t('You are signed out. Sign in again.');
  if (error.code === 'EMAIL_INVALID') return t('Check the email address');
  if (error.code === 'CODE_WRONG') return t('Wrong code. Check it and try again.');
  if (error.code === 'CODE_EXPIRED') return t('The code has expired. Send a new one.');
  if (error.code === 'CODE_TRIES') return t('Too many tries. Send a new code.');
  if (error.code === 'TOO_MANY_CODES') return t('Too many codes asked. Wait an hour, then send a new one.');
  if (error.code === 'PAYMENT_FAILED') return t('The payment did not go through');
  if (error.code === 'PAYMENT_UNKNOWN') return t('The payment was not found');
  if (error.code === 'PAYMENT_NOT_OURS') return t('This payment is not for a package here');
  if (error.status >= 500 || error.status === 0)
    return t('The service is not answering. Try again in a minute.');
  return error.code;
}

/** The claim's own refusals: said as they are (the payment did not go through, is not found, is not ours). */
const PAYMENT_REFUSALS = new Set(['PAYMENT_FAILED', 'PAYMENT_UNKNOWN', 'PAYMENT_NOT_OURS']);

/** Why the payment the browser came back with was not counted, in the owner's words. */
export function paymentClaimText(error: unknown): string {
  if (error instanceof AccountError && PAYMENT_REFUSALS.has(error.code)) return refusalText(error);
  return t('Could not check the payment: {0}', refusalText(error));
}

/** Whether a failure means this browser is signed out. */
export const isSignedOut = (error: unknown): boolean =>
  error instanceof AccountError && error.code === SIGNED_OUT;

/** A package's price as the owner reads it: "$20", "20 $", in their language's way. */
export function priceText(price: Price | null | undefined): string {
  if (!price) return '';
  const whole = Number.isInteger(price.amount);
  const digits = whole ? 0 : 2;
  const format = new Intl.NumberFormat(getLang(), {
    style: 'currency',
    currency: price.currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return format.format(price.amount);
}

/**
 * The button that gets one more package: with its price where it is bought ("Top up" once the account has bought one), a
 * free top-up where packages are given for testing.
 */
export function buyLabel(offer: Offer | null, {topUp = false}: {topUp?: boolean} = {}): string {
  if (offer?.payments !== 'dodo') return t('Top up');
  const price = priceText(offer.price);
  return topUp ? t('Top up · {0}', price) : t('Buy a package · {0}', price);
}

/** An empty balance in words: a new account has no package yet; one that bought has nothing left, or it expired. */
export function emptyBalanceText(share: BalanceShare): string {
  if (share.expired) return t('Your package expired');
  return share.bought ? t('Nothing left on your account') : t('No package yet');
}

/** Why a build cannot start with an empty balance: the first package, or nothing left of what was bought. */
export function emptyStartText(share: BalanceShare | null | undefined): string {
  if (share?.expired) return t('Your package expired');
  return share && !share.bought ? t('Buy your first package to build') : t('Nothing left on your account');
}

/** The pages a package is bought under, on the service's site (D-135). */
const LEGAL_PAGES: {path: string; label: string}[] = [
  {path: 'terms', label: N('Terms')},
  {path: 'privacy', label: N('Privacy')},
  {path: 'refunds', label: N('Refunds')},
];

/**
 * The small print beside a buy button (D-135): how long a package lasts, and the terms, privacy and refunds pages, each in
 * a tab of its own (the AI build's page, and Home Assistant's panel, stay as they are). The pages are on the service's
 * site; an older service that does not say its address gets the line alone.
 */
export function packageTermsHtml(offer: Offer | null): string {
  if (!offer) return '';
  const validity = `<span>${esc(t('Valid for 30 days after purchase; buying again extends it.'))}</span>`;
  const site = offer.site;
  let links = '';
  if (site) {
    const anchors = LEGAL_PAGES.map(
      page =>
        `<a class="aib-link" href="${esc(`${site}/${page.path}`)}" target="_blank" rel="noopener">${esc(t(page.label))}</a>`,
    );
    links = `<span class="aib-terms-links">${anchors.join(' · ')}</span>`;
  }
  return `<small class="aib-terms">${validity}${links}</small>`;
}

/** The day what is left expires, short, in the owner's language: "Dec 17"; with the year when it is not this year's. */
export function expiryDateText(expiresAt: string, now: Date = new Date()): string {
  const end = new Date(expiresAt);
  const thisYear = end.getFullYear() === now.getFullYear();
  const options: Intl.DateTimeFormatOptions = thisYear
    ? {day: 'numeric', month: 'short'}
    : {day: 'numeric', month: 'short', year: 'numeric'};
  return dateTime(end, options);
}

/** Until when what is left lasts: "until Dec 17"; '' with nothing left, or from a service that does not say. */
export function untilText(share: BalanceShare, now: Date = new Date()): string {
  if (share.empty || !share.expiresAt) return '';
  return t('until {0}', expiryDateText(share.expiresAt, now));
}

/** Whether the checkout takes test cards only (Dodo's test mode): its buttons say so. */
export const isTestCheckout = (offer: Offer | null): boolean =>
  offer?.payments === 'dodo' && offer.mode === 'test';

/** A buy or top-up button's inside, as markup: its label, and a small "test" mark while the checkout is in test mode. */
export function buyButtonInner(offer: Offer | null, options: {topUp?: boolean} = {}): string {
  const label = esc(buyLabel(offer, options));
  if (!isTestCheckout(offer)) return label;
  const title = esc(t('Test payments: no real money'));
  return `${label}<span class="aib-test-mark" title="${title}">${esc(t('test|payments'))}</span>`;
}

/**
 * The current package's shares as whole percents: a little used never reads as 0 % used, and a package not used up
 * never reads as 100 % (it would look like the build should wait).
 */
export function balancePercents(share: BalanceShare): {used: number; left: number} {
  const used = share.empty ? 100 : Math.min(99, Math.ceil(share.current.used * 100));
  return {used, left: 100 - used};
}

/** The full packages after the current one, short, beside its percent: "+1 package"; '' when there are none. */
export function morePackagesShort(share: BalanceShare): string {
  if (share.empty || share.packagesLeft <= 0) return '';
  return t('{0, plural, one {+# package} other {+# packages}}', share.packagesLeft);
}

/** The full packages after the current one, in words: "1 more package"; '' when there are none. */
export function morePackagesText(share: BalanceShare): string {
  if (share.empty || share.packagesLeft <= 0) return '';
  return t('{0, plural, one {# more package} other {# more packages}}', share.packagesLeft);
}

/** The bar of the current package's used share. */
function packageBar(usedPercent: number): string {
  return `<i class="aib-meter"><i style="width:${usedPercent}%"></i></i>`;
}

/**
 * The balance as a small bar of the current package, what is left of it beside it, and the full packages after it:
 * "30% left · +1 package"; '' when there is none.
 */
export function balanceMeter(share: BalanceShare | null | undefined): string {
  if (!share) return '';
  const {used, left} = balancePercents(share);
  const more = morePackagesShort(share);
  const moreTitle = morePackagesText(share);
  const until = untilText(share);
  const titleParts = [t('Package: {0}% used, {1}% left', used, left), moreTitle, until].filter(Boolean);
  const title = titleParts.join(' · ');
  const emptyClass = share.empty ? ' empty' : '';
  const moreHtml = more ? `<span class="aib-wallet-more">· ${esc(more)}</span>` : '';
  const untilHtml = until ? `<span class="aib-wallet-until">· ${esc(until)}</span>` : '';
  return `<span class="aib-wallet${emptyClass}" title="${esc(title)}">${icon('wallet', 14)}${packageBar(used)}<span>${esc(t('{0}% left', left))}</span>${moreHtml}${untilHtml}</span>`;
}

/**
 * The balance in the account's menu, a little fuller than the header's: which package, its bar and what is left of it,
 * and on a line of their own the full packages after it and until when it all lasts. The caller shows an empty balance in words instead.
 */
export function balanceDetail(share: BalanceShare): string {
  const {used, left} = balancePercents(share);
  const which = share.packages > 1 ? t('Current package') : t('Your package');
  const underBar = [morePackagesText(share), untilText(share)].filter(Boolean).join(' · ');
  const moreHtml = underBar ? `<small class="aib-balance-more">${esc(underBar)}</small>` : '';
  return `<div class="aib-balance-detail">
    <div class="aib-balance-row">${icon('wallet', 14)}<span>${esc(which)}</span><b>${esc(t('{0}% left', left))}</b></div>
    ${packageBar(used)}${moreHtml}</div>`;
}
