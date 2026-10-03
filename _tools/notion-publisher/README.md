# BamOwl 발행 버튼

GitHub Pages의 `/publish/` 페이지는 Notion에 넣을 작은 발행 위젯입니다. **GitHub 로그인**을 누르면 인증 팝업이 열리고, 저장소 소유자 확인 후 **Notion 버튼 연결**을 눌러 위젯을 연결합니다. 돌아온 위젯에서 **블로그 발행**을 누르면 기존 Notion 가져오기 → 커밋 → Jekyll → GitHub Pages 워크플로를 실행하고, 완료 상태도 위젯 안에 표시합니다. 로그인이나 연결만으로 발행하지는 않습니다.

블로그 본문과 버튼 화면은 GitHub Pages에 남습니다. 로그인·발행 요청만 Cloudflare Workers로 처리합니다. 위젯은 블로그 헤더나 메뉴 없이 버튼과 상태만 출력합니다. 일반 사이트 메뉴에는 발행 페이지를 추가하지 않았으며 검색 엔진에 `noindex`를 전달합니다. 이 설정은 접근 통제가 아니므로 주소를 아는 사람은 버튼 화면을 볼 수 있습니다. 서버는 화면 노출 여부와 관계없이 소유자를 확인합니다. Worker의 `/` 주소에서는 기존 전체 발행 화면도 사용할 수 있습니다.

## 준비

- Node.js 22 이상과 Cloudflare 무료 계정
- GitHub OAuth App: 로그인용, 저장소 권한을 요청하지 않음
- GitHub fine-grained PAT: 발행용, **이 저장소만** 선택하고 `Contents: Read and write`, `Actions: Read-only` 부여
- 기존 외부 임베드 HTML/URL에 넣었던 PAT 폐기·교체

OAuth Client Secret, PAT, 세션 암호키를 채팅이나 저장소에 올리지 마세요. 아래 `wrangler secret put`의 입력 프롬프트에 넣습니다. 기존 Actions의 `NOTION_TOKEN`, `DATABASE_ID`, `PAT` 등은 이번 Worker의 Secret과 별개입니다.

## 연결 순서

