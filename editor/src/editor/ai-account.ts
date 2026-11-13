// The AI build's account (D-088): who is signed in, what is left of what they bought (shares only, D-085), and buying
// more (D-086). The money is not in this browser: the payments service keeps the account and its balance, and its session
// cookie (HttpOnly, set by the service) says who this browser is. Clearing the browser only signs out; signing in again
// brings the balance back. The service is reached at the AI build's own address (/pay/…), so the cookie is first-party:
//   GET  <api>/pay/offer                     {payments, mode, price, signIn}: how a package comes, its price, the sign-in ways
//   POST <api>/pay/auth/email/start          {email, lang} → {minutes}: a 6-digit code goes to the email
//   POST <api>/pay/auth/email/verify         {email, code} → the account; the service sets the session cookie
//   GET  <api>/pay/auth/<google|github>/start?return=<path>   the provider's sign-in, then back to <path>
//                                            (a failed one comes back with ?signin=failed, a cancelled one ?signin=cancelled)
//   GET  <api>/pay/me                        the account {email, providers, balance}; 401 SIGNED_OUT
//   POST <api>/pay/auth/sign-out
//   POST <api>/pay/checkout                  {return, lang} → {url}: the provider's checkout for one package; it comes back to
//                                            <return>?paid=1&payment_id=…&status=…
//   POST <api>/pay/payments/<id>/claim       the payment checked with the provider and counted once → the account
//   POST <api>/pay/test/top-up               a free test package, only where the service takes no payments
// Public POSTs are JSON (the service refuses anything else). A refusal says why in {error}: a code such as SIGNED_OUT.
// Where the AI build runs without the service (local work), /pay/offer answers 404: there are no accounts, builds are free.
import {t, getLang} from '../i18n/i18n.ts';
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
}

/** What is left on the account: shares from 0 to 1 of all that was bought, and whether nothing is left. */
export interface BalanceShare {
  used: number;
  left: number;
  empty: boolean;
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
  return {payments: data.payments, mode, price: priceFrom(data.price), signIn};
}

/** The balance's shares in the service's answer; a missing balance reads as nothing left. */
export function balanceFrom(value: unknown): BalanceShare {
  if (!isFields(value)) return {used: 1, left: 0, empty: true};
  return {used: shareOf(value.used), left: shareOf(value.left), empty: value.empty === true};
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
  /** A provider's sign-in that did not go through. */
  signIn: 'failed' | 'cancelled' | null;
  /** The address without what was read: put back in its place so a reload does not read it again. */
  clean: string;
  /** Whether anything was read (the address is to be replaced). */
  found: boolean;
}

// What the checkout and the sign-in add to the address on their way back.
const RETURN_PARAMS = ['payment_id', 'status', 'paid', 'email', 'license_key', 'signin'];

/** What the address brings back (see AddressReturn); href is the page's address. */
export function readReturn(href: string): AddressReturn {
  const url = new URL(href);
  const params = url.searchParams;
  const signInParam = params.get('signin');
  const signIn = signInParam === 'failed' || signInParam === 'cancelled' ? signInParam : null;
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
  if (error.code === 'PAYMENT_FAILED') return t('The payment did not go through');
  if (error.status >= 500 || error.status === 0)
    return t('The service is not answering. Try again in a minute.');
  return error.code;
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
 * The button that gets one more package: with its price where it is bought ("Top up" once the account is known to have had
 * one: usedUp, or something left), a free top-up where packages are given for testing.
 */
export function buyLabel(offer: Offer | null, {topUp = false}: {topUp?: boolean} = {}): string {
  if (offer?.payments !== 'dodo') return t('Top up');
  const price = priceText(offer.price);
  return topUp ? t('Top up · {0}', price) : t('Buy a package · {0}', price);
}

/**
 * The shares as whole percents: a little used never reads as 0 % used, and a balance not used up never reads as 100 %
 * (it would look like the build should wait).
 */
export function balancePercents(share: BalanceShare): {used: number; left: number} {
  const used = share.empty ? 100 : Math.min(99, Math.ceil(share.used * 100));
  return {used, left: 100 - used};
}

/** The balance as a small bar of what is used, with what is left beside it; '' when there is none. */
export function balanceMeter(share: BalanceShare | null | undefined): string {
  if (!share) return '';
  const {used, left} = balancePercents(share);
  const title = t('Package: {0}% used, {1}% left', used, left);
  const emptyClass = share.empty ? ' empty' : '';
  return `<span class="aib-wallet${emptyClass}" title="${esc(title)}">${icon('wallet', 14)}
    <i class="aib-meter"><i style="width:${used}%"></i></i><span>${esc(t('{0}% left', left))}</span></span>`;
}
