import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler, seal, unseal, LoginBridge } from '../src/worker.mjs';

const origin = 'https://publisher.example.test';
const blog = 'https://www.bamowl.com';
const proof = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const channel = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(proof))).toString('base64url');
const env = {
  GITHUB_OWNER: 'Bamtoliya', GITHUB_REPO: 'bamtoliya.github.io', WORKFLOW_FILE: 'pages-deploy.yml',
  DISPATCH_EVENT: 'RUN_WORKFLOW_DISPATCH', BLOG_URL: blog, WIDGET_ORIGINS: 'https://bamowl.com',
  GITHUB_CLIENT_ID: 'test-client-id', GITHUB_CLIENT_SECRET: 'test-client-secret',
  GITHUB_TOKEN: 'test-dispatch-token', SESSION_SECRET: 'test-only-secret-with-at-least-thirty-two-characters',
  REQUEST_LIMITER: { limit: async () => ({ success: true }) },
  PUBLISH_GATE: { idFromName: v => v, get: () => ({ fetch: async () => new Response(null, { status: 204 }) }) }
};

function binding() {
  const objects = new Map();
  return { objects, idFromName: v => v, get(id) {
    if (!objects.has(id)) {
      const storage = new Map(); let queue = Promise.resolve();
      const state = {
        storage: { get: async k => storage.get(k), put: async (k, v) => storage.set(k, v), setAlarm: async () => {}, deleteAll: async () => storage.clear() },
        blockConcurrencyWhile(fn) { const p = queue.then(fn); queue = p.catch(() => {}); return p; }
      };
      const object = new LoginBridge(state);
      objects.set(id, { storage, object });
    }
    return { fetch: (url, init) => objects.get(id).object.fetch(new Request(url, init)) };
  } };
}

function setup({ userId = 42, runs = [] } = {}) {
  const config = { ...env, LOGIN_BRIDGE: binding() }; const calls = [];
  const handler = createHandler({ fetchRemote: async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/access_token')) return Response.json({ access_token: 'test-login-token' });
    if (url.endsWith('/user')) return Response.json({ id: userId, login: 'Bamtoliya' });
    if (url.endsWith('/dispatches')) return new Response(null, { status: 204 });
    if (url.includes('/runs?')) return Response.json({ workflow_runs: runs });
    return Response.json({ owner: { id: 42, type: 'User' } });
  } });
  return { config, handler, calls };
}

function cookieFrom(response, name) {
  return response.headers.getSetCookie().find(c => c.startsWith(name + '='))?.split(';')[0];
}

function widget(path, token, widgetOrigin = blog, extra = {}) {
  return new Request(origin + '/api/embed/' + path, { method: 'POST', headers: { Origin: widgetOrigin, Authorization: 'Bearer ' + token, ...extra } });
}

async function loginCookie(exp = Date.now() + 60_000) {
  return '__Host-bamowl-session=' + await seal({ token: 'test-login-token', csrf: 'old-csrf', exp }, env.SESSION_SECRET, 'session');
}

async function cachedLogin(s) {
  const login = await loginCookie();
  const response = await s.handler.fetch(new Request(origin + '/auth/login?bridge=' + channel, { headers: { Cookie: login } }), s.config);
  const link = cookieFrom(response, '__Host-bamowl-link');
  return { response, cookie: login + '; ' + link, link: await unseal(link.split('=')[1], env.SESSION_SECRET, 'link') };
}

async function approve(s, connected, overrides = {}) {
  return s.handler.fetch(new Request(origin + '/api/link', { method: 'POST', headers: {
    Cookie: connected.cookie, Origin: origin, 'X-CSRF-Token': connected.link.csrf, ...overrides
  } }), s.config);
}

test('embed preflight allows only the fixed blog origin, without cookies', async () => {
  const s = setup();
  const response = await s.handler.fetch(new Request(origin + '/api/embed/publish', {
    method: 'OPTIONS', headers: { Origin: blog, 'Access-Control-Request-Method': 'POST' }
  }), s.config);
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), blog);
  assert.equal(response.headers.get('Access-Control-Allow-Credentials'), null);
  const denied = await s.handler.fetch(widget('publish', 'fake', 'https://attacker.example'), s.config);
  assert.equal(denied.status, 403); assert.equal(denied.headers.get('Access-Control-Allow-Origin'), null);
  assert.equal(s.calls.length, 0);
});

