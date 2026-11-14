// The AI build's account on screen (D-088): the sign-in, the account in the pages' headers (who is signed in, the balance,
// buying more, signing out), and the card of a build that waits for money or for the payments service. The calls to the
// service are in ai-account.ts.
//   The sign-in is a sheet over the AI build's page: Google and GitHub where the service offers them, else (and besides) a
//   6-digit code by email. A provider's sign-in leaves the page and comes back to the same address; the code keeps the page.
import {t, N} from '../i18n/i18n.ts';
import {el, esc, find} from './ui.ts';
import {holdFocus} from './keyboard.ts';
import {icon} from './icons.ts';
import {
  balanceMeter,
  buyButtonInner,
  emptyBalanceText,
  providerSignInUrl,
  refusalText,
  sendSignInCode,
  verifySignInCode,
} from './ai-account.ts';
import type {Account, Offer, Provider} from './ai-account.ts';

/** Why the sign-in is asked for now: its title says so. */
export type SignInReason = 'build' | 'see' | 'account';

/** What openSignIn is given. */
export interface SignInOptions {
  api: string;
  offer: Offer;
  reason: SignInReason;
  /** A line to show at once: a provider's sign-in that did not go through. */
  notice?: string | null;
  /** Where a provider's sign-in comes back to: a path on this site. */
  returnPath: () => string;
  /** Before the browser leaves for a provider: what would be lost is kept (the files chosen for a build). */
  beforeLeave?: () => Promise<void>;
  onSignedIn: (account: Account) => void;
  onClose?: () => void;
}

/** An open sign-in sheet. */
export interface SignInSheet {
  close(): void;
}

/** What the account part of a header shows: nothing where there are no accounts, else signed out or the account. */
export interface AccountView {
  /** null: no accounts here (local work) or not known yet. */
  offer: Offer | null;
  account: Account | null;
}

/** What the account part of a header does. */
export interface AccountBarOptions {
  /** The balance's bar beside the account (the progress page); the upload page has it beside its button. */
  meter: boolean;
  onSignIn: () => void;
  onBuy: () => void;
  onSignOut: () => void;
}

/** The account part of a header: an element to place, drawn again on each change. */
export interface AccountBar {
  element: HTMLElement;
  update(view: AccountView): void;
}

/** A code is this many digits. */
const CODE_DIGITS = 6;

const TITLES: Record<SignInReason, string> = {
  build: N('Sign in to build'),
  see: N('Sign in to see this build'),
  account: N('Sign in'),
};

const PROVIDER_NAMES: Record<Provider, string> = {google: 'Google', github: 'GitHub'};

// Google's own mark, in its colours, as its sign-in buttons are to show it.
const GOOGLE_MARK = `<svg class="ic" width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
</svg>`;

const providerMark = (provider: Provider): string =>
  provider === 'google' ? GOOGLE_MARK : icon('github', 16);

const isProviderWay = (way: string): way is Provider => way === 'google' || way === 'github';

/** The first letter of the account's email, for its round badge. */
const initialOf = (email: string): string => (email.trim()[0] || '?').toUpperCase();

/** The element an event is on: clicks and keys on the page land on elements. */
const targetOf = (e: Event): Element => e.target as Element;

