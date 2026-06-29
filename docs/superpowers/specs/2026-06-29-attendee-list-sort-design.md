# 참석자 정렬 표 설계

## Context (배경)

관리자 참석자 화면(`/admin/attendees`, `AdminAttendeeTable`)은 현재 **가구 카드 묶음**이다.
참석자가 늘면 훑어보기 어렵고, 참석형태/방/언어 같은 **사람 단위 속성**으로 정렬할 수단이 없다.
이 작업은 카드 묶음을 **사람당 1행 정렬 표**로 교체하고, 참석·방·언어 정렬과 구역(소속) 열을 추가한다.

## 확정된 결정사항

| 항목 | 결정 |
|---|---|
| 뷰 | 가구 카드 → **평탄 표(사람당 1행)**. 상단 요약줄(총원·납부가구·총회비) 유지 |
| 정렬 | **참석 · 방(타입 기준) · 언어** 3개 헤더 클릭 정렬(asc↔desc). 기본=가구별 묶음 |
| 구역 | **구역(district) 열 추가**(표시 전용, 정렬 대상 아님). "소속 기관"=현 구역 필드로 해석 |
| 회비·납부 | 둘 다 유지 — 회비=사람별 금액, 납부=가구 단위 토글(가구원 행에서도 같은 가구 토글) |
| 언어 | 기존 인라인 셀렉트 유지 |
| 정렬 처리 | **클라이언트**(표가 이미 client 컴포넌트). 서버 정렬·페이지네이션은 범위 밖 |

## 컴포넌트 / 데이터 흐름

- `src/app/[locale]/admin/(protected)/attendees/page.tsx`: 기존대로 attendees 조회 + `groupHouseholds`로 요약줄 계산은 유지하되, **표에는 평탄 배열을 전달**하도록 변경:
  `<AdminAttendeeTable attendees={attendees} />` (props가 `households` → `attendees: AttendeeWithRoom[]`로 변경).
- `src/components/AdminAttendeeTable.tsx`: 전면 재작성.
  - props: `{ attendees: AttendeeWithRoom[] }`.
  - **가구 맵**: `is_householder`인 행으로 `id → { name: korean_name, paid }` 맵 구성. 각 행의 가구주 id =
    `a.is_householder ? a.id : a.householder_id`. "가구" 열엔 가구주 이름, 납부 토글은 그 가구주 기준.
  - 정렬 상태 `useState<{ key: SortKey | null; dir: "asc" | "desc" }>`(`SortKey = "attendance" | "room" | "language"`), 기본 `{ key: null, dir: "asc" }`.

## 컬럼 (좌→우)

| 헤더(i18n) | 내용 | 정렬 |
|---|---|---|
| `colName` 이름 | 한글이름 + 6세미만 배지 | — |
| `colHousehold` 가구 | 가구주 이름(가구주 행엔 `householder` 태그) | — |
| `colRole` 직분 | role 라벨(`Role`) | — |
| `colDistrict` 구역 | district 라벨(`District`), 없으면 — | — |
| `colAttendance` 참석 | 전일/부분 배지(`Attendance`) | ✅ |
| `colRoom` 방 *(신규 키)* | 호실 라벨(`rooms.label`), 미배정은 `Rooms.unassigned` | ✅(방 타입 기준) |
| `colLanguage` 언어 *(신규 키)* | 언어 셀렉트(`Language`), `setLanguage` 인라인 | ✅ |
| `colPaid` 회비 | `personFee`(6세미만 면제·미배정 미산정, `Fee.exempt/pending`) | — |
| `colPayment` 납부 *(신규 키)* | 가구 paid 배지(클릭=가구 토글, `setPaid`) | — |

## 정렬 규칙 (클라이언트)

- **헤더 클릭**: 같은 키 재클릭 시 dir 토글(asc→desc), 다른 키 클릭 시 그 키 asc. 활성 헤더에 ▲/▼ 표시.
- **기본(key=null)**: 가구별 묶음 — `[가구주이름, 가구주먼저(desc), created_at]` 순. 가족이 인접하게.
- **attendance**: full=0 < partial=1 (asc=전일 먼저). 동순위 tiebreak = `korean_name`.
- **room(타입)**: 정렬 키 = `rooms.room_types.name`; **미배정은 항상 맨 뒤**(asc/desc 무관). 같은 타입 내 tiebreak = `rooms.label` → `korean_name`.
- **language**: `LANGUAGES` 인덱스(ko<en<es) 기준. tiebreak = `korean_name`.
- desc는 비교 결과 부호 반전(미배정-맨뒤 규칙은 유지).

## i18n — `Admin`에 키 추가 (ko/en)
- `colRoom`("방"/"Room"), `colLanguage`("언어"/"Language"), `colPayment`("납부"/"Payment").
- 나머지 헤더는 기존 키 재사용(`colName/colHousehold/colRole/colDistrict/colAttendance/colPaid`). 값 라벨은 `Role/District/Attendance/Language/Fee` 재사용. ko/en 파리티 유지.

## 검증 (Verification)
- **정렬 로직**: node로 비교 함수 검증 — attendance(full 먼저), room(타입 정렬 + 미배정 맨뒤, desc에서도 미배정 맨뒤), language(ko<en<es), 기본=가구 묶음. asc/desc 토글.
- **인라인 동작**: 언어 셀렉트 변경 → setLanguage, 납부 배지 클릭 → 해당 가구 setPaid(가구원 행에서도 동일 가구 토글).
- **표시**: 구역 열, 참석 배지, 6세미만 배지, 미배정 라벨, 회비(면제/미산정).
- tsc/lint/build, ko/en 키 파리티. 관리자 브라우저 확인은 컨트롤러 통합 단계.

## 범위 밖 (후속)
- 서버사이드 정렬·페이지네이션, 다중 컬럼 정렬, 검색/필터.
- 별도 "소속 기관" 필드(현재는 구역으로 대체). 필요 시 후속.
