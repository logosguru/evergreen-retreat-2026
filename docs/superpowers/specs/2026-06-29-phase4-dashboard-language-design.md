# Phase 4 — 대시보드 + 성도 언어 구분 설계

## Context (배경)

Phase 1~3 완료(등록·인증·참석자 관리·방 배치·회비·콘텐츠). Phase 4는 교역자/준비위원용 **대시보드**
(등록·방 배정·회비 집계 한눈에)와, 언어별 일정 운영을 위한 **성도 언어 구분**(한국어/영어/Spanish)을
추가한다.

언어는 **사이트 UI 로케일(ko/en)과 별개 개념** — 성도가 쓰는 언어를 기록하는 데이터 속성이다.
Spanish 화자(~20명)를 위해 언어별 일정을 따로 운영할 계획이며, Spanish **UI 번역은 ko/en 완성 후**
도입(이번 범위 밖). 이번엔 언어 **데이터 옵션**(ko/en/es)만 마련한다.

## 확정된 결정사항

| 항목 | 결정 |
|---|---|
| 언어 수집 | **관리자 지정** — 등록 폼/성도 수정엔 없음. 관리자가 참석자 화면에서 부여 |
| 언어 모델 | `attendees.language` enum `language_t('ko','en','es')`, **기본값 'ko'**(다수), 관리자 전용 컬럼 |
| 언어 UI 번역 | ko/en 라벨만(`Language` 네임스페이스). **Spanish UI 번역은 범위 밖** |
| 대시보드 위치 | **`/admin` = 대시보드**, 기존 참석자 목록은 `/admin/attendees`로 이동 |
| 대시보드 카드 | 등록 현황 · 언어별 분포 · 방 배정 현황 · 회비 현황 · (보조) 구역별·직분별 |
| 집계 | `lib/dashboard.ts` 순수 함수, `fees.ts`(personFee/groupHouseholds) 재사용 |
| 차트 | 라이브러리 없이 숫자/막대(Tailwind)로 표현 |

## 1. 데이터 모델 — `supabase/migrations/0007_language.sql`

```sql
create type public.language_t as enum ('ko', 'en', 'es');  -- 한국어/영어/Spanish

alter table public.attendees
  add column language public.language_t not null default 'ko';
```

**guard 트리거 갱신**: `public.guard_privileged_cols`(BEFORE UPDATE)는 비관리자 UPDATE 시 관리자 전용
컬럼을 OLD로 복원한다. 현재 보호 컬럼(paid, paid_at, retreat_group, is_group_leader,
is_householder, householder_id, room_id)에 **`language` 추가**:
```sql
-- create or replace function public.guard_privileged_cols ... 내부에 추가:
--   if not public.is_admin() then ... new.language := old.language; ... end if;
```
구현 시 현재 함수 본문을 읽어 `new.language := old.language;` 한 줄을 보호 블록에 추가(나머지 로직 보존).

> RLS는 컬럼 단위 제한을 못 하므로, 비관리자(성도)가 자가수정으로 language를 바꾸지 못하도록 트리거로
> 보호. 등록(anon INSERT)은 default 'ko'로 들어가고, 성도 수정 폼엔 language 필드가 없다.

## 2. 타입 — `src/lib/types.ts`
```ts
export const LANGUAGES = ["ko", "en", "es"] as const;
export type Language = (typeof LANGUAGES)[number];
// Attendee 인터페이스에 추가:
//   language: Language;
```

## 3. 언어 지정 UI (관리자)

- 서버 액션 `src/app/[locale]/admin/actions.ts`에 추가:
  `setLanguage(id: string, language: Language): Promise<{ ok: boolean }>` (setPaid와 동일 패턴).
- `AdminAttendeeTable`(이제 `/admin/attendees`에서 렌더)의 사람별 `<tr>`에 **언어 `<select>` 열** 추가
  (옵션 ko/en/es, 라벨은 `Language` 네임스페이스). 변경 시 `setLanguage` 호출 후 `router.refresh()`.
  (방 배정/납부 토글과 동일한 낙관적 패턴.)

