(() => {
  'use strict';
  const get = id => document.getElementById(id);
  const widget = document.querySelector('.publisher-widget');
  let worker, session = '', verifier = '', timer, requestId = '', started = 0;
  let loginStarted = 0, generation = 0, popup, pairing, account = '', busy = false;
  const status = text => { get('status').textContent = text; };
  const hideLoginLinks = () => { get('login-link').hidden = true; get('cancel').hidden = true; };
  const base64 = bytes => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');

  async function api(path, token = session) {
    // The iframe never needs third-party cookies or browser storage.
    const response = await fetch(worker + path, {
      method: 'POST', credentials: 'omit', cache: 'no-store',
      headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(15000)
    });
    const data = await response.json();
    if (!response.ok) {
      const error = new Error(data.message || '요청을 완료하지 못했습니다.');
      error.code = response.status; throw error;
    }
    return data;
  }

  function signedOut(message) {
    generation++; clearTimeout(timer); session = ''; verifier = ''; pairing = null; account = ''; busy = false;
    hideLoginLinks(); get('disconnect').hidden = true;
    get('action').disabled = true; get('action').textContent = 'GitHub 로그인'; status(message);
    const attempt = generation;
    const proof = base64(crypto.getRandomValues(new Uint8Array(32)));
    crypto.subtle.digest('SHA-256', new TextEncoder().encode(proof)).then(hash => {
      if (attempt !== generation) return;
      pairing = { proof, channel: base64(new Uint8Array(hash)) }; get('action').disabled = false;
    }).catch(() => { if (attempt === generation) status('로그인 연결을 준비하지 못했습니다. 페이지를 새로고침해 주세요.'); });
  }

  function ready(message) {
    busy = false; get('action').disabled = false; get('action').textContent = '블로그 발행';
    get('disconnect').hidden = false; hideLoginLinks(); status(message || account + ' · 발행 준비됨');
  }

  async function claim(attempt) {
    if (attempt !== generation) return;
    if (Date.now() - loginStarted > 10 * 60 * 1000) { signedOut('연결 시간이 만료되었습니다. 다시 로그인하세요.'); return; }
    try {
      const data = await api('/api/embed/claim', verifier);
      if (attempt !== generation) return;
      if (data.pending) { timer = setTimeout(() => claim(attempt), 5000); return; }
      verifier = ''; session = data.session; account = data.user.login; ready();
    } catch (error) {
      if (attempt !== generation) return;
      if ([400, 401, 403].includes(error.code)) { signedOut(error.message); return; }
      status('연결 상태를 확인하지 못했습니다. 잠시 후 다시 확인합니다.');
      timer = setTimeout(() => claim(attempt), 10000);
    }
  }

  async function login() {
    if (!pairing) return;
    busy = true; get('action').disabled = true; get('action').textContent = 'GitHub 연결 중';
    status('인증 창에서 로그인 후 “Notion 버튼 연결”을 눌러 주세요.');
    const attempt = ++generation;
    verifier = pairing.proof;
    const target = worker + '/auth/login?bridge=' + encodeURIComponent(pairing.channel);
    pairing = null;
    // Open the actual auth URL synchronously. This also works when the native
    // Notion app sends URLs to an external browser instead of a JS popup.
    try { popup = window.open(target, '_blank', 'popup,width=520,height=680'); } catch { popup = null; }
    get('cancel').hidden = false;
    try {
      get('login-link').href = target; get('login-link').hidden = false;
      if (!popup) status('아래 “로그인 창 열기”로 인증을 진행해 주세요.');
      // OAuth COOP or Notion's desktop app can separate the popup from the
      // iframe. Only the verifier can claim; opener/postMessage is not needed.
      loginStarted = Date.now(); await claim(attempt);
    } catch { if (attempt === generation) signedOut('로그인 연결을 준비하지 못했습니다. 다시 시도하세요.'); }
  }

  async function poll(attempt) {
    if (attempt !== generation) return;
    if (Date.now() - started > 20 * 60 * 1000) { ready('확인이 오래 걸립니다. 작업 기록에서 진행 상태를 확인하세요.'); return; }
    try {
      const { run } = await api('/api/embed/status?request=' + encodeURIComponent(requestId));
      if (attempt !== generation) return;
      if (run) {
        get('run').href = run.url; get('run').hidden = false;
        if (run.status === 'completed') {
          ready(run.conclusion === 'success' ? '발행 완료 · 블로그에 반영했습니다.' : run.conclusion === 'cancelled' ? '발행이 취소됐습니다. 작업 기록을 확인하세요.' : '발행하지 못했습니다. 작업 기록을 확인하세요.'); return;
        }
        status(run.status === 'in_progress' ? 'Notion 글을 가져와 블로그에 반영하고 있습니다.' : '발행 작업 시작을 기다리고 있습니다.');
      } else { status('발행 요청 접수 · 작업 시작을 기다리고 있습니다.'); }
      timer = setTimeout(() => poll(attempt), 10000);
    } catch (error) {
      if (attempt !== generation) return;
      if ([401, 403].includes(error.code)) { signedOut(error.message); return; }
      status('상태를 확인하지 못했습니다. 작업 기록에서도 확인할 수 있습니다.');
      timer = setTimeout(() => poll(attempt), 30000);
    }
  }

  async function publish() {
    busy = true; get('action').disabled = true; get('action').textContent = '발행 중';
    get('run').href = 'https://github.com/Bamtoliya/bamtoliya.github.io/actions'; get('run').hidden = false;
    status('발행 요청을 보내고 있습니다.');
    const attempt = generation;
    try {
      const data = await api('/api/embed/publish');
      if (attempt !== generation) return;
      requestId = data.requestId; started = Date.now(); await poll(attempt);
    } catch (error) {
      if (attempt !== generation) return;
      if ([401, 403].includes(error.code)) signedOut(error.message);
      else ready(error.code ? error.message : '응답을 확인하지 못했습니다. 재발행 전에 작업 기록을 확인하세요.');
    }
  }

  get('action').addEventListener('click', () => { if (!busy) { if (session) publish(); else login(); } });
  get('cancel').addEventListener('click', () => {
    try { popup?.close(); } catch {}
    signedOut('연결을 취소했습니다.');
  });
  get('disconnect').addEventListener('click', () => signedOut('이 버튼의 연결을 해제했습니다.'));
  try {
    const url = new URL(widget.dataset.worker);
    if (url.protocol !== 'https:') throw new Error('Invalid publisher URL');
    worker = url.origin; signedOut('GitHub 계정으로 연결한 뒤 발행할 수 있습니다.');
  } catch { status('발행 서버 연결을 준비 중입니다.'); }
})();
