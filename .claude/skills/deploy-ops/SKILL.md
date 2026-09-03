---
name: deploy-ops
description: 배포·운영 작업(Vercel env 변경, Supabase/Resend/Turnstile/Route53 구성 확인, 로컬 Supabase 재기동, 프로덕션 데이터 확인) 시 참조하는 구성 요약
---

# 배포 / 로컬 운영 구성

배포 LIVE: https://retreat.nyevergreen.com (Vercel 프로젝트 `evergreen-retreat-2026`, Supabase ref `gkdhifnworjtnnubrpft`).

- **배포 구성 요약**: Supabase 마이그레이션 0001~0007 + Access Token Hook(Postgres `custom_access_token_hook`) 활성화 / Google OAuth(관리자, 첫 관리자 logosguru@gmail.com) / Resend SMTP(`send.nyevergreen.com`, sender `noreply@send.nyevergreen.com`) + 매직링크 템플릿(ko/en/es, token_hash→`/auth/confirm`) / URL Config(Site URL=배포 URL) / Turnstile hostnames=retreat.nyevergreen.com+localhost / Route53 CNAME `retreat`→Vercel / Vercel Deployment Protection=Standard(커스텀 도메인 공개).
- **Vercel env(6)**: `NEXT_PUBLIC_SUPABASE_URL`·`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`·`SUPABASE_SECRET_KEY`·`CRON_SECRET`(All) + `NEXT_PUBLIC_TURNSTILE_SITE_KEY`·`TURNSTILE_SECRET_KEY`(Production만). ⚠️ **env 추가/수정 후 반드시 Redeploy** (안 하면 반영 안 됨; 값에 따옴표/공백 섞이면 서버 Supabase 쿼리가 조용히 500).
- **로컬 개발 재기동**: `supabase start` → `npm run dev` (http://localhost:3000). 로컬 키는 `.env.local`(로컬 Supabase + Turnstile 키). 매직링크 메일은 Mailpit http://127.0.0.1:54324. 로컬은 로컬 Supabase를 가리키며 프로덕션과 분리됨.
- **프로덕션 데이터 덤프**: `supabase db dump --linked --data-only --use-copy -s public -f scratchpad/prod-data.sql`
  (Docker Desktop 필요. `scratchpad/`는 gitignore. 개인정보 — 집계 후 삭제).
