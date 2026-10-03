import { html, css, script } from './ui.mjs';
import { popupHtml, popupScript } from './popup.mjs';
export { PublishGate } from './gate.mjs';
export { LoginBridge } from './login-bridge.mjs';

const encoder = new TextEncoder();
const OAUTH_COOKIE = '__Host-bamowl-oauth';
const SESSION_COOKIE = '__Host-bamowl-session';
const LINK_COOKIE = '__Host-bamowl-link';
const SESSION_SECONDS = 3600;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BRIDGE_KEY = /^[A-Za-z0-9_-]{43}$/;
const embedPaths = new Set(['/api/embed/claim', '/api/embed/session', '/api/embed/status', '/api/embed/publish']);
const securityHeaders = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
};

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function result(body, status = 200, headers = {}) {
  return Response.json(body, { status, headers: { ...securityHeaders, ...headers } });
}

function cookie(name, value, age) {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
}

function cookies(request) {
  return Object.fromEntries((request.headers.get('Cookie') || '').split(';').map(part => {
    const i = part.indexOf('=');
    return i < 0 ? ['', ''] : [part.slice(0, i).trim(), part.slice(i + 1).trim()];
  }));
}

function base64(bytes) {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function unbase64(value) {
  return Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
}

// Encryption also authenticates each cookie; OAuth tokens never reach page JS.
async function key(secret) {
  return crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', encoder.encode(secret)), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function seal(value, secret, purpose) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(purpose) }, await key(secret), encoder.encode(JSON.stringify(value)));
  return `${base64(iv)}.${base64(new Uint8Array(encrypted))}`;
}

export async function unseal(value, secret, purpose) {
  try {
    if (!value || value.length > 3800) return null;
    const parts = value.split('.');
    if (parts.length !== 2) return null;
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unbase64(parts[0]), additionalData: encoder.encode(purpose) }, await key(secret), unbase64(parts[1]));
    const payload = JSON.parse(new TextDecoder().decode(decrypted));
    return payload.exp > Date.now() ? payload : null;
  } catch { return null; }
}

function configured(env) {
  return env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET && env.GITHUB_TOKEN && env.SESSION_SECRET?.length >= 32 && env.REQUEST_LIMITER && env.PUBLISH_GATE && env.LOGIN_BRIDGE;
}

function widgetOrigin(env) {
  const url = new URL(env.BLOG_URL);
  if (url.protocol !== 'https:') throw new HttpError(503, '발행 페이지 주소 설정을 확인하세요.');
  return url.origin;
}

function bearer(request) { return request.headers.get('Authorization')?.match(/^Bearer (\S+)$/)?.[1]; }

