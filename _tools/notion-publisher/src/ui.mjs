export const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>BamOwl · 블로그 발행</title><link rel="stylesheet" href="/app.css"><script src="/app.js" defer></script></head>
<body><main>
<div class="brand">BAMOWL <span>PUBLISHER</span></div>
<h1>작성한 글을<br>블로그로.</h1>
<p class="description">Notion에서 공개로 표시한 새 글과 변경된 글을 블로그에 반영합니다.</p>
<section class="panel">
<div class="identity"><span class="dot" id="dot"></span><span id="identity">로그인 상태 확인 중</span></div>
<a class="button" id="login" href="/auth/login" hidden>GitHub 계정으로 로그인</a>
<button class="button" id="publish" type="button" hidden>블로그 발행</button>
<p id="status" role="status" aria-live="polite">잠시 기다려 주세요.</p>
<div class="links"><a id="run" href="https://github.com/Bamtoliya/bamtoliya.github.io/actions" target="_blank" rel="noopener noreferrer">작업 기록</a><a id="blog" href="https://www.bamowl.com" target="_blank" rel="noopener noreferrer">블로그 보기</a><button id="logout" type="button" hidden>로그아웃</button></div>
</section>
<p class="footnote">저장소 소유자만 발행할 수 있습니다. 로그인은 1시간 동안 유지됩니다.</p>
</main></body></html>`;

export const css = `:root{color-scheme:dark;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#dce6e5;background:#121b20}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:32px 20px}main{width:100%;max-width:520px}.brand{font-size:13px;letter-spacing:.14em;font-weight:750;color:#8fc4b4}.brand span{margin-left:12px;color:#7d929b;font-size:11px}h1{font-size:clamp(32px,8vw,52px);line-height:1.15;letter-spacing:-.05em;margin:32px 0 20px}.description{font-size:16px;color:#a9b9bf;line-height:1.8;max-width:390px}.panel{margin-top:32px;padding:24px;border:1px solid #34464e;border-radius:12px;background:#18262d}.identity{display:flex;gap:9px;align-items:center;font-size:13px;color:#b8c9ce;margin-bottom:22px}.dot{width:7px;height:7px;flex-shrink:0;border-radius:50%;background:#82969e}.dot.ready{background:#8fc4b4}.button{display:block;width:100%;border:0;border-radius:7px;background:#9bcfbe;color:#102a24;font:inherit;font-size:16px;font-weight:700;padding:15px;text-align:center;text-decoration:none;cursor:pointer}.button:hover{background:#b3dfd0}.button:disabled{opacity:.55;cursor:wait}[hidden]{display:none!important}#status{color:#a9b9bf;font-size:14px;line-height:1.6;margin:18px 0 22px;overflow-wrap:anywhere;min-height:23px}.links{display:flex;gap:20px;flex-wrap:wrap;align-items:center;font-size:13px}.links a,.links button{color:#b8cbc6;text-decoration:underline;text-underline-offset:4px}.links button{background:none;border:0;padding:0;font:inherit;cursor:pointer}.footnote{font-size:12px;line-height:1.7;color:#859aa3;margin-top:18px}a:focus-visible,button:focus-visible{outline:2px solid #e2f7ef;outline-offset:4px}`;

export const script = `const get = id => document.getElementById(id);
let csrf = '', requestId = '', timer = null, started = 0;
const status = message => { get('status').textContent = message; };
async function api(path, method = 'GET') {
  const response = await fetch(path, { method, credentials: 'same-origin', headers: method === 'POST' ? { 'X-CSRF-Token': csrf } : {} });
  const data = await response.json();
  if (!response.ok) { const error = new Error(data.message || '요청을 완료하지 못했습니다.'); error.code = response.status; throw error; }
  return data;
}
function signedOut(message) {
  clearTimeout(timer); csrf = ''; get('login').hidden = false; get('publish').hidden = true; get('logout').hidden = true;
  get('identity').textContent = 'GitHub 로그인 필요'; get('dot').classList.remove('ready'); status(message);
}
function unlock() { clearTimeout(timer); get('publish').disabled = false; get('publish').textContent = '블로그 발행'; }
async function poll() {
  if (Date.now() - started > 20 * 60 * 1000) { status('확인이 오래 걸리고 있습니다. 작업 기록에서 진행 상태를 확인하세요.'); unlock(); return; }
  try {
    const { run } = await api('/api/status?request=' + encodeURIComponent(requestId));
    if (run) {
      get('run').href = run.url;
      if (run.status === 'completed') {
        status(run.conclusion === 'success' ? '발행을 완료했습니다. 블로그에서 확인해 주세요.' : run.conclusion === 'cancelled' ? '발행 작업이 취소되었습니다. 작업 기록을 확인해 주세요.' : '발행을 완료하지 못했습니다. 작업 기록에서 원인을 확인해 주세요.'); unlock(); return;
      }
      status(run.status === 'in_progress' ? '글을 가져와 블로그에 반영하고 있습니다.' : '발행 작업이 시작되기를 기다리고 있습니다.');
    } else { status('발행 요청을 접수했습니다. 작업 시작을 기다리고 있습니다.'); }
    timer = setTimeout(poll, 10000);
  } catch (error) {
    if (error.code === 401 || error.code === 403) { signedOut(error.message); return; }
    status(error.message + ' 작업 기록에서도 확인할 수 있습니다.'); timer = setTimeout(poll, 30000);
  }
}
get('publish').addEventListener('click', async () => {
  get('publish').disabled = true; get('publish').textContent = '발행 중'; status('발행 요청을 보내고 있습니다.');
  try { const data = await api('/api/publish', 'POST'); requestId = data.requestId; started = Date.now(); await poll(); }
  catch (error) { if (error.code === 401 || error.code === 403) signedOut(error.message); else status(error.message); unlock(); }
});
get('logout').addEventListener('click', async () => {
  try { await api('/api/logout', 'POST'); signedOut('로그아웃했습니다.'); } catch (error) { status(error.message); }
});
(async () => {
  const errorMessage = new URLSearchParams(location.search).get('error');
  history.replaceState(null, '', '/');
  try {
    const data = await api('/api/session'); csrf = data.csrf;
    get('identity').textContent = data.user.login + ' · 저장소 소유자'; get('dot').classList.add('ready');
    get('publish').hidden = false; get('logout').hidden = false; get('blog').href = data.blogUrl;
    status(errorMessage || '발행할 준비가 되었습니다.');
  } catch (error) {
    signedOut(errorMessage || (error.code === 401 ? '로그인 후 발행할 수 있습니다.' : error.message));
    if (error.code === 503) { get('login').hidden = true; get('identity').textContent = '연결 준비 중'; }
  }
})();`;
