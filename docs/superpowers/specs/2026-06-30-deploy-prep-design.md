# 배포 준비 코드 설계 — Turnstile + keep-alive cron + 배포 설정

- 날짜: 2026-06-30
- 상태: 승인됨 (구현 대기)
- 범위: 계정/대시보드 작업 없이 가능한 **코드·설정** 준비. 외부 대시보드 작업(키 발급 등)은 별도 런북으로 안내.

## 목표

뉴욕 늘푸른교회 수련회 2026 앱의 출시 전 코드 준비:

1. **Cloudflare Turnstile** — 공개 등록 폼 + 수정 링크 요청 폼의 봇/스팸 방지
2. **keep-alive cron** — Supabase 무료 티어 7일 무활동 정지 방지
3. **배포 설정 파일** — `.env.example`, `vercel.json`, `SETUP.md` 갱신

## 확정된 결정사항 (브레인스토밍)

| 항목 | 결정 |
|---|---|
| Turnstile 적용 범위 | 등록 폼 **+** 수정 링크 요청 폼 (둘 다) |
| 키 미설정 시 | 검증 **스킵** (로컬/테스트 친화) |
| 검증 실패 시 (키 있음) | **차단** (fail-closed) — 토큰 없음/siteverify 실패/네트워크 오류 모두 차단 |
| keep-alive 방식 | **Vercel Cron** + 라우트 핸들러, `CRON_SECRET` 보호 |

---

## Part A — Cloudflare Turnstile

### 환경변수

- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` — 클라이언트 위젯용 사이트 키 (브라우저 노출 OK)
- `TURNSTILE_SECRET_KEY` — 서버 siteverify용 시크릿 (절대 `NEXT_PUBLIC_` 금지)

두 키는 항상 **함께 설정되거나 함께 비어있음**을 가정한다 (클라 위젯 표시 여부와 서버 강제 여부가 각자의 키 유무로 독립 결정되지만, 운영상 한 쌍).

### 서버 검증 헬퍼 — `src/lib/turnstile.ts`

순수에 가까운 async 함수:

```
verifyTurnstile(token: string | null): Promise<boolean>
```

로직:
1. `TURNSTILE_SECRET_KEY`가 비어있음 → `true` 반환 (스킵)
2. 키 있는데 `token`이 없음/빈 문자열 → `false`
3. `https://challenges.cloudflare.com/turnstile/v0/siteverify`에 `secret` + `response`(token) POST → 응답 JSON의 `success`(boolean) 반환
4. fetch 예외/네트워크 오류 → `false` (fail-closed)

> 정확한 siteverify 요청 형식(form-encoded vs JSON)은 구현 시 Cloudflare 공식 문서로 확인.

### 클라이언트 위젯 — `src/components/TurnstileWidget.tsx`

- props: `onVerify(token: string)` 콜백 (필요 시 `onExpire`/리셋).
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY`가 없으면 **null 렌더** + 부모가 토큰 없이 제출 허용.
- 키가 있으면 Turnstile 스크립트(`https://challenges.cloudflare.com/turnstile/v0/api.js`)를 1회 로드 후 위젯 렌더, 토큰 획득 시 `onVerify` 호출.
- 위젯 언어는 현재 locale 전달.

> 정확한 클라이언트 렌더 API(implicit vs explicit, Next 16 클라 컴포넌트에서 스크립트 로드 방식)는 구현 시 Cloudflare 공식 문서로 확인.

### 등록 폼 통합 — `RegistrationForm`

- 위젯을 **2단계(최종 등록 제출)**에 배치. 보호 대상은 실제 공개 INSERT인 `insertRegistration`.
- `insertRegistration(payload, turnstileToken)` 시그니처 추가. 서버 액션 진입부에서 `verifyTurnstile(token)` 실패 시 `{ ok: false, error: "captchaFailed" }`.
- 1단계 `checkEmail`(boolean 읽기, 데이터 미생성)은 **미보호**. 봇이 UI를 건너뛰고 `insertRegistration`을 직접 호출해도 토큰이 없으면(키 설정 시) 차단됨. checkEmail 남용은 boolean만 노출하므로 허용 위험으로 간주.

### 수정 링크 폼 통합 — `EditRequestForm`

