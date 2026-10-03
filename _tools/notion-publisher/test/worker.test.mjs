import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler, seal, unseal } from '../src/worker.mjs';
import { PublishGate } from '../src/gate.mjs';

const origin = 'https://publisher.example.test';
const csrf = 'test-csrf';
const env = {
  GITHUB_OWNER: 'Bamtoliya', GITHUB_REPO: 'bamtoliya.github.io', WORKFLOW_FILE: 'pages-deploy.yml',
  DISPATCH_EVENT: 'RUN_WORKFLOW_DISPATCH', BLOG_URL: 'https://www.bamowl.com',
  GITHUB_CLIENT_ID: 'test-client-id', GITHUB_CLIENT_SECRET: 'test-client-secret',
  GITHUB_TOKEN: 'test-dispatch-token', SESSION_SECRET: 'test-only-secret-with-at-least-thirty-two-characters',
  REQUEST_LIMITER: { limit: async () => ({ success: true }) },
  LOGIN_BRIDGE: {},
  PUBLISH_GATE: { idFromName: value => value, get: () => ({ fetch: async () => new Response(null, { status: 204 }) }) }
};
const uuid = 'f353887c-10dc-46f2-9775-53cf392a1b16';

async function request(path, { authenticated = true, method = 'GET', originHeader = origin, csrfHeader = csrf, cookieValue } = {}) {
  const headers = { 'CF-Connecting-IP': '192.0.2.1' };
  if (authenticated) headers.Cookie = `__Host-bamowl-session=${cookieValue || await seal({ token: 'test-login-token', csrf, exp: Date.now() + 60_000 }, env.SESSION_SECRET, 'session')}`;
  if (method === 'POST') { headers.Origin = originHeader; headers['X-CSRF-Token'] = csrfHeader; }
  return new Request(origin + path, { method, headers });
}

function stub({ userId = 42, repoOwnerId = 42, repoType = 'User', runs = [], dispatchStatus = 204, fail = false } = {}) {
  const calls = [];
  const handler = createHandler({ fetchRemote: async (input, options) => {
    calls.push({ url: input, options });
    if (fail) throw Error('private upstream error: test-token');
    const url = new URL(input);
    if (url.pathname === '/user') return Response.json({ id: userId, login: 'Bamtoliya' });
    if (url.pathname.endsWith('/dispatches')) return dispatchStatus === 204 ? new Response(null, { status: 204 }) : Response.json({ message: env.GITHUB_TOKEN }, { status: dispatchStatus });
    if (url.pathname.endsWith('/runs')) return Response.json({ workflow_runs: runs });
    if (url.pathname.endsWith('/access_token')) return Response.json({ access_token: 'test-login-token' });
    return Response.json({ owner: { id: repoOwnerId, type: repoType } });
  } });
  return { handler, calls };
}

test('public HTML has no secrets and blocks embedding the authenticated console', async () => {
  const { handler, calls } = stub();
  const response = await handler.fetch(await request('/', { authenticated: false }), env);
  assert.equal(response.status, 200);
  const body = await response.text();
  for (const secret of [env.GITHUB_TOKEN, env.GITHUB_CLIENT_SECRET, env.SESSION_SECRET]) assert.ok(!body.includes(secret));
  assert.equal(response.headers.get('X-Frame-Options'), 'DENY');
  assert.equal(calls.length, 0);
});

test('missing configuration fails closed before contacting GitHub', async () => {
  const { handler, calls } = stub();
  const response = await handler.fetch(await request('/api/publish', { method: 'POST' }), { ...env, SESSION_SECRET: '' });
  assert.equal(response.status, 503); assert.equal(calls.length, 0);
});

test('anonymous, modified and expired cookies cannot publish', async () => {
  const { handler, calls } = stub();
  const expired = await seal({ token: 'test-login-token', csrf, exp: Date.now() - 1 }, env.SESSION_SECRET, 'session');
  for (const options of [{ authenticated: false }, { cookieValue: 'forged-cookie' }, { cookieValue: expired }]) {
    const response = await handler.fetch(await request('/api/publish', { ...options, method: 'POST' }), env);
    assert.equal(response.status, 401);
  }
  assert.equal(calls.length, 0);
});

