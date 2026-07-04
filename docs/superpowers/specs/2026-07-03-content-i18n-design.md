# 일정·FAQ 다국어(ko/en/es) 콘텐츠 — 설계

날짜: 2026-07-03
상태: 승인됨 (구현 대기)

## 배경 / 문제

`schedule_items`(제목·설명·장소)와 `faqs`(질문·답변)는 단일 텍스트 컬럼이라,
관리자가 입력한 값이 `/`, `/en`, `/es` 모든 언어 페이지에 그대로 노출된다.
언어별로 다른 텍스트를 보여줄 방법이 없다.

## 확정 결정사항

| 항목 | 결정 |
|---|---|
| 적용 범위 | 일정(schedule_items) + FAQ(faqs) 둘 다 |
| 저장 방식 | 언어별 컬럼 추가 (`*_en`, `*_es`) — jsonb/번역 테이블 아님 |
| 필수 여부 | 한국어(기존 컬럼)만 필수. en/es는 선택 |
| Fallback | en/es 값이 비어 있으면 한국어 원본 표시 (현재 동작과 동일 → 기존 데이터 안전) |
| 관리자 폼 | 세 언어를 한 폼에서 동시 입력. 언어 행 라벨은 "한국어 / English / Español" 원어 고정 표기 |

## 1) 스키마 — `supabase/migrations/0012_content_i18n.sql`

```sql
alter table public.schedule_items
  add column title_en text, add column title_es text,
  add column description_en text, add column description_es text,
  add column location_en text, add column location_es text;

alter table public.faqs
  add column question_en text, add column question_es text,
  add column answer_en text, add column answer_es text;
```

- 전부 nullable `text`. 기존 컬럼(`title`, `description`, `location`, `question`, `answer`)이 한국어 원본.
- RLS 변경 없음 — 기존 정책이 테이블 단위(공개 읽기 / 관리자 쓰기)라 새 컬럼에 그대로 적용된다.

## 2) 타입 + fallback 헬퍼

- `src/lib/types.ts`: `ScheduleItem`에 `title_en/title_es/description_en/description_es/location_en/location_es`,
  `Faq`에 `question_en/question_es/answer_en/answer_es` — 전부 `string | null` 옵션 필드 추가.
- 새 파일 `src/lib/localized.ts`:

```ts
localized(item, field, locale): string | null
// locale이 "en"/"es"이고 item[`${field}_${locale}`]가 비어 있지 않으면 그 값,
// 아니면 item[field] (한국어 원본) 반환. trim 후 빈 문자열은 미입력으로 간주.
```

- fallback 규칙은 이 헬퍼 한 곳에서만 관리. 공개 컴포넌트는 전부 이 함수를 쓴다.

## 3) 관리자 폼

- `ScheduleManager`: 날짜·시간 입력은 현행 유지. 그 아래 언어별 3행
  (한국어 / English / Español — 각 행에 제목·장소·설명 input). 한국어 제목만 필수(현행 검증 유지).
  수정 모드 진입 시 en/es 값도 채워 넣는다.
- `FaqManager`: 질문 input + 답변 textarea를 언어별 3세트 스택. 한국어 질문·답변만 필수(현행 검증 유지).
- 서버 액션 `schedule-actions.ts` / `faq-actions.ts`: upsert 페이로드·화이트리스트에 새 컬럼 추가.
  빈 문자열은 `null`로 정규화해 저장.
- `messages/{ko,en}.json`: 필요한 새 라벨만 추가(언어명 라벨은 원어 고정이라 번역 키 불필요).

## 4) 공개 표시

- `ScheduleView`, `ScheduleSection`, `FaqSection`에서 `useLocale()` + `localized()`로 표시.
- location·description은 localized 결과가 없으면(원본도 null) 현행처럼 미표시.

## 5) 검증

1. 로컬 Supabase에 마이그레이션 적용 (`supabase migration up`)
2. `npx tsc --noEmit` + `npm run lint`
3. 로컬 admin에서 일정·FAQ를 3개 언어로 입력 → `/`, `/en`, `/es`에서 각 언어 표시 확인
4. en/es를 비워 둔 항목이 영어/스페인어 페이지에서 한국어로 fallback 되는지 확인

## 범위 외 (YAGNI)

- 강사/소개 등 정적 페이지(이미 messages 기반 i18n), es UI 메시지 번역, 언어 추가 일반화(3개 고정).