/** The sign-in sheet over host (the AI build's page). */
export function openSignIn(host: HTMLElement, options: SignInOptions): SignInSheet {
  const {api, offer, reason, notice = null, returnPath, beforeLeave, onSignedIn, onClose} = options;
  const providers = offer.signIn.filter(isProviderWay);
  const providerButtons = providers
    .map(
      provider =>
        `<button type="button" class="aib-sign-way" data-provider="${provider}">${providerMark(provider)}<span>${esc(t('Continue with {0}', PROVIDER_NAMES[provider]))}</span></button>`,
    )
    .join('');
  const orLine = providers.length ? `<div class="aib-sign-or"><span>${esc(t('or'))}</span></div>` : '';
  const veil = el(`<div class="aib-veil">
    <section class="aib-sign" role="dialog" aria-modal="true" aria-labelledby="aib-sign-title">
      <header>
        <b id="aib-sign-title">${esc(t(TITLES[reason]))}</b>
        <button type="button" class="ib" data-act="close" title="${esc(t('Close'))}">${icon('x', 16)}</button>
      </header>
      <p class="aib-sign-lead">${esc(t('Your package stays with your account, on any device.'))}</p>
      ${providerButtons}
      ${orLine}
      <form class="aib-sign-row" data-step="email" novalidate>
        <input type="email" name="email" autocomplete="email" inputmode="email" placeholder="${esc(t('Your email'))}" aria-label="${esc(t('Your email'))}">
        <button class="primary" type="submit">${esc(t('Send code'))}</button>
      </form>
      <form class="aib-sign-row" data-step="code" novalidate hidden>
        <input type="text" name="code" autocomplete="one-time-code" inputmode="numeric" maxlength="${CODE_DIGITS}" placeholder="${'0'.repeat(CODE_DIGITS)}" aria-label="${esc(t('Code from the email'))}">
        <button class="primary" type="submit">${esc(t('Sign in'))}</button>
      </form>
      <small class="aib-sign-note"></small>
      <p class="aib-sign-links" hidden>
        <button type="button" class="aib-link" data-act="again">${esc(t('Send again'))}</button>
        <button type="button" class="aib-link" data-act="change">${esc(t('Change email'))}</button>
      </p>
      <small class="aib-sign-err" role="alert" hidden></small>
    </section>
  </div>`);
  host.append(veil);
  // the page under the sheet sleeps for the keyboard while it is open (keyboard.ts); its own Escape closes it (onKey)
  const held = holdFocus(veil);
  const emailForm = find<HTMLFormElement>(veil, '[data-step=email]');
  const codeForm = find<HTMLFormElement>(veil, '[data-step=code]');
  const emailInput = find<HTMLInputElement>(emailForm, 'input');
  const codeInput = find<HTMLInputElement>(codeForm, 'input');
  const note = find(veil, '.aib-sign-note');
  const links = find(veil, '.aib-sign-links');
  const errorLine = find(veil, '.aib-sign-err');
  let email = '';
  let busy = false;
  let closed = false;

  function showError(text: string | null): void {
    errorLine.hidden = !text;
    errorLine.textContent = text || '';
  }

  // The button of a form while its call is on the way: a spinner and a word, then back as it was.
  function setBusy(button: HTMLButtonElement, word: string | null): void {
    busy = !!word;
    if (word) {
      button.dataset.label = button.innerHTML;
      button.innerHTML = `<i class="spin"></i>${esc(word)}`;
    } else if (button.dataset.label) button.innerHTML = button.dataset.label;
    button.disabled = !!word;
  }

  // The providers are offered beside the email; once a code is on its way, only the code is asked for.
  function showProviders(on: boolean): void {
    for (const node of veil.querySelectorAll<HTMLElement>('.aib-sign-way, .aib-sign-or')) node.hidden = !on;
  }

  function showEmailStep(): void {
    showProviders(true);
    emailForm.hidden = false;
    codeForm.hidden = true;
    links.hidden = true;
    note.textContent = t('No password: we email you a code.');
    emailInput.focus();
  }

  function showCodeStep(): void {
    showProviders(false);
    emailForm.hidden = true;
    codeForm.hidden = false;
    links.hidden = false;
    codeInput.value = '';
    note.textContent = t('Sent to {0}. Not there? Check spam.', email);
    codeInput.focus();
  }

  async function sendCode(button: HTMLButtonElement): Promise<void> {
    const given = emailInput.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(given)) {
      showError(t('Check the email address'));
      emailInput.focus();
      return;
    }
    email = given;
    showError(null);
    setBusy(button, t('Sending…'));
    try {
      await sendSignInCode(api, email);
      setBusy(button, null);
      showCodeStep();
    } catch (error) {
      setBusy(button, null);
      showError(refusalText(error));
    }
  }

  async function checkCode(): Promise<void> {
    const code = codeInput.value.replace(/\D/g, '');
    if (code.length !== CODE_DIGITS || busy) return;
    const button = find<HTMLButtonElement>(codeForm, 'button');
    showError(null);
    setBusy(button, t('Signing in…'));
    try {
      const account = await verifySignInCode(api, email, code);
      close();
      onSignedIn(account);
    } catch (error) {
      setBusy(button, null);
      showError(refusalText(error));
      codeInput.select();
    }
  }

  async function goToProvider(button: HTMLButtonElement, provider: Provider): Promise<void> {
    if (busy) return;
    setBusy(button, t('Opening…'));
    // What would be lost when the page leaves is kept first; a failure there only loses the files, not the sign-in.
    try {
      await beforeLeave?.();
    } catch {}
    location.assign(providerSignInUrl(api, provider, returnPath()));
  }

  function close(): void {
    if (closed) return;
    closed = true;
    removeEventListener('keydown', onKey, true);
    held.release();
    veil.remove();
  }

  function cancel(): void {
    close();
    onClose?.();
  }

  // Esc closes the sheet; the keys typed into it stay out of the pages under it.
  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.stopPropagation();
      cancel();
    }
  }

  emailForm.onsubmit = e => {
    e.preventDefault();
    if (!busy) sendCode(find<HTMLButtonElement>(emailForm, 'button'));
  };
  codeForm.onsubmit = e => {
    e.preventDefault();
    checkCode();
  };
  // The code is checked as soon as it is whole: no button to find on a phone.
  codeInput.oninput = () => {
    const digits = codeInput.value.replace(/\D/g, '').slice(0, CODE_DIGITS);
    if (digits !== codeInput.value) codeInput.value = digits;
    if (digits.length === CODE_DIGITS) checkCode();
  };
  veil.addEventListener('click', e => {
    const target = targetOf(e);
    if (target === veil) return cancel();
    const action = target.closest<HTMLElement>('[data-act]')?.dataset.act;
    const providerButton = target.closest<HTMLButtonElement>('[data-provider]');
    if (action === 'close') cancel();
    else if (action === 'change') showEmailStep();
    else if (action === 'again') sendCode(find<HTMLButtonElement>(emailForm, 'button'));
    else if (providerButton) goToProvider(providerButton, providerButton.dataset.provider as Provider);
  });
  addEventListener('keydown', onKey, true);
  showEmailStep();
  showError(notice);
  return {close};
}