## 4. 대시보드 (`/admin`)

### 집계 — `src/lib/dashboard.ts` (순수 함수, 테스트 용이)
입력: `AttendeeWithRoom[]`(attendees + rooms + room_types) + `Room[]`/`RoomType[]`(정원 합계용).
출력 `DashboardStats`:
- **등록**: `totalPeople`, `households`, `under6`, `full`, `partial`
- **언어**: `{ ko, en, es }` 인원 수
- **방 배정**: `assigned`, `unassigned`(6세미만 제외), 타입별 `{ name, occupied, capacityTotal, roomCount }[]`
- **회비**: `grandTotal`(배정분 합계), `paidTotal`(납부 가구 합계), `unpaidTotal`, `paidHouseholds`, `totalHouseholds`
- **보조**: `byDistrict`(구역→인원), `byRole`(직분→인원)

`fees.ts`의 `personFee`/`groupHouseholds` 재사용. 금액은 `formatUSD`.

### UI — `src/components/AdminDashboard.tsx`
- 반응형 카드 그리드(요약 숫자 + 간단 막대/비율). 미배정·미납은 강조색.
- `/admin/page.tsx`(서버 컴포넌트)에서 attendees+rooms+room_types 조회 → `lib/dashboard.ts`로 집계 →
  `<AdminDashboard stats={...} />`. 로그아웃 버튼 유지.

## 5. IA / 라우팅
- `/admin` → 대시보드. 기존 목록 로직은 `src/app/[locale]/admin/(protected)/attendees/page.tsx`로 이동
  (현 `page.tsx` 내용 → attendees/page.tsx, page.tsx는 대시보드로 교체).
- protected `layout.tsx` 서브내비: **대시보드**(`/admin`) · **참석자**(`/admin/attendees`) · 객실 · 방배치 · 일정 · FAQ.
  - 주의: 대시보드(`/admin`)와 참석자(`/admin/attendees`)는 `/admin` prefix가 겹치므로, 활성 표시를
    쓰면 정확 매칭 처리(쓰지 않으면 무관).

## 6. i18n — `messages/{ko,en}.json`
- `Admin`: `navDashboard`("대시보드"/"Dashboard"), `navAttendees`는 `/admin/attendees`로 연결(라벨 유지),
  대시보드 카드 제목/라벨 키(예: `dashRegistration`, `dashLanguage`, `dashRooms`, `dashFees`,
  `dashByDistrict`, `dashByRole`, 및 세부 라벨).
- 신규 `Language` 네임스페이스: `ko`("한국어"/"Korean"), `en`("영어"/"English"), `es`("Spanish"/"Spanish").
- ko/en 키 파리티 유지. (es UI 번역은 범위 밖.)

## 7. 검증 (Verification)
- **마이그레이션**: `supabase db reset` → `language` 컬럼/enum/기본값 'ko' 확인. guard 트리거가 비관리자
  UPDATE 시 language를 OLD로 복원(psql: `set role anon`/성도 시뮬레이션 어려우므로, 트리거 함수에
  language 라인 포함 + 기존 보호 컬럼과 동일 동작 확인).
- **언어 지정**: 관리자가 select로 변경 → DB 반영 → 대시보드 언어 분포 갱신.
- **대시보드 수치**: 집계 함수가 등록/언어/방배정/회비/보조 수치를 정확히 산출(샘플 데이터로 대조).
  미배정·미납·점유율 표시.
- **IA**: `/admin` 대시보드, `/admin/attendees` 목록, 서브내비 6개 링크 동작.
- tsc/lint/build, ko/en 키 파리티.

## 8. 범위 밖 (후속)
- Spanish UI 번역(ko/en 완성 후 별도 도입).
- 언어별 실제 일정 분리 운영(이번엔 데이터 기반만 마련; 스케줄 항목에 언어 태깅은 후속).
- 차트 라이브러리, CSV/엑셀 내보내기, 실시간 갱신.
