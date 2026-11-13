// The AI build's account (ai-account.ts, ai-account-ui.ts): the service's answers checked, the calls it gets, what the
// address brings back, the balance in percent (never money), and the card of a build that waits.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  AccountError,
  accountFrom,
  accountOffer,
  balanceMeter,
  balancePercents,
  buyLabel,
  checkoutUrl,
  claimPayment,
  currentAccount,
  isSignedOut,
  offerFrom,
  pathOf,
  priceText,
  providerSignInUrl,
  readReturn,
  refusalText,
  sendSignInCode,
  verifySignInCode,
} from './ai-account.ts';
import type {Offer} from './ai-account.ts';
import {pausedCard} from './ai-account-ui.ts';

const PAID: Offer = {
  payments: 'dodo',
  mode: 'test',
  price: {amount: 20, currency: 'USD'},
  signIn: ['email', 'google'],
};
const FREE: Offer = {payments: 'free', mode: null, price: null, signIn: ['email']};

/** A request the fake service got: its address, method, headers and body. */
interface SeenRequest {
  url: string;
  method: string;
  contentType: string | null;
  body: unknown;
}

/** fetch answering with status and data for the test's run; the requests it got are listed in seen. */
async function withService(
  status: number,
  data: unknown,
  run: (seen: SeenRequest[]) => Promise<void>,
): Promise<void> {
  const realFetch = globalThis.fetch;
  const seen: SeenRequest[] = [];
  globalThis.fetch = async (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    const headers = new Headers(init.headers);
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : null;
    seen.push({
      url: String(input),
      method: init.method || 'GET',
      contentType: headers.get('content-type'),
      body,
    });
    return new Response(JSON.stringify(data), {status, headers: {'content-type': 'application/json'}});
  };
  try {
    await run(seen);
  } finally {
    globalThis.fetch = realFetch;
  }
}

test('a little used is at least 1 %; not used up is at most 99 %', () => {
  assert.deepEqual(balancePercents({used: 0, left: 1, empty: false}), {used: 0, left: 100});
  assert.deepEqual(balancePercents({used: 0.001, left: 0.999, empty: false}), {used: 1, left: 99});
  assert.deepEqual(balancePercents({used: 0.36, left: 0.64, empty: false}), {used: 36, left: 64});
  assert.deepEqual(balancePercents({used: 0.998, left: 0.002, empty: false}), {used: 99, left: 1});
  assert.deepEqual(balancePercents({used: 1, left: 0, empty: true}), {used: 100, left: 0});
});

test('the meter fills with what is used and says what is left; nothing without an account', () => {
  const html = balanceMeter({used: 0.36, left: 0.64, empty: false});
  assert.match(html, /width:36%/);
  assert.match(html, /64% left/);
  assert.match(html, /Package: 36% used, 64% left/);
  assert.doesNotMatch(html, /\$/);
  assert.match(balanceMeter({used: 1, left: 0, empty: true}), /aib-wallet empty/);
  assert.equal(balanceMeter(null), '');
});

test('a price reads in the language: whole amounts without cents; the button says what it gets', () => {
  assert.equal(priceText({amount: 20, currency: 'USD'}), '$20');
  assert.equal(priceText({amount: 19.5, currency: 'USD'}), '$19.50');
  assert.equal(priceText(null), '');
  assert.equal(buyLabel(PAID), 'Buy a package · $20');
  assert.equal(buyLabel(PAID, {topUp: true}), 'Top up · $20');
  assert.equal(buyLabel(FREE), 'Top up');
  assert.equal(buyLabel(null), 'Top up');
});

test('the offer is checked: email is always a way in, unknown ways and modes are dropped', () => {
  const offer = offerFrom({
    payments: 'dodo',
    mode: 'test',
    price: {amount: 20, currency: 'USD'},
    signIn: ['google', 'facebook', 'github'],
  });
  assert.deepEqual(offer, {...PAID, signIn: ['email', 'google', 'github']});
  assert.deepEqual(offerFrom({payments: 'free', mode: 'sandbox', price: 'free'}), FREE);
  assert.throws(() => offerFrom({payments: 'paypal'}), AccountError);
  assert.throws(() => offerFrom(null), AccountError);
});

test('the account is checked: shares stay between 0 and 1, a missing balance is nothing left', () => {
  const account = accountFrom({
    email: 'someone@example.com',
    providers: ['github', 'myspace'],
    balance: {used: 1.2, left: -0.2, empty: true},
  });
  assert.deepEqual(account, {
    email: 'someone@example.com',
    providers: ['github'],
    balance: {used: 1, left: 0, empty: true},
  });
  assert.deepEqual(accountFrom({email: 'a@example.com'}).balance, {used: 1, left: 0, empty: true});
  assert.throws(() => accountFrom({balance: {}}), AccountError);
});