test('owner identity uses numeric ID, rejecting matching names with a different ID', async () => {
  const { handler, calls } = stub({ userId: 77 });
  const response = await handler.fetch(await request('/api/publish', { method: 'POST' }), env);
  assert.equal(response.status, 403); assert.ok(!calls.some(c => c.url.endsWith('/dispatches')));
});

test('organization repositories are denied instead of treating members as owners', async () => {
  const { handler } = stub({ repoType: 'Organization' });
  assert.equal((await handler.fetch(await request('/api/publish', { method: 'POST' }), env)).status, 403);
});

test('cross-origin POST, missing CSRF token and GET publish cannot execute', async () => {
  const { handler, calls } = stub();
  for (const options of [{ originHeader: 'https://attacker.example' }, { csrfHeader: '' }]) {
    assert.equal((await handler.fetch(await request('/api/publish', { method: 'POST', ...options }), env)).status, 403);
  }
  assert.equal((await handler.fetch(await request('/api/publish'), env)).status, 405);
  assert.equal(calls.length, 0);
});

test('rate limit denies the request before session and GitHub work', async () => {
  const { handler, calls } = stub();
  const response = await handler.fetch(await request('/api/publish', { method: 'POST' }), { ...env, REQUEST_LIMITER: { limit: async () => ({ success: false }) } });
  assert.equal(response.status, 429); assert.equal(response.headers.get('Retry-After'), '60'); assert.equal(calls.length, 0);
});

test('OAuth uses PKCE and empty repository scopes; flow cookie cannot become a session', async () => {
  const { handler } = stub();
  const response = await handler.fetch(await request('/auth/login', { authenticated: false }), env);
  assert.equal(response.status, 302);
  const location = new URL(response.headers.get('Location'));
  assert.equal(location.origin, 'https://github.com');
  assert.equal(location.searchParams.get('scope'), '');
  assert.equal(location.searchParams.get('code_challenge_method'), 'S256');
  const flowCookie = response.headers.getSetCookie().find(c => c.startsWith('__Host-bamowl-oauth=')).split(';')[0].split('=')[1];
  const flow = await unseal(flowCookie, env.SESSION_SECRET, 'oauth');
  assert.ok(flow.verifier); assert.equal(flow.state, location.searchParams.get('state'));
  assert.equal(await unseal(flowCookie, env.SESSION_SECRET, 'session'), null);
  assert.ok(response.headers.getSetCookie().some(c => c.startsWith('__Host-bamowl-session=;')));
});

test('OAuth callback rejects an incorrect state without exchanging the code', async () => {
  const { handler, calls } = stub();
  const flow = await seal({ state: 'expected-state', verifier: 'verifier', exp: Date.now() + 60_000 }, env.SESSION_SECRET, 'oauth');
  const response = await handler.fetch(new Request(origin + '/auth/callback?code=test-code&state=wrong-state', { headers: { Cookie: '__Host-bamowl-oauth=' + flow } }), env);
  assert.equal(response.status, 303); assert.ok(new URL(response.headers.get('Location')).searchParams.get('error'));
  assert.equal(calls.length, 0);
});

test('owner OAuth callback creates an encrypted HttpOnly session without publishing', async () => {
  const { handler, calls } = stub();
  const flow = await seal({ state: 'expected-state', verifier: 'verifier', exp: Date.now() + 60_000 }, env.SESSION_SECRET, 'oauth');
  const response = await handler.fetch(new Request(origin + '/auth/callback?code=test-code&state=expected-state', { headers: { Cookie: '__Host-bamowl-oauth=' + flow } }), env);
  assert.equal(response.status, 303); assert.equal(response.headers.get('Location'), '/');
  const value = response.headers.getSetCookie().find(c => c.startsWith('__Host-bamowl-session='));
  assert.match(value, /HttpOnly; Secure; SameSite=Lax/); assert.ok(!value.includes('test-login-token'));
  const session = await unseal(value.split(';')[0].split('=')[1], env.SESSION_SECRET, 'session');
  assert.equal(session.token, 'test-login-token'); assert.ok(session.csrf);
  assert.ok(!calls.some(c => c.url.endsWith('/dispatches')));
  assert.equal(JSON.parse(calls.find(c => c.url.endsWith('/access_token')).options.body).code_verifier, 'verifier');
});