async function digest(value) {
  return base64(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
}

function repository(env) {
  return `/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}`;
}

function safeUrl(value, fallback) {
  try { const url = new URL(value); if (url.protocol === 'https:') return url.href; } catch {}
  return fallback;
}

function publicRun(run, env) {
  return {
    id: run.id,
    status: run.status,
    conclusion: run.conclusion,
    url: `https://github.com/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}/actions/runs/${run.id}`
  };
}

export function createHandler({ fetchRemote = fetch } = {}) {
  async function remote(url, options = {}) {
    try {
      return await fetchRemote(url, { ...options, signal: AbortSignal.timeout(10_000) });
    } catch { throw new HttpError(502, 'GitHub 응답을 확인하지 못했습니다. 작업 기록을 확인한 뒤 다시 시도하세요.'); }
  }

  async function github(path, env, token = env.GITHUB_TOKEN, options = {}) {
    const response = await remote(`https://api.github.com${path}`, {
      ...options,
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'BamOwl-Notion-Publisher',
        'X-GitHub-Api-Version': '2026-03-10',
        ...options.headers
      }
    });
    if (!response.ok) {
      if (token !== env.GITHUB_TOKEN && response.status === 401) throw new HttpError(401, 'GitHub 로그인이 만료되었습니다. 다시 로그인하세요.');
      throw new HttpError(502, 'GitHub 연결에 실패했습니다. 저장소와 서버 토큰의 권한을 확인하세요.');
    }
    return response.status === 204 ? null : response.json();
  }

  async function owner(token, env) {
    const [user, repo] = await Promise.all([
      github('/user', env, token),
      github(repository(env), env)
    ]);
    // Username strings or collaborator/admin permissions are not owner proof.
    if (repo.owner?.type !== 'User' || !Number.isSafeInteger(user.id) || user.id !== repo.owner.id) {
      throw new HttpError(403, '이 저장소의 소유자 계정만 발행할 수 있습니다.');
    }
    return { id: user.id, login: user.login };
  }

  async function session(request, env) {
    const value = await unseal(cookies(request)[SESSION_COOKIE], env.SESSION_SECRET, 'session');
    if (!value?.token || !value.csrf) throw new HttpError(401, 'GitHub 계정으로 로그인하세요.');
    return value;
  }

  async function runs(env, query = '') {
    return github(`${repository(env)}/actions/workflows/${encodeURIComponent(env.WORKFLOW_FILE)}/runs?per_page=100${query}`, env);
  }

  function sameOrigin(request) {
    if (request.headers.get('Origin') !== new URL(request.url).origin) throw new HttpError(403, '허용되지 않은 요청입니다.');
  }

  function bridgeObject(channel, env) {
    return env.LOGIN_BRIDGE.get(env.LOGIN_BRIDGE.idFromName(channel));
  }

  async function completeBridge(channel, env, auth) {
    const session = await seal({ token: auth.token, widgetOrigin: widgetOrigin(env), exp: auth.exp }, env.SESSION_SECRET, 'embed-session');
    const response = await bridgeObject(channel, env).fetch('https://bridge/complete', {
      method: 'POST', body: JSON.stringify({ session, exp: Date.now() + 600_000 })
    });
    if (!response.ok) throw new HttpError(409, '이 인증 연결은 이미 사용되었습니다. Notion의 버튼에서 다시 연결하세요.');
  }

  async function embedSession(request, env) {
    const auth = await unseal(bearer(request), env.SESSION_SECRET, 'embed-session');
    if (!auth?.token || auth.widgetOrigin !== widgetOrigin(env)) throw new HttpError(401, 'GitHub 연결이 만료되었습니다. 다시 로그인하세요.');
    return auth;
  }

  async function linkCookie(channel, env) {
    return cookie(LINK_COOKIE, await seal({ bridge: channel, csrf: crypto.randomUUID(), exp: Date.now() + 600_000 }, env.SESSION_SECRET, 'link'), 600);
  }

  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      let clearOauth = false;
      let bridge;
      let cors = {};
      const reply = (body, status = 200, headers = {}) => result(body, status, { ...cors, ...headers });
      try {
        const publicContent = { '/': html, '/app.css': css, '/app.js': script, '/auth/complete': popupHtml, '/popup.js': popupScript };
        if (request.method === 'GET' && Object.hasOwn(publicContent, url.pathname)) {
          const content = publicContent[url.pathname];
          const type = url.pathname.endsWith('.js') ? 'text/javascript' : url.pathname.endsWith('.css') ? 'text/css' : 'text/html';
          return new Response(content, { headers: { ...securityHeaders, 'Content-Type': `${type}; charset=utf-8` } });
        }
        const embedded = embedPaths.has(url.pathname);
        if (embedded) {
          if (request.headers.get('Origin') !== widgetOrigin(env)) throw new HttpError(403, '허용되지 않은 발행 페이지입니다.');
          cors = { 'Access-Control-Allow-Origin': widgetOrigin(env), Vary: 'Origin' };
          if (request.method === 'OPTIONS') {
            if (request.headers.get('Access-Control-Request-Method') !== 'POST') throw new HttpError(405, '허용되지 않은 요청 방식입니다.');
            return new Response(null, { status: 204, headers: { ...securityHeaders, ...cors,
              'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': '600' } });
          }
        }
        const allowed = {
          '/auth/login': 'GET', '/auth/callback': 'GET', '/api/session': 'GET',
          '/api/status': 'GET', '/api/publish': 'POST', '/api/logout': 'POST',
          '/api/link': ['GET', 'POST'],
          ...Object.fromEntries([...embedPaths].map(path => [path, 'POST']))
        };
        if (!allowed[url.pathname]) return reply({ message: '찾을 수 없는 주소입니다.' }, 404);
        const methods = [].concat(allowed[url.pathname]);
        if (!methods.includes(request.method)) return reply({ message: '허용되지 않은 요청 방식입니다.' }, 405, { Allow: methods.join(', ') });
        if (!configured(env)) throw new HttpError(503, '발행 서버 연결을 준비 중입니다.');
        const limited = await env.REQUEST_LIMITER.limit({ key: request.headers.get('CF-Connecting-IP') || 'unknown' });
        if (!limited.success) throw new HttpError(429, '요청이 너무 많습니다. 1분 후 다시 시도하세요.');

        if (url.pathname === '/auth/login') {
          const channel = url.searchParams.get('bridge');
          if (channel !== null) {
            if (!BRIDGE_KEY.test(channel)) throw new HttpError(400, '잘못된 인증 연결입니다.');
            bridge = channel;
            const prior = await unseal(cookies(request)[SESSION_COOKIE], env.SESSION_SECRET, 'session');
            if (prior?.token && prior.csrf) {
              try {
                await owner(prior.token, env);
                return new Response(null, { status: 303, headers: { ...securityHeaders, Location: '/auth/complete', 'Set-Cookie': await linkCookie(bridge, env) } });
              } catch (error) { if (!(error instanceof HttpError) || error.status !== 401) throw error; }
            }
          }
          const state = crypto.randomUUID();
          const verifier = base64(crypto.getRandomValues(new Uint8Array(32)));
          const flow = await seal({ state, verifier, bridge, exp: Date.now() + 600_000 }, env.SESSION_SECRET, 'oauth');
          const target = new URL('https://github.com/login/oauth/authorize');
          target.search = new URLSearchParams({
            client_id: env.GITHUB_CLIENT_ID, redirect_uri: `${url.origin}/auth/callback`,
            scope: '', state, allow_signup: 'false',
            code_challenge: base64(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(verifier)))),
            code_challenge_method: 'S256'
          });
          const headers = new Headers({ ...securityHeaders, Location: target.href });
          headers.append('Set-Cookie', cookie(OAUTH_COOKIE, flow, 600));
          headers.append('Set-Cookie', cookie(SESSION_COOKIE, '', 0));
          return new Response(null, { status: 302, headers });
        }

        if (url.pathname === '/auth/callback') {
          clearOauth = true;
          const flow = await unseal(cookies(request)[OAUTH_COOKIE], env.SESSION_SECRET, 'oauth');
          if (flow?.state === url.searchParams.get('state') && BRIDGE_KEY.test(flow.bridge || '')) bridge = flow.bridge;
          if (!flow || flow.state !== url.searchParams.get('state') || !url.searchParams.get('code') || url.searchParams.has('error')) {
            throw new HttpError(400, '로그인을 완료하지 못했습니다. 발행 페이지에서 다시 로그인하세요.');
          }
          const response = await remote('https://github.com/login/oauth/access_token', {
            method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET,
              code: url.searchParams.get('code'), redirect_uri: `${url.origin}/auth/callback`, code_verifier: flow.verifier })
          });
          const payload = response.ok ? await response.json() : {};
          if (typeof payload.access_token !== 'string' || payload.access_token.length > 1024) throw new HttpError(502, 'GitHub 로그인을 완료하지 못했습니다. 다시 로그인하세요.');
          await owner(payload.access_token, env);
          const auth = { token: payload.access_token, csrf: crypto.randomUUID(), exp: Date.now() + SESSION_SECONDS * 1000 };
          const value = await seal(auth, env.SESSION_SECRET, 'session');
          const headers = new Headers({ ...securityHeaders, Location: bridge ? '/auth/complete' : '/' });
          headers.append('Set-Cookie', cookie(OAUTH_COOKIE, '', 0));
          headers.append('Set-Cookie', cookie(SESSION_COOKIE, value, SESSION_SECONDS));
          if (bridge) headers.append('Set-Cookie', await linkCookie(bridge, env));
          return new Response(null, { status: 303, headers });
        }

        if (url.pathname === '/api/link') {
          const link = await unseal(cookies(request)[LINK_COOKIE], env.SESSION_SECRET, 'link');
          if (!BRIDGE_KEY.test(link?.bridge || '') || !link.csrf) throw new HttpError(401, '인증 연결이 만료되었습니다. Notion의 버튼에서 다시 연결하세요.');
          if (request.method === 'POST') {
            sameOrigin(request);
            if (request.headers.get('X-CSRF-Token') !== link.csrf) throw new HttpError(403, '연결 요청 인증에 실패했습니다.');
          }
          const auth = await session(request, env);
          const user = await owner(auth.token, env);
          if (request.method === 'GET') return reply({ user, csrf: link.csrf });
          // An explicit click in this unframeable, first-party confirmation page
          // prevents a crafted popup URL from silently exporting an owner's login.
          await completeBridge(link.bridge, env, auth);
          return reply({ ok: true }, 200, { 'Set-Cookie': cookie(LINK_COOKIE, '', 0) });
        }

        if (url.pathname === '/api/embed/claim') {
          const verifier = bearer(request);
          if (!BRIDGE_KEY.test(verifier || '')) throw new HttpError(401, '인증 연결을 다시 시작하세요.');
          const response = await bridgeObject(await digest(verifier), env).fetch('https://bridge/claim', { method: 'POST' });
          if (!response.ok) throw new HttpError(502, '인증 연결 상태를 확인하지 못했습니다.');
          const ticket = await response.json();
          if (ticket.pending) return reply({ pending: true }, 202);
          if (ticket.error) throw new HttpError(400, ticket.error);
          const auth = await unseal(ticket.session, env.SESSION_SECRET, 'embed-session');
          if (!auth?.token || auth.widgetOrigin !== widgetOrigin(env)) throw new HttpError(401, 'GitHub 연결이 만료되었습니다. 다시 로그인하세요.');
          const user = await owner(auth.token, env);
          return reply({ session: ticket.session, user });
        }

        const route = embedded ? url.pathname.replace('/api/embed/', '/api/') : url.pathname;
        const auth = embedded ? await embedSession(request, env) : await session(request, env);
        if (request.method === 'POST' && !embedded) {
          sameOrigin(request);
          if (request.headers.get('X-CSRF-Token') !== auth.csrf) throw new HttpError(403, '요청 인증이 만료되었습니다. 페이지를 새로고침하세요.');
        }
        if (route === '/api/logout') return reply({ ok: true }, 200, { 'Set-Cookie': cookie(SESSION_COOKIE, '', 0) });
        const user = await owner(auth.token, env);
        if (route === '/api/session') return reply({ user, ...(embedded ? {} : { csrf: auth.csrf }), blogUrl: safeUrl(env.BLOG_URL, 'https://www.bamowl.com') });

        if (route === '/api/status') {
          const id = url.searchParams.get('request');
          if (id && !UUID.test(id)) throw new HttpError(400, '잘못된 발행 요청 번호입니다.');
          const data = await runs(env, id ? '&event=repository_dispatch' : '');
          const run = id ? data.workflow_runs.find(item => item.display_title === `BamOwl publish ${id}`) : data.workflow_runs[0];
          return reply({ run: run ? publicRun(run, env) : null });
        }

        const gate = env.PUBLISH_GATE.get(env.PUBLISH_GATE.idFromName(`${env.GITHUB_OWNER}/${env.GITHUB_REPO}`));
        const acquired = await gate.fetch('https://gate/acquire', { method: 'POST' });
        if (!acquired.ok) throw new HttpError(409, '최근 발행 요청이 처리 중입니다. 잠시 후 상태를 확인하세요.');
        const active = await runs(env);
        if (active.workflow_runs.some(run => run.status !== 'completed')) throw new HttpError(409, '이미 발행 작업이 진행 중입니다. GitHub 작업 기록에서 확인하세요.');
        const id = crypto.randomUUID();
        await github(`${repository(env)}/dispatches`, env, env.GITHUB_TOKEN, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event_type: env.DISPATCH_EVENT, client_payload: { publisher_request_id: id } })
        });
        return reply({ requestId: id, message: '발행 요청을 접수했습니다.' }, 202);
      } catch (error) {
        const status = error instanceof HttpError ? error.status : 502;
        const message = error instanceof HttpError ? error.message : '발행 서버 응답을 확인하지 못했습니다. 잠시 후 다시 시도하세요.';
        if (bridge) {
          try { await bridgeObject(bridge, env).fetch('https://bridge/complete', { method: 'POST', body: JSON.stringify({ error: message, exp: Date.now() + 600_000 }) }); } catch {}
        }
        if (clearOauth || bridge) {
          const target = new URL(bridge ? '/auth/complete' : '/', url.origin);
          target.searchParams.set('error', message);
          return new Response(null, { status: 303, headers: { ...securityHeaders, Location: target.href, 'Set-Cookie': cookie(OAUTH_COOKIE, '', 0) } });
        }
        return reply({ message }, status, status === 429 ? { 'Retry-After': '60' } : {});
      }
    }
  };
}

export default createHandler();