/** The account in a header: "Sign in" while signed out; signed in, its badge (and the balance's bar) with a menu. */
export function accountBar(options: AccountBarOptions): AccountBar {
  const {meter, onSignIn, onBuy, onSignOut} = options;
  const element = el(`<span class="aib-account"></span>`);
  let view: AccountView = {offer: null, account: null};
  let menu: HTMLElement | null = null;

  function closeMenu(): void {
    menu?.remove();
    menu = null;
    removeEventListener('pointerdown', onOutside, true);
    removeEventListener('keydown', onEscape, true);
  }

  function onOutside(e: PointerEvent): void {
    if (!element.contains(targetOf(e))) closeMenu();
  }

  function onEscape(e: KeyboardEvent): void {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    closeMenu();
  }

  function openMenu(account: Account): void {
    // Nothing left reads in words: a full red bar says little, and a new account has used nothing.
    const balance = account.balance.empty
      ? `<span class="aib-wallet">${icon('wallet', 14)}<span>${esc(emptyBalanceText(account.balance))}</span></span>`
      : balanceMeter(account.balance);
    const buyInner = buyButtonInner(view.offer, {topUp: account.balance.bought});
    menu = el(`<div class="aib-account-menu menu glass" role="menu">
      <div class="aib-account-who"><span class="aib-avatar">${esc(initialOf(account.email))}</span><b>${esc(account.email)}</b></div>
      <hr>
      <div class="aib-account-balance">${balance}</div>
      <button data-act="buy">${icon('wallet', 16)}<span>${buyInner}</span></button>
      <hr>
      <button data-act="sign-out">${icon('logOut', 16)}<span>${esc(t('Sign out'))}</span></button>
    </div>`);
    element.append(menu);
    addEventListener('pointerdown', onOutside, true);
    addEventListener('keydown', onEscape, true);
  }

  function draw(): void {
    closeMenu();
    const {offer, account} = view;
    if (!offer) {
      element.innerHTML = '';
      return;
    }
    if (!account) {
      element.innerHTML = `<button class="soft aib-sign-in" data-act="sign-in">${icon('user', 15)}<span>${esc(t('Sign in'))}</span></button>`;
      return;
    }
    const bar = meter ? balanceMeter(account.balance) : '';
    element.innerHTML = `${bar}<button class="aib-avatar" data-act="account" title="${esc(account.email)}" aria-haspopup="menu">${esc(initialOf(account.email))}</button>`;
  }

  element.addEventListener('click', e => {
    const action = targetOf(e).closest<HTMLElement>('[data-act]')?.dataset.act;
    if (action === 'sign-in') onSignIn();
    else if (action === 'account' && menu) closeMenu();
    else if (action === 'account' && view.account) openMenu(view.account);
    else if (action === 'buy') {
      closeMenu();
      onBuy();
    } else if (action === 'sign-out') {
      closeMenu();
      onSignOut();
    }
  });

  return {
    element,
    update(next: AccountView): void {
      view = next;
      draw();
    },
  };
}

/** What the card of a waiting build says and offers. */
export interface PausedCardOptions {
  offer: Offer | null;
  /** Why the last top-up did not go through, in words; said instead of the usual line. */
  line?: string | null;
}

/**
 * The card of a build that waits (BuildStatus.paused): the balance is used up — a top-up lets it go on from where it
 * stopped; or the payments service does not answer — it goes on by itself. {key: '', html: ''} when it does not wait.
 * The key changes only when the card does (it is drawn again only then).
 */
export function pausedCard(
  paused: 'balance' | 'payments' | null | undefined,
  {offer, line = null}: PausedCardOptions,
): {key: string; html: string} {
  if (paused === 'payments') {
    return {
      key: 'paused:payments',
      html: `<div class="aib-card">
        <span class="aib-card-ic">${icon('clock', 20)}</span>
        <span class="aib-card-text"><b>${esc(t('Payments are not answering'))}</b><small>${esc(t('The build waits and goes on by itself. Nothing is lost.'))}</small></span></div>`,
    };
  }
  if (paused !== 'balance') return {key: '', html: ''};
  const why = line || t('The build waits. Top up and it goes on from where it stopped.');
  const buttonInner = buyButtonInner(offer, {topUp: true});
  return {
    key: `paused:balance:${why}:${buttonInner}`,
    html: `<div class="aib-card asking">
      <span class="aib-card-ic">${icon('wallet', 20)}</span>
      <span class="aib-card-text"><b>${esc(t('The package is used up'))}</b><small>${esc(why)}</small></span>
      <button class="primary" data-act="top-up">${buttonInner}</button></div>`,
  };
}