test('non-owner OAuth callback cannot create a session', async () => {
  const { handler } = stub({ userId: 77 });
  const flow = await seal({ state: 'state', verifier: 'verifier', exp: Date.now() + 60_000 }, env.SESSION_SECRET, 'oauth');
  const response = await handler.fetch(new Request(origin + '/auth/callback?code=test-code&state=state', { headers: { Cookie: '__Host-bamowl-oauth=' + flow } }), env);
  assert.ok(new URL(response.headers.get('Location')).searchParams.get('error').includes('소유자'));
  assert.ok(!response.headers.getSetCookie().some(c => c.startsWith('__Host-bamowl-session=')));
});

test('verified owner dispatches the fixed repository and event with a unique request ID', async () => {
  const { handler, calls } = stub();
  const response = await handler.fetch(await request('/api/publish', { method: 'POST' }), env);
  assert.equal(response.status, 202);
  const data = await response.json();
  const dispatch = calls.find(c => c.url.endsWith('/dispatches'));
  assert.equal(dispatch.url, 'https://api.github.com/repos/Bamtoliya/bamtoliya.github.io/dispatches');
  assert.equal(dispatch.options.headers.Authorization, 'Bearer ' + env.GITHUB_TOKEN);
  assert.deepEqual(JSON.parse(dispatch.options.body), { event_type: env.DISPATCH_EVENT, client_payload: { publisher_request_id: data.requestId } });
});

test('active workflow and gate contention prevent another dispatch', async () => {
  const { handler, calls } = stub({ runs: [{ id: 123, status: 'in_progress' }] });
  assert.equal((await handler.fetch(await request('/api/publish', { method: 'POST' }), env)).status, 409);
  assert.ok(!calls.some(c => c.url.endsWith('/dispatches')));
  const blocked = { ...env, PUBLISH_GATE: { idFromName: value => value, get: () => ({ fetch: async () => new Response(null, { status: 409 }) }) } };
  assert.equal((await handler.fetch(await request('/api/publish', { method: 'POST' }), blocked)).status, 409);
});

test('status selects the exact request instead of an unrelated successful run', async () => {
  const { handler } = stub({ runs: [
    { id: 1, display_title: 'Build and Deploy', status: 'completed', conclusion: 'success' },
    { id: 2, display_title: 'BamOwl publish ' + uuid, status: 'completed', conclusion: 'failure' }
  ] });
  const data = await (await handler.fetch(await request('/api/status?request=' + uuid), env)).json();
  assert.equal(data.run.id, 2); assert.equal(data.run.conclusion, 'failure');
});

test('GitHub errors never expose upstream bodies or tokens', async () => {
  for (const options of [{ dispatchStatus: 403 }, { fail: true }]) {
    const { handler } = stub(options);
    const response = await handler.fetch(await request('/api/publish', { method: 'POST' }), env);
    assert.equal(response.status, 502);
    const body = await response.text(); assert.ok(!body.includes(env.GITHUB_TOKEN)); assert.ok(!body.includes('private upstream'));
  }
});

test('durable gate accepts only one concurrent acquisition and persists the cooldown', async () => {
  const storage = new Map(); let queue = Promise.resolve();
  const state = { storage: { get: async k => storage.get(k), put: async (k, v) => storage.set(k, v) }, blockConcurrencyWhile(callback) { const promise = queue.then(callback); queue = promise.catch(() => {}); return promise; } };
  const gate = new PublishGate(state);
  const results = await Promise.all(Array.from({ length: 5 }, () => gate.fetch(new Request('https://gate/acquire', { method: 'POST' }))));
  assert.equal(results.filter(r => r.status === 204).length, 1);
  assert.equal(results.filter(r => r.status === 409).length, 4);
  const reloaded = new PublishGate(state);
  assert.equal((await reloaded.fetch(new Request('https://gate/acquire', { method: 'POST' }))).status, 409);
});
