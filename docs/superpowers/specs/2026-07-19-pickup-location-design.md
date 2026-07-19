# 차량(교회 밴) 픽업 신청 — 설계

2026-07-19 · 상태: 승인 대기

## 목적

수련회장까지 교회 밴 이용이 필요한 참석자를 등록 단계에서 파악한다.
참석자 개인별로 "차량 필요" 여부를 선택(optional)하고, 필요 시 픽업 장소
(Manhattan / Flushing / Long Island(교회)) 중 하나를 필수로 고른다.
관리자는 참석자 목록에서 개인별 픽업 장소를 보고, 대시보드에서 장소별
인원을 집계해 밴 운영을 계획한다.

## 확정 결정사항

| 항목 | 결정 |
|---|---|
| 단위 | **사람별** (attendees 행마다) |
| 장소 | `manhattan` / `flushing` / `long_island` 3개 enum 토큰 (라벨은 i18n) |
| 필수 여부 | 차량 필요 자체는 선택. **체크 시 장소는 필수** |
| 데이터 모델 | **컬럼 하나** — `pickup_location` nullable enum. `NULL` = 차량 불필요. 별도 boolean 없음 → "필요인데 장소 없음" 모순 상태가 스키마 레벨에서 불가능 |
| 노출 범위 | 신규 등록 + 본인 수정 + 관리자 신규/수정 폼, `/admin/attendees` 열, `/admin` 대시보드 집계 카드 |
| 권한 | 성도 본인 수정 가능한 일반 컬럼 (guard 트리거 대상 아님) |

## 변경 사항

### 1. DB — `supabase/migrations/0020_pickup_location.sql`

- enum 타입 `pickup_location`: `'manhattan' | 'flushing' | 'long_island'`
- `attendees.pickup_location pickup_location NULL` 컬럼 추가
- RLS/guard 변경 없음 (기존 정책이 행 단위로 이미 커버, 관리자 전용 컬럼 아님)

### 2. 타입/공유 로직

- `src/lib/types.ts`: `PICKUP_LOCATIONS` 상수 배열 + `PickupLocation` 타입 +
  `Attendee.pickup_location: PickupLocation | null`
- `src/lib/attendee-rows.ts`:
  - `PersonInput.pickup_location?: PickupLocation | ""` 추가
  - `rowFor()`에 `pickup_location: p.pickup_location || null` 매핑
  - 서버 검증: 값이 있으면 `PICKUP_LOCATIONS`에 포함되는지 확인(아니면 거부).
    "체크했는데 장소 없음"은 클라이언트에서 차단하고, 서버로는 장소 토큰만
    전달되므로(체크 해제 = 빈값) 데이터 모델이 모순을 막는다.

### 3. 폼 — `src/components/PersonFields.tsx` (4개 폼 공용)

- "차량 필요 (교회 밴)" 체크박스 — 기본 해제
- 체크 시 픽업 장소 select 노출(3개 옵션, 부분참석 날짜 필드와 같은 조건부
  패턴). 장소 미선택 상태로 제출 시 해당 폼의 기존 검증 방식대로 차단
- 체크 해제 시 `pickup_location`을 빈값으로 리셋 (stale 값 방지)
- `emptyPerson()`에 초기값 추가
- 기존 값 → 폼 초기값 매핑(`EditForm`, `AdminEditForm` 등 attendee→PersonInput
  변환 지점)에 `pickup_location` 추가

### 4. 관리자 화면

- `src/components/AdminAttendeeTable.tsx`: "차량" 열 — 장소 라벨, 불필요 시 `—`
- `src/lib/dashboard.ts` `computeDashboard()`: 장소별 픽업 인원 집계 추가
- `src/components/AdminDashboard.tsx`: 픽업 집계 카드 (장소별 인원 + 합계)

### 5. i18n — `messages/{ko,en}.json`

- `Fields`: 체크박스 라벨("차량이 필요해요 (교회 밴)" / "I need a ride (church van)"),
  장소 select 라벨
- `Pickup`: `manhattan` → "Manhattan", `flushing` → "Flushing",
  `long_island` → "Long Island (교회)" / "Long Island (Church)"
- `Admin`(대시보드): 픽업 카드 제목·합계 문구
- es UI 번역은 기존 방침대로 후속 (ko/en만)

## 오류 처리

- 서버 액션: `pickup_location` 값이 3개 토큰 외이면 검증 오류 반환
- 클라이언트: 체크 상태에서 장소 미선택이면 제출 차단

## 테스트/검증

- `npx tsc --noEmit` + `npm run lint` + `npm run build`
- 로컬 Supabase(`supabase start`)에 0020 적용 후 실동작:
  1. 신규 등록(개인·가구)에서 체크→장소 선택→제출→DB 값 확인
  2. 체크 없이 제출 → `NULL`
  3. 본인 수정 폼에서 값 로드·변경·해제
  4. 관리자 수정/신규 폼 동일 확인
  5. `/admin/attendees` 열, `/admin` 집계 카드 표시 확인