1. 이 폴더에서 `npm ci`를 실행한 뒤 `npx wrangler login --device`로 Cloudflare에 로그인합니다. 기기 인증은 localhost 콜백을 사용하지 않습니다. `npx wrangler whoami`로 연결 계정을 확인합니다.
2. Secret 설정 전 `npm run deploy`를 실행해 Worker 주소를 발급받습니다. 인증 설정이 없으면 발행 API는 503으로 차단됩니다. Workers Free 플랜을 유지합니다.
3. [GitHub OAuth App 등록](https://github.com/settings/applications/new)에서 입력합니다.
   - Application name: `BamOwl Publisher`
   - Homepage URL: `https://www.bamowl.com/publish/`
   - Authorization callback URL: **발급받은 Worker 주소** + `/auth/callback`
4. 발급된 Client ID를 `wrangler.jsonc`의 `GITHUB_CLIENT_ID`에 넣습니다.
5. 다음 명령의 프롬프트에 Secret을 각각 입력합니다.

   ```powershell
   npx wrangler secret put GITHUB_CLIENT_SECRET
   npx wrangler secret put GITHUB_TOKEN
   npx wrangler secret put SESSION_SECRET
   ```

   `SESSION_SECRET`은 32자 이상 무작위 문자열을 사용합니다. 예를 들어 `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`로 생성할 수 있습니다. 세션 키를 교체하면 기존 로그인이 만료됩니다.

   CLI 대신 Cloudflare 대시보드의 **Workers & Pages → 해당 Worker → Settings → Variables and Secrets → Add**에서도 등록할 수 있습니다. Type은 **Secret**으로 선택하고 이름과 값을 입력한 뒤 **Deploy**합니다. 현재 배포에는 `SESSION_SECRET`이 이미 등록되어 있으므로 `GITHUB_CLIENT_SECRET`과 `GITHUB_TOKEN`만 추가하면 됩니다.

6. `npm run deploy`로 Client ID 설정까지 반영합니다. 대시보드에서 Secret을 추가한 뒤에도 실행하여 로컬 설정의 Durable Object와 요청 제한 바인딩이 함께 반영되도록 합니다. `PublishGate`와 `LoginBridge`는 SQLite Durable Object이며 첫 배포 때 자동 생성됩니다. `/api/session`이 로그인 전 401을 반환하면 인증 설정이 준비된 상태이며, 503이면 Secret 또는 바인딩 설정을 확인합니다.
7. 저장소 루트 `_config.yml`의 `publisher_url`에 Worker의 HTTPS 주소를 넣습니다.
8. 변경된 `pages-deploy.yml`의 `run-name`과 발행 페이지를 `gh-pages` 브랜치에 반영합니다. 이 워크플로는 저장소의 **기본 브랜치에도** 존재해야 `repository_dispatch`가 작동합니다. 기본 브랜치를 별도로 쓰는 경우 해당 워크플로도 갱신합니다.
9. `https://www.bamowl.com/publish/`에서 GitHub 로그인 → 팝업의 **Notion 버튼 연결** → 위젯의 **블로그 발행** → 완료 상태를 확인합니다.

현재 발급된 Worker 주소: `https://bamowl-notion-publisher.bamowl-notion-publisher.workers.dev`

OAuth App의 현재 콜백 주소: `https://bamowl-notion-publisher.bamowl-notion-publisher.workers.dev/auth/callback`

Notion에는 `/publish/` 주소를 임베드합니다. GitHub 로그인과 연결 승인은 팝업에서, 발행과 상태 확인은 임베드 안에서 처리합니다. 팝업을 열 수 없으면 위젯의 **로그인 창 열기** 링크로 외부 브라우저에서 인증할 수 있습니다. 인증 결과는 5초 간격으로 확인하므로 연결 승인 후 버튼이 바뀔 때까지 잠시 걸릴 수 있습니다.

로그인 쿠키는 팝업에만 사용합니다. 위젯은 제3자 쿠키, `localStorage`, `sessionStorage`, `window.opener`나 `postMessage`에 의존하지 않습니다. 연결한 위젯의 세션은 메모리에만 유지되고 최대 1시간 유효합니다. Notion 새로고침이나 페이지를 다시 열면 연결을 다시 해야 합니다. 팝업에 기존 유효한 로그인이 남아 있으면 로그인 입력을 생략하고 연결만 승인합니다. **연결 해제**는 현재 위젯의 메모리 세션을 지우며 팝업의 GitHub 로그아웃이나 OAuth 권한 철회와는 별개입니다.

## 검증과 로컬 개발

```powershell
npm test
npm run check
npm run dev
```

로컬 OAuth 테스트용 Secret은 Git에서 제외된 `.dev.vars`에 설정합니다. 로컬 서버는 HTTPS가 필요하며 별도 OAuth App의 콜백을 해당 HTTPS 주소에 맞춰야 합니다. 기본 검증은 가짜 GitHub 응답을 사용하는 테스트이므로 실제 발행을 실행하지 않습니다.

## 제한과 방어

- 개인 계정 소유 저장소만 지원. 로그인 계정의 숫자 ID를 GitHub가 반환한 `repo.owner.id`와 비교. 다른 사용자·관리 권한이 있는 공동 작업자·조직 소유 저장소는 거부.
- 발행과 상태 확인 때마다 OAuth 토큰으로 로그인 계정을 재확인. 만료·철회된 로그인은 거부.
- OAuth state와 PKCE 검사, 암호화된 `HttpOnly; Secure; SameSite=Lax` 쿠키, 최대 1시간 세션. 쿠키를 사용하는 POST는 Origin과 CSRF를 검사.
- 위젯은 256비트 무작위 연결 비밀값을 메모리에 생성. 팝업 URL에는 SHA-256 해시만 전달. Durable Object에 암호화된 세션을 10분 동안 보관하고 비밀값을 보유한 위젯에 한 번만 전달. 팝업의 명시적 연결 승인 전에는 세션을 전달하지 않음.
- 임베드 API는 `BLOG_URL`의 고정된 HTTPS Origin만 허용하고, 별도 용도로 암호화된 발행 세션을 Authorization 헤더로 검사. GitHub OAuth 토큰이나 PAT를 위젯 코드 또는 URL에 노출하지 않음.
- IP 기준 분당 30회 제한은 Cloudflare 지역별 근사 제한. Worker 호출량 자체를 막는 전역 한도나 청구액 상한이 아님. 공유 IP에서는 정상 사용도 제한될 수 있음.
- 무료 SQLite Durable Object가 저장소 단위 발행 요청을 60초 동안 직렬화. 기존 워크플로가 실행 중일 때도 새 발행을 거부. 통신 실패 시 이미 요청이 접수되었을 수 있으므로 자동 재발행하지 않음.
- 자신의 요청 UUID와 워크플로 `display_title`이 정확히 일치할 때만 완료로 표시. 상태 확인은 10초 간격, 최대 20분. 이후 GitHub 작업 기록에서 직접 확인.
- 인증 서버가 중단되어도 GitHub Pages의 글 열람은 별도로 동작. 무료 한도가 소진되면 발행 기능이 중단될 수 있음.
- 버튼 페이지를 완전히 비공개로 하려면 Cloudflare Access로 보호한 별도 호스트가 필요. `noindex`, 숨긴 메뉴, 도메인/Origin 확인은 사용자 인증을 대체하지 않음.

## 공식 문서

- [GitHub OAuth 로그인](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps)
- [Repository dispatch](https://docs.github.com/en/rest/repos/repos#create-a-repository-dispatch-event)
- [Workers 무료 한도](https://developers.cloudflare.com/workers/platform/limits/)
- [Workers Secret](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Durable Objects 무료 SQLite 지원](https://developers.cloudflare.com/durable-objects/platform/pricing/)
- [임베드의 제3자 쿠키 제한](https://developer.mozilla.org/en-US/docs/Web/Privacy/Guides/Third-party_cookies)