test('no payments service here: no accounts; signed out: no account', async () => {
  await withService(404, {error: 'no payments service here'}, async () => {
    assert.equal(await accountOffer(), null);
  });
  await withService(401, {error: 'SIGNED_OUT'}, async () => {
    assert.equal(await currentAccount(), null);
  });
  await withService(
    200,
    {email: 'a@example.com', providers: [], balance: {used: 0.5, left: 0.5, empty: false}},
    async seen => {
      const account = await currentAccount('/base');
      assert.equal(account?.balance.left, 0.5);
      assert.equal(seen[0].url, '/base/pay/me');
    },
  );
  await withService(500, {error: 'SERVER'}, async () => {
    await assert.rejects(
      currentAccount(),
      (error: unknown) => error instanceof AccountError && error.status === 500,
    );
  });
});

test('every call that changes something is JSON, as the service asks', async () => {
  await withService(200, {ok: true, minutes: 10}, async seen => {
    await sendSignInCode('', 'someone@example.com');
    assert.deepEqual(seen[0], {
      url: '/pay/auth/email/start',
      method: 'POST',
      contentType: 'application/json',
      body: {email: 'someone@example.com', lang: 'en'},
    });
  });
  await withService(200, {url: 'https://checkout.example/session/1'}, async seen => {
    assert.equal(await checkoutUrl('', '/?ai=new'), 'https://checkout.example/session/1');
    assert.deepEqual(seen[0].body, {return: '/?ai=new', lang: 'en'});
    assert.equal(seen[0].contentType, 'application/json');
  });
  await withService(
    200,
    {email: 'a@example.com', providers: [], balance: {used: 0, left: 1, empty: false}},
    async seen => {
      await claimPayment('', 'pay/../x');
      assert.equal(seen[0].url, '/pay/payments/pay%2F..%2Fx/claim');
      assert.equal(seen[0].method, 'POST');
    },
  );
});

test('a wrong code is refused by its code, said in words', async () => {
  await withService(400, {error: 'CODE_WRONG'}, async () => {
    await assert.rejects(verifySignInCode('', 'a@example.com', '123456'), (error: unknown) => {
      assert.equal(refusalText(error), 'Wrong code. Check it and try again.');
      return error instanceof AccountError && error.code === 'CODE_WRONG';
    });
  });
  assert.equal(refusalText(new AccountError('CODE_EXPIRED', 400)), 'The code has expired. Send a new one.');
  assert.equal(refusalText(new TypeError('Failed to fetch')), 'No connection. Try again.');
  assert.equal(
    refusalText(new AccountError('SERVER', 500)),
    'The service is not answering. Try again in a minute.',
  );
  assert.ok(isSignedOut(new AccountError('SIGNED_OUT', 401)));
  assert.ok(!isSignedOut(new AccountError('BALANCE_EMPTY', 402)));
});

test('a provider sign-in comes back to the same page', () => {
  const back = pathOf('http://localhost:8791/?build=home-1#/example/family');
  assert.equal(back, '/?build=home-1#/example/family');
  assert.equal(
    providerSignInUrl('', 'google', back),
    '/pay/auth/google/start?return=%2F%3Fbuild%3Dhome-1%23%2Fexample%2Ffamily',
  );
});

test('the address brings back a payment or a failed sign-in, and is cleaned of it', () => {
  const paid = readReturn('http://site/?ai=new&paid=1&payment_id=pay_123&status=succeeded#/plan');
  assert.deepEqual(paid, {
    payment: 'pay_123',
    paymentStatus: 'succeeded',
    signIn: null,
    clean: 'http://site/?ai=new#/plan',
    found: true,
  });
  const failed = readReturn('http://site/?build=home-1&signin=failed');
  assert.equal(failed.signIn, 'failed');
  assert.equal(failed.payment, null);
  assert.equal(failed.clean, 'http://site/?build=home-1');
  const nothing = readReturn('http://site/?build=home-1');
  assert.equal(nothing.found, false);
  assert.equal(nothing.clean, 'http://site/?build=home-1');
});

test('a build waiting for money offers the top-up; one waiting for the service goes on by itself', () => {
  const balance = pausedCard('balance', {offer: PAID});
  assert.match(balance.html, /The package is used up/);
  assert.match(balance.html, /data-act="top-up">Top up · \$20</);
  assert.match(pausedCard('balance', {offer: FREE}).html, /data-act="top-up">Top up</);
  const failedTopUp = pausedCard('balance', {offer: PAID, line: 'Could not open the payment: SERVER'});
  assert.match(failedTopUp.html, /Could not open the payment: SERVER/);
  assert.notEqual(failedTopUp.key, balance.key);
  const payments = pausedCard('payments', {offer: PAID});
  assert.match(payments.html, /Payments are not answering/);
  assert.match(payments.html, /goes on by itself/);
  assert.doesNotMatch(payments.html, /data-act/);
  assert.deepEqual(pausedCard(null, {offer: PAID}), {key: '', html: ''});
});