- 현재 클라이언트에서 `supabase.auth.signInWithOtp`를 **직접** 호출 → 이를 **서버 액션으로 이동**해야 Turnstile 서버 검증을 강제할 수 있다.
- `edit/actions.ts`에 신설:

```
requestEditMagicLink({ email, turnstileToken, origin }): Promise<{ ok: true } | { ok: false; error: string }>
```

- 동작: `verifyTurnstile` → 통과 시 서버 클라이언트로 `signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: `${origin}/auth/confirm?next=/edit/manage` } })`.
- `origin`은 클라이언트가 `window.location.origin`을 넘긴다. Supabase Redirect URL 허용목록이 최종 검증하므로 안전(별도 SITE_URL env 불필요).
- `EditRequestForm`은 `TurnstileWidget` 렌더 + 제출 시 `requestEditMagicLink` 호출로 변경.

### i18n

- `messages/{ko,en,es}.json`에 캡차 실패 메시지 키 추가: `Register.captchaFailed`(등록 폼), `Edit.captchaFailed`(수정 링크 폼) — 기존 폼들이 namespace별 메시지를 쓰므로 동일 패턴. 위젯 자체 UI는 Turnstile `language` 파라미터로 현지화.

---

## Part B — keep-alive cron

### 라우트 — `src/app/api/keep-alive/route.ts` (GET)

- `proxy.ts` matcher가 `api`를 이미 제외 → i18n 로케일 재작성 영향 없음.
- `CRON_SECRET` 환경변수가 설정돼 있으면 요청 헤더 `Authorization: Bearer ${CRON_SECRET}`를 검증, 불일치 시 401. (Vercel Cron은 `CRON_SECRET` 설정 시 이 헤더를 자동 전송.)
- 서버 클라이언트(secret key)로 가벼운 쿼리 실행 — 예: `attendees`에 head count 1건 — DB 활동 발생.
- 성공 시 200 + 작은 JSON(`{ ok: true }`), 실패 시 5xx.

> Vercel Hobby cron 제한·`CRON_SECRET` 자동 헤더 동작은 구현 시 Vercel 공식 문서로 확인.

### `vercel.json`

```json
{
  "crons": [
    { "path": "/api/keep-alive", "schedule": "0 6 * * *" }
  ]
}
```

- 매일 06:00 UTC. Vercel Hobby는 cron 하루 1회 제한이며 정확한 분 단위 보장은 없으나, 7일 무활동 방지엔 충분.

---

## Part C — 배포 설정 + 검증

### `.env.example` 추가

```
# Cloudflare Turnstile (공개 폼 봇 방지)
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=

# Vercel Cron keep-alive 보호
CRON_SECRET=
```

### `SETUP.md` 갱신

- Turnstile 키 발급(Cloudflare 대시보드) + 위 env 입력
- `CRON_SECRET` 생성 + Vercel env 등록
- Vercel Cron 동작/배포 메모

### 검증 전략

이 프로젝트는 단위 테스트 하니스가 없으며, 다음 방식으로 검증해 왔다(이번에도 동일):

1. `npx tsc --noEmit` 타입체크
2. `npm run build` 프로덕션 빌드
3. `npm run lint`
4. **Playwright MCP 브라우저 E2E** — 키 없는 로컬에서 등록·수정 플로우가 정상 동작(위젯 미표시, 제출 성공)하는지 확인

`verifyTurnstile`은 순수하게 작성하여 추후 단위 테스트가 쉽도록 한다(이번 범위에선 테스트 하니스 미도입).

---

## 비목표 (이번 범위 아님)

- 실제 Supabase 호스팅 프로젝트 생성 / Google OAuth / Resend SMTP / 이메일 템플릿 — **사용자의 대시보드 작업** (별도 런북으로 안내)
- 온라인 결제, 추가 기능

## 사용자(대시보드) 작업 — 코드 완료 후 안내 예정

- Cloudflare에서 Turnstile 사이트 생성 → 사이트 키/시크릿 키 발급 → Vercel env 등록
- `CRON_SECRET` 임의 문자열 생성 → Vercel env 등록
- (기존 SETUP.md) Supabase 호스팅, Google OAuth, Resend SMTP, URL Configuration, Vercel 배포
