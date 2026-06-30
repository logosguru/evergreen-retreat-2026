# 늘푸른교회 수련회 2026 — Phase 1 셋업 가이드

코드는 모두 작성되어 있고 `npm run build` / `npm run dev`가 통과합니다.
실제로 동작시키려면 아래의 **대시보드 설정**(Claude가 대신 못 하는 부분)을 진행하세요.

---

## 0. 로컬 개발 (호스팅 Supabase 없이) — 권장 시작점

Docker + Supabase CLI로 Postgres/Auth/Studio/메일함을 로컬에 모두 띄웁니다.
호스팅 프로젝트 없이 전체 플로우를 테스트할 수 있고, **매직링크 이메일은 로컬 메일함(Mailpit)에 잡혀** SMTP가 필요 없습니다.

```bash
# 1) Docker Desktop 실행 (open -a Docker), 그 다음:
supabase start        # 첫 실행은 이미지 다운로드로 몇 분. 마이그레이션 자동 적용 + 첫 관리자 시드
supabase status       # 로컬 키/URL 확인 (이미 .env.local 에 입력돼 있음)
npm run dev           # http://localhost:3000
```

로컬 서비스 URL:
| 서비스 | URL |
|---|---|
| 앱 | http://localhost:3000 (영어 `/en`) |
| Supabase API | http://127.0.0.1:54321 |
| Studio (DB 관리 UI) | http://127.0.0.1:54323 |
| **메일함 Mailpit** (매직링크 확인) | http://127.0.0.1:54324 |
| Postgres | postgresql://postgres:postgres@127.0.0.1:54322/postgres |

### 로컬에서 플로우 테스트
1. **등록**: `/register` → 개인 또는 가구주 일괄 등록 제출. Studio의 `attendees` 테이블에서 행 확인.
2. **성도 본인 수정**: `/edit` → 등록한 이메일 입력 → **Mailpit(54324)** 에서 메일 열기 →
   "등록 정보 수정하기" 클릭 → `/edit/manage`에서 본인 가구 행만 보이고 수정 가능.
3. **관리자**: 로컬에선 Google 버튼 대신 **관리자 이메일(`logosguru@gmail.com`)로 매직링크 로그인**
   (`/edit`에서 요청 → Mailpit 링크 클릭) → 로그인 후 주소창에 `/admin` 입력.
   `app_role=admin` 클레임이 부여돼 전체 명단 + 회비 토글이 동작합니다.
   - Google OAuth 자체를 로컬에서 테스트하려면 Google Cloud OAuth 클라이언트에
     `http://127.0.0.1:54321/auth/v1/callback` 리디렉션을 등록해야 합니다(선택).

### 유용한 명령
```bash
supabase stop                 # 스택 중지 (데이터 유지)
supabase stop --no-backup     # 중지 + 데이터 삭제
supabase db reset             # 마이그레이션 처음부터 재적용 (DB 초기화, 첫 관리자 재시드)
supabase migration new <name> # 새 마이그레이션 파일 생성
```

> 마이그레이션을 바꾸면 `supabase db reset`로 로컬에 반영하세요. 이후 호스팅 단계(§1~)로 넘어가면 됩니다.

---

## 1. Supabase 프로젝트 (호스팅 — 배포 시)

1. https://supabase.com → 새 프로젝트 생성 (무료 티어).
2. **SQL Editor**에서 `supabase/migrations/0001_init.sql` 전체를 붙여넣고 실행.
   - 테이블(`attendees`, `admins`), RLS, 트리거, access token hook, 첫 관리자(logosguru@gmail.com)가 생성됩니다.
3. **Authentication → Hooks** → *Custom Access Token* → `public.custom_access_token_hook` 선택 후 활성화.
   - ⚠️ 이 단계를 안 하면 관리자 권한 클레임이 토큰에 안 들어가 관리자 화면에 못 들어갑니다.
4. **Project Settings → API**에서 값 복사 → `.env.local`에 입력:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (sb_publishable_…)
   - `SUPABASE_SECRET_KEY` (sb_secret_…)

