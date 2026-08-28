# 데이터 백필 SQL

스키마 변경이 아닌 **프로덕션 데이터 교정** 스크립트를 날짜순으로 보관한다.
(스키마 변경은 `supabase/migrations/`)

실행:

```bash
supabase db query --linked -f scripts/backfill/<파일>.sql
```

각 스크립트는 **컬럼별 "비어 있을 때만 채우기" 가드**를 두어 기존 값을 덮지 않고,
재실행해도 결과가 같도록 작성한다. 적용 전 `--local` 로 픽스처 테스트를 먼저 할 것.

| 파일 | 내용 |
|---|---|
| `2026-08-28-schedule-i18n.sql` | 이름표 QR 언어별 일정 페이지용 — `schedule_items` 의 en/es 누락 9건 백필(식사 5건 Gala Hall/Buffet, 체크인 location_es, 성경공부 1 es, Orientation/Ice Breaker title_en, 'Orientacion'→'Orientación' 악센트 교정) |
