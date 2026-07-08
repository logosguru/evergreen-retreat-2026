# 일정 "언어별 진행" 표시 설계

## Context (배경)

수련회 일정(`schedule_items`) 중 일부 순서(예: 성경공부)는 한/영/스페인어 그룹별로
장소가 흩어져 따로 진행된다. 현재 일정은 이를 구분할 방법이 없어 참석자가 자기 언어
그룹으로 가야 하는 순서인지 알 수 없다. 이 기능은 관리자가 그런 순서에 체크박스로
"언어별 진행" 표시를 달고, 공개 일정에서 badge로 구분해 보여준다.

## 확정된 결정사항

| 항목 | 결정 |
|---|---|
| 데이터 | `schedule_items.by_language boolean not null default false` (0016) |
| 관리자 입력 | 날짜·시간 옆 체크박스 1개 ("언어별 진행") |
| 공개 표시 | 제목 옆 **badge** (locale별 문구) + 항목 살짝 다른 톤(좌측 보더/배경) |
| badge 문구 | `언어별 진행` / `By Language` / `Por idioma` (i18n 키 1개) |
| 권한 | 관리자 전용 — 기존 schedule_items 관리자쓰기 RLS + 서버 액션 화이트리스트 |

## 데이터 — `supabase/migrations/0016_schedule_by_language.sql`

```sql
-- 언어별로 흩어져 진행하는 순서(성경공부 등) 표시. 기본 false.
alter table public.schedule_items
  add column by_language boolean not null default false;
```

`ScheduleItem` 타입(`src/lib/types.ts`)에 `by_language: boolean` 추가(`sort_order` 뒤).

## 서버 액션 — `src/app/[locale]/admin/schedule-actions.ts`

`upsertScheduleItem`의 입력 타입과 화이트리스트 payload에 `by_language: boolean` 추가.
기존 컬럼들과 동일하게 관리자 전용(RLS + 이 액션에서만 전송). 다른 로직 무변경.

## 관리자 UI — `src/components/ScheduleManager.tsx`

- state에 `byLanguage: boolean` 추가(기존 `day`/`time`과 나란히). `reset()`에서 false로.
- 날짜/시간 입력 옆에 체크박스 + 라벨(`t("byLanguageLabel")`): "언어별 진행".
- 저장 시 `upsertScheduleItem({ ..., by_language: byLanguage })`.
- 편집 진입(`edit(it)`)에서 `setByLanguage(it.by_language)`.
- 목록 행에도 체크된 항목은 badge 텍스트를 작게 표기(관리자가 상태 확인용, 선택).

## 공개 UI — `src/components/ScheduleView.tsx`

- `item.by_language`가 true면 제목 옆에 badge 렌더: `t("byLanguageBadge")`.
  스타일 예: `inline-flex rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700`.
- 해당 항목 컨테이너에 좌측 보더/배경 톤 추가(예: `border-l-2 border-indigo-300 pl-…`)로
  목록에서 눈에 띄게. false 항목은 기존 스타일 그대로(회귀 없음).

## i18n — `Schedule` 네임스페이스 (ko/en/es 파리티)

- `byLanguageBadge`: `언어별 진행` / `By Language` / `Por idioma` (공개 badge).
- `byLanguageLabel`: `언어별 진행` / `By language` / `Por idioma` (관리자 체크박스 라벨).

## 검증 (Verification)

- **마이그레이션**: `supabase db reset` → `by_language` 컬럼 존재·기본 false. 기존 행 전부 false.
  비관리자(anon/authenticated) UPDATE 차단(기존 RLS·guard 유지) 확인.
- **관리자**: 체크박스 체크→저장→행에 반영, 재편집 시 체크 상태 유지, 해제→저장→false.
- **공개**: by_language=true 항목에 badge + 톤 표시, false는 미표시. ko/en/es badge 문구.
- tsc/lint/build, ko/en/es 키 파리티.

## 범위 밖 (후속)

- 언어 그룹별 장소를 항목 하나에 여러 개 담기 — 지금은 location 필드로 관리자가 자유 기술.
- badge 필터/토글(공개에서 언어별 순서만 보기) — 후속 후보.
