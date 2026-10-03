export const popupHtml = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>BamOwl · 인증 연결</title><link rel="stylesheet" href="/app.css"><script src="/popup.js" defer></script></head>
<body><main><div class="brand">BAMOWL <span>PUBLISHER</span></div><section class="panel"><p id="status" role="status">연결할 계정을 확인하고 있습니다.</p><button class="button" id="connect" type="button" hidden>Notion 버튼 연결</button><button class="button" id="close" type="button" hidden>인증 창 닫기</button></section></main></body></html>`;

export const popupScript = `const get = id => document.getElementById(id);
let csrf = '';
const message = new URLSearchParams(location.search).get('error');
history.replaceState(null, '', '/auth/complete');
async function api(method) {
  const response = await fetch('/api/link', { method, credentials: 'same-origin', headers: method === 'POST' ? { 'X-CSRF-Token': csrf } : {} });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || '인증 연결을 완료하지 못했습니다.');
  return data;
}
function failed(text) { get('status').textContent = text; get('connect').hidden = true; get('close').hidden = false; }
get('close').addEventListener('click', () => window.close());
get('connect').addEventListener('click', async () => {
  get('connect').disabled = true;
  try {
    await api('POST'); csrf = ''; get('connect').hidden = true; get('close').hidden = false;
    get('status').textContent = '연결했습니다. Notion의 발행 버튼으로 돌아가세요.';
    setTimeout(() => window.close(), 800);
  } catch (error) { failed(error.message); }
});
(async () => {
  if (message) { failed(message + ' Notion의 버튼에서 다시 연결해 주세요.'); return; }
  try { const data = await api('GET'); csrf = data.csrf; get('status').textContent = data.user.login + ' 계정을 Notion의 발행 버튼에 연결합니다.'; get('connect').hidden = false; }
  catch (error) { failed(error.message); }
})();`;