test('cookie sessions, forged tokens and expired embed sessions cannot authorize an iframe', async () => {
  const s = setup();
  const cookieToken = await seal({ token: 'test-login-token', exp: Date.now() + 60_000 }, env.SESSION_SECRET, 'session');
  const expired = await seal({ token: 'test-login-token', widgetOrigin: blog, exp: Date.now() - 1 }, env.SESSION_SECRET, 'embed-session');
  const elsewhere = await seal({ token: 'test-login-token', widgetOrigin: 'https://other.example', exp: Date.now() + 60_000 }, env.SESSION_SECRET, 'embed-session');
  for (const value of ['forged', cookieToken, expired, elsewhere]) {
    assert.equal((await s.handler.fetch(widget('publish', value), s.config)).status, 401);
  }
  assert.equal(s.calls.length, 0);
});

test('canonical apex redirects preserve pairing while unlisted origins stay denied', async () => {
  const s = setup(); const connected = await cachedLogin(s);
  await approve(s, connected);
  const preflight = await s.handler.fetch(new Request(origin + '/api/embed/claim', {
    method: 'OPTIONS', headers: { Origin: 'https://bamowl.com', 'Access-Control-Request-Method': 'POST' }
  }), s.config);
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), 'https://bamowl.com');
  // The handoff may have been created before the alias was allowed. It must
  // remain usable after changing only the CORS configuration.
  const claimed = await s.handler.fetch(widget('claim', proof, 'https://bamowl.com'), s.config);
  assert.equal(claimed.status, 200);
  const { session } = await claimed.json();
  assert.equal((await s.handler.fetch(widget('session', session, 'https://bamowl.com'), s.config)).status, 200);
  assert.equal((await s.handler.fetch(widget('publish', session, 'https://bamowl.com'), s.config)).status, 202);
  for (const forbidden of ['https://attacker.bamowl.com', 'http://bamowl.com', 'null']) {
    const response = await s.handler.fetch(widget('publish', session, forbidden), s.config);
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
  }
});

test('an existing owner login needs explicit popup confirmation before its session can be claimed', async () => {
  const s = setup(); const connected = await cachedLogin(s);
  assert.equal(connected.response.status, 303);
  assert.equal(connected.response.headers.get('Location'), '/auth/complete');
  assert.equal(s.config.LOGIN_BRIDGE.objects.size, 0);
  assert.ok(!s.calls.some(c => c.url.endsWith('/access_token')));
  assert.equal((await s.handler.fetch(widget('claim', proof), s.config)).status, 202);
  assert.equal((await approve(s, connected, { Origin: blog })).status, 403);
  assert.equal((await approve(s, connected, { 'X-CSRF-Token': 'wrong' })).status, 403);
  assert.equal((await s.handler.fetch(widget('claim', proof), s.config)).status, 202);
  const info = await s.handler.fetch(new Request(origin + '/api/link', { headers: { Cookie: connected.cookie } }), s.config);
  assert.equal((await info.json()).user.login, 'Bamtoliya');
  assert.equal((await approve(s, connected)).status, 200);
  // Knowing only the public popup channel is insufficient to claim the login.
  assert.equal((await s.handler.fetch(widget('claim', channel), s.config)).status, 202);
  const claim = await s.handler.fetch(widget('claim', proof), s.config);
  assert.equal(claim.status, 200);
  const payload = await claim.json();
  assert.equal(payload.user.login, 'Bamtoliya');
  assert.ok(!JSON.stringify(payload).includes('test-login-token'));
  assert.equal(await unseal(payload.session, env.SESSION_SECRET, 'session'), null);
  assert.equal((await unseal(payload.session, env.SESSION_SECRET, 'embed-session')).widgetOrigin, blog);
  assert.equal((await s.handler.fetch(widget('claim', proof), s.config)).status, 202);
  assert.equal((await approve(s, connected)).status, 409);
  assert.ok(!s.calls.some(c => c.url.endsWith('/dispatches')));
});