## 2. Google 로그인 (관리자)

1. Google Cloud Console → OAuth 2.0 클라이언트 ID 생성.
   - 승인된 리디렉션 URI: `https://YOUR-PROJECT.supabase.co/auth/v1/callback`
2. Supabase **Authentication → Providers → Google** 에 Client ID/Secret 입력 후 활성화.

## 3. 매직링크 (성도 본인 수정) — ⚠️ 출시 전 필수

1. **Custom SMTP 설정** (Authentication → Emails → SMTP). 내장 메일은 시간당 ~2통 제한이라 실사용 불가.
   - 추천: [Resend](https://resend.com) 무료 (월 3,000통). SMTP 정보 입력.
   - 이후 Rate Limits에서 시간당 전송량 상향.
2. **이메일 템플릿(Magic Link)** 수정 — 서버사이드 확인 라우트(`/auth/confirm`)를 쓰도록 링크를 token_hash 방식으로:
   ```
   <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/edit/manage">
     수정 링크 열기
   </a>
   ```
3. **URL Configuration** (Authentication → URL Configuration):
   - Site URL: 개발 중엔 `http://localhost:3000`, 배포 후 Vercel/서브도메인 URL.
   - Redirect URLs allowlist: `http://localhost:3000/**`, 배포 URL, 추후 교회 서브도메인 추가.

## 4. 로컬 실행

```bash
npm run dev
# http://localhost:3000  (한국어)
# http://localhost:3000/en  (영어)
```

- 등록: `/register` (개인 / 가구주 일괄)
- 본인 수정: `/edit` → 이메일 입력 → 메일의 링크 클릭 → `/edit/manage`
- 관리자: `/admin/login` → Google 로그인 → `/admin` (참석자 목록 + 회비 토글)

## 4b. Cloudflare Turnstile (공개 폼 봇 방지) — 출시 전 권장

1. https://dash.cloudflare.com → Turnstile → 사이트 추가(도메인: 배포 URL, 로컬 테스트 시 `localhost` 추가).
2. 발급된 **Site Key / Secret Key**를 환경변수로 등록:
   - `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (Site Key)
   - `TURNSTILE_SECRET_KEY` (Secret Key)
3. 두 키가 모두 비어 있으면 검증을 스킵하므로 로컬 개발은 키 없이 동작한다.
   키가 설정되면 등록 제출과 수정 링크 요청에 캡차가 강제된다.

## 4c. keep-alive cron

- `vercel.json`의 cron이 매일 `/api/keep-alive`를 호출해 DB 무활동 정지를 방지한다.
- Vercel 프로젝트 환경변수에 `CRON_SECRET`(임의 문자열)을 등록하면 라우트가
  `Authorization: Bearer <CRON_SECRET>` 헤더를 검증한다(Vercel Cron이 자동 전송).

## 5. Vercel 배포

```bash
npm i -g vercel   # 아직 미설치 시
vercel link
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
vercel env add SUPABASE_SECRET_KEY
vercel env add NEXT_PUBLIC_TURNSTILE_SITE_KEY
vercel env add TURNSTILE_SECRET_KEY
vercel env add CRON_SECRET
vercel deploy            # preview
vercel deploy --prod     # production
```

- 배포 URL을 Supabase URL Configuration + Google OAuth 출처에 추가.
- ⚠️ 무료 Supabase는 DB 7일 무활동 시 일시정지 → 수련회 전 keep-alive cron 추가 권장.

---

## 알려진 한계 / 다음 단계 (Phase 1 후속)

- **Cloudflare Turnstile** 미적용: 공개 등록 폼 스팸 방지용으로 출시 전 추가 권장
  (`register/actions.ts`의 TODO 참고).
- 관리자 권한은 로그인 시점에 클레임으로 굳어짐 → `admins`에 나중에 추가된 사람은 **재로그인** 필요.
- 부분 참석 시간은 datetime-local wall-clock으로 저장(타임존 변환 없음).
- Phase 2(방 배치), Phase 3(스케줄+콘텐츠), Phase 4(대시보드)는 이 기반 위에 추가.
