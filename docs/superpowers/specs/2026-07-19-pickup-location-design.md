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

- enum 타입 `pickup_location_t`(기존 `language_t` 관례): `'manhattan' | 'flushing' | 'long_island'`
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

- **단일 select 하나**: "차량 픽업 (교회 밴)" — 기본 옵션 "필요 없음" +
  장소 3개. (계획 단계 수정: 체크박스+조건부 select 안은 체크박스 상태가
  `PersonInput` 밖의 UI 전용 상태라 "체크했는데 장소 미선택" 차단을 4개
  폼에 각각 구현해야 함. 단일 select는 그 모순 상태 자체가 표현 불가 →
  Q3-A "필요 시 장소 필수"가 구조적으로 보장됨)
- 안내 문구: 교회 밴 운영 예정, 픽업 필요 시 장소 선택
- `emptyPerson()`에 초기값(`""` = 필요 없음) 추가
- 기존 값 → 폼 초기값 매핑(`EditForm`, `AdminEditForm`의 attendee→input
  변환 지점)에 `pickup_location` 추가

### 4. 관리자 화면

- `src/components/AdminAttendeeTable.tsx`: "차량" 열 — 장소 라벨, 불필요 시 `—`
- `src/lib/dashboard.ts` `computeDashboard()`: 장소별 픽업 인원 집계 추가
- `src/components/AdminDashboard.tsx`: 픽업 집계 카드 (장소별 인원 + 합계)

### 5. i18n — `messages/{ko,en,es}.json`

- `Fields`: select 라벨("차량 픽업 (교회 밴)"), "필요 없음" 옵션, 안내 문구
- `Pickup`: `manhattan` → "Manhattan", `flushing` → "Flushing",
  `long_island` → "Long Island (교회)" / "Long Island (Church)" /
  "Long Island (Iglesia)"
- `Admin`: 참석자 테이블 "차량" 열 제목 + 대시보드 픽업 카드 문구
- (계획 단계 수정: Spanish UI가 이미 완성돼 `messages/es.json`에 `Fields`가
  존재 → 키 누락 시 es 화면이 깨지므로 es도 함께 추가)

## 오류 처리

- 서버: `pickup_location` 값이 3개 토큰 외이면 `null`(차량 불필요)로 정규화
  (`cleanPickup()` — 위조 요청만 해당, 정상 UI에선 발생 불가. DB enum이
  최종 방어선)
- 클라이언트: 단일 select 구조상 잘못된 상태 입력 자체가 불가능

## 테스트/검증

- `npx tsc --noEmit` + `npm run lint` + `npm run build`
- 로컬 Supabase(`supabase start`)에 0020 적용 후 실동작:
  1. 신규 등록(개인·가구)에서 체크→장소 선택→제출→DB 값 확인
  2. 체크 없이 제출 → `NULL`
  3. 본인 수정 폼에서 값 로드·변경·해제
  4. 관리자 수정/신규 폼 동일 확인
  5. `/admin/attendees` 열, `/admin` 집계 카드 표시 확인