test('fresh popup OAuth records the channel in state and still requires explicit confirmation', async () => {
  const s = setup();
  const start = await s.handler.fetch(new Request(origin + '/auth/login?bridge=' + channel), s.config);
  const flowCookie = cookieFrom(start, '__Host-bamowl-oauth');
  const flow = await unseal(flowCookie.split('=')[1], env.SESSION_SECRET, 'oauth');
  assert.equal(flow.bridge, channel); assert.ok(flow.verifier);
  const response = await s.handler.fetch(new Request(origin + '/auth/callback?code=test-code&state=' + flow.state, { headers: { Cookie: flowCookie } }), s.config);
  assert.equal(response.status, 303); assert.equal(response.headers.get('Location'), '/auth/complete');
  assert.equal(s.config.LOGIN_BRIDGE.objects.size, 0);
  const link = cookieFrom(response, '__Host-bamowl-link');
  const connected = { cookie: cookieFrom(response, '__Host-bamowl-session') + '; ' + link, link: await unseal(link.split('=')[1], env.SESSION_SECRET, 'link') };
  assert.equal((await approve(s, connected)).status, 200);
  assert.equal((await s.handler.fetch(widget('claim', proof), s.config)).status, 200);
});

test('a wrong OAuth state cannot write an iframe login, even with a valid flow cookie', async () => {
  const s = setup();
  const start = await s.handler.fetch(new Request(origin + '/auth/login?bridge=' + channel), s.config);
  const response = await s.handler.fetch(new Request(origin + '/auth/callback?code=test-code&state=wrong', { headers: { Cookie: cookieFrom(start, '__Host-bamowl-oauth') } }), s.config);
  assert.equal(response.status, 303); assert.equal(s.config.LOGIN_BRIDGE.objects.size, 0);
  assert.equal(s.calls.length, 0);
});

test('a non-owner cannot pair their login or publish with an embed token', async () => {
  const s = setup({ userId: 99 });
  const login = await s.handler.fetch(new Request(origin + '/auth/login?bridge=' + channel, { headers: { Cookie: await loginCookie() } }), s.config);
  assert.equal(login.status, 303); assert.ok(login.headers.get('Location').includes('error='));
  const claimed = await s.handler.fetch(widget('claim', proof), s.config);
  assert.equal(claimed.status, 400); assert.equal((await claimed.json()).session, undefined);
  const capability = await seal({ token: 'test-login-token', widgetOrigin: blog, exp: Date.now() + 60_000 }, env.SESSION_SECRET, 'embed-session');
  assert.equal((await s.handler.fetch(widget('publish', capability), s.config)).status, 403);
  assert.ok(!s.calls.some(c => c.url.endsWith('/dispatches')));
});

test('the paired iframe can publish and query its exact run without cookie access', async () => {
  const s = setup(); const connected = await cachedLogin(s);
  await approve(s, connected);
  const { session } = await (await s.handler.fetch(widget('claim', proof), s.config)).json();
  const response = await s.handler.fetch(widget('publish', session), s.config);
  assert.equal(response.status, 202); assert.equal(response.headers.get('Access-Control-Allow-Origin'), blog);
  const { requestId } = await response.json();
  const dispatch = s.calls.find(c => c.url.endsWith('/dispatches'));
  assert.deepEqual(JSON.parse(dispatch.options.body), { event_type: env.DISPATCH_EVENT, client_payload: { publisher_request_id: requestId } });
  assert.equal(dispatch.options.headers.Authorization, 'Bearer ' + env.GITHUB_TOKEN);
  assert.equal((await s.handler.fetch(widget('session', session), s.config)).status, 200);
  assert.equal((await s.handler.fetch(widget('status?request=' + requestId, session), s.config)).status, 200);
});

test('the bridge is single-use under concurrency and expired tickets are not delivered', async () => {
  const b = binding(); const obj = b.get(channel);
  const complete = () => obj.fetch('https://bridge/complete', { method: 'POST', body: JSON.stringify({ session: 'encrypted-test-session', exp: Date.now() + 60_000 }) });
  assert.equal((await complete()).status, 204);
  const claims = await Promise.all(Array.from({ length: 4 }, () => obj.fetch('https://bridge/claim', { method: 'POST' }).then(r => r.json())));
  assert.equal(claims.filter(c => c.session).length, 1);
  assert.equal((await complete()).status, 409);
  const stored = b.objects.get(channel);
  stored.storage.set('ticket', { session: 'expired-session', exp: Date.now() - 1 });
  assert.deepEqual(await (await obj.fetch('https://bridge/claim', { method: 'POST' })).json(), { pending: true });
  await stored.object.alarm(); assert.equal(stored.storage.size, 0);
});
