# 호텔 제출용 예상 방 갯수 섹션 — 설계

날짜: 2026-08-02

## 배경 / 문제

호텔(Honor's Haven)에 **내일까지** 대략적인 예약 방 갯수를 전달해야 한다. 그런데 등록
마감까지 시간이 남아 있어 상당수 가구가 아직 객실 타입(2/3/4인실)을 선택하지 않았다.

관리자가 지금 필요한 것: **현재 등록 데이터 + 미선택 가구에 대한 가정**을 합쳐서
"호텔에 이 숫자를 주면 된다"는 방 갯수 하나. 그리고 그 숫자가 어디서 나왔는지
호텔과 통화하며 설명할 수 있는 근거(타입별 내역).

이 섹션은 **예약 협상용 추정치**다. 실제 물리적 배정은 기존 `/admin/assignments`
보드가 담당하며 이 섹션은 그것을 대체하지 않는다.

## 확정된 결정사항

| 항목 | 결정 | 근거 |
|---|---|---|
| 가구 묶는 규칙 | 가구 단위 + 1~2인 소가구는 성별 합방 | 가족은 다른 가구와 절대 안 섞음. 소가구만 합쳐 방 낭비 방지. 실제 배정과 가장 가까움 |
| 6세 미만 | 방 정원 미집계 | 기존 회비·정원 규정과 동일. 호텔엔 유아 동반 별도 고지 |
| 미선택 가구 가정 | 화면에서 2/3/4인실 전환, 기본 4인실 | 호텔과 통화하며 시나리오 비교. DB 저장 없음 |
| 부분참석(partial) | 전원 숙박으로 계산 | 도착·여정 날짜가 대부분 미입력이라 추정이 오히려 부정확. 방은 줄이는 게 쉬움 |
| 확정 / 가정 | 서로 합방 안 함, 분리 집계 | "확정 N방 + 가정 M방" 이 호텔 통화에서 읽기 쉽고, 오차가 안전한 방향(높게)으로 남음 |

## 계산 로직 — `src/lib/hotel-estimate.ts` (신규, 순수 함수)

```
estimateHotelRooms(attendees: AttendeeWithRoom[], assumedCapacity: 2|3|4): HotelEstimate
```

입력은 `withHouseholdRoomType()` 전처리 후의 행들. `groupHouseholds()` 재사용.

### 가구별 정원 집계 인원 (occupancy)

`!is_under_6` 인 가구원 수. 6세 미만은 별도 카운트만 하고 정원 수식에 절대 넣지 않는다.

### 두 그룹으로 분리 (서로 합방하지 않음)

- **확정** — 가구주에 `requested_room_type_id` 있는 가구 → 그 타입의 `capacity`(2/3/4) 버킷
- **가정** — 미선택 가구 → 전부 `assumedCapacity` 버킷

### 버킷 내부: 두 경로

| 가구 조건 | 경로 | 방 수 |
|---|---|---|
| occupancy ≥ 3 | 가족 전용방 | `ceil(occ / capacity)` |
| occupancy ≤ 2, 정원 집계 인원이 **모두 동일 성별** | 성별 합방 풀 | 풀에서 계산 |
| occupancy ≤ 2, **혼성** (부부 등) | 가족 전용방 | 1 |
| occupancy ≤ 2, **성별 미입력 포함** | 가족 전용방 | 1 |

성별 합방 풀: 키 = `(capacity, gender)`, 방 수 = `ceil(Σ 풀 내 occupancy / capacity)`.

성별 미입력은 안전하게 합칠 수 없으므로 전용방으로 처리(보수적). 대신
`unknownGenderHouseholds` 로 노출해서, 성별을 채우면 추정치가 줄어든다는 걸
관리자가 알 수 있게 한다.

### 엣지 케이스

- **occupancy 0 가구** (전원 6세 미만): 방 0개. 버킷에는 **전혀 넣지 않고**
  (households·people 집계에도 포함 안 함) `zeroOccupancyHouseholds` 로만 카운트해
  노출한다. 타입을 선택한 가구여도 동일 — 정원 집계 인원이 0이면 방이 필요 없다.
- `assumedCapacity` 는 2|3|4 리터럴 유니온 — 잘못된 값이 들어올 경로를 타입으로 차단.

### 반환 타입

```ts
type EstimateBucket = {
  capacity: 2 | 3 | 4;
  households: number;
  people: number;       // 정원 집계 인원
  familyRooms: number;
  sharedRooms: number;
  rooms: number;        // familyRooms + sharedRooms
};

type HotelEstimate = {
  decided: EstimateBucket[];        // capacity 오름차순, 인원 0인 버킷은 제외
  assumed: EstimateBucket | null;   // 미선택 가구 없으면 null
  totalRooms: number;
  totalPeople: number;              // 정원 집계 인원 합
  under6: number;
  partialCount: number;
  unknownGenderHouseholds: number;
  zeroOccupancyHouseholds: number;
  assumedCapacity: 2 | 3 | 4;
};
```

## UI — `src/components/HotelEstimate.tsx` (클라이언트 컴포넌트)

`/admin` 대시보드 기존 카드들 아래 섹션으로 배치.

- 클라이언트 컴포넌트인 이유: `assumedCapacity` 토글이 **로컬 state만** 사용.
  DB 저장·서버 액션 없음. 전체 `attendees` 행을 props로 받아 브라우저에서 재계산.
- 구성:
  - 헤드라인: **총 예상 방 N개**
  - 표: 확정 타입별 행 → 가정 행(가정임이 드러나는 라벨) → 합계 행.
    각 행에 가구수·인원·방수. 가족방/합방 분해는 부제로.
  - 토글: `2인실 / 3인실 / 4인실` (미선택 가정), 기본 4인실
  - 각주: 6세 미만 N명 정원 미집계·호텔 별도 고지 / 부분참석 N명 포함 /
    성별 미입력 N가구 전용방 처리 / 합방 규칙 한 줄 / 전원 6세미만 가구 N (0이면 숨김)

각주는 값이 0인 항목은 렌더하지 않는다(노이즈 방지).

## 데이터 배관

`RoomTypeLite`(`src/lib/fees.ts`)에 `capacity: number` 추가하고, `/admin` 페이지의
`requested_room_type:room_types!requested_room_type_id(...)` embed에 `capacity` 추가.

`personFee()` 는 `price_per_person` 만 읽으므로 영향 없음. `rooms(...)` embed의
`room_types` 는 이미 `capacity` 를 다른 경로(`RoomForStats`)에서 쓰고 있어 무관.

## i18n

`messages/{ko,en,es}.json` 에 `HotelEstimate` 네임스페이스 신설.
기존 규칙대로 DB엔 영문 토큰, 화면 라벨만 번역. `useTranslations` 는 컴포넌트 상단 호출.

## 검증

**단위 테스트 (이 저장소 JS 첫 테스트).** Node 26은 타입 스트리핑이 기본이라
의존성 추가 없이 `node --test src/lib/hotel-estimate.test.ts` 로 실행된다.
`package.json` 에 `"test": "node --test \"src/**/*.test.ts\"` 스크립트 추가
(글롭을 셸이 아닌 Node가 해석하도록 따옴표로 감싼다).

커버할 분기:
- occupancy ≥ 3 가구 → `ceil` (예: 5명/4인실 = 2방)
- 동일 성별 1~2인 가구 합방 (남 1+1+1 → 4인실 1방)
- 혼성 2인 가구(부부) → 전용방 1
- 성별 미입력 → 전용방 1 + `unknownGenderHouseholds` 증가
- 전원 6세 미만 가구 → 0방 + `zeroOccupancyHouseholds` 증가
- 확정/가정 그룹이 서로 합방되지 않음 (같은 capacity·성별이어도 별도 방)
- `assumedCapacity` 전환 시 가정 버킷만 변화
- 6세 미만이 정원에서 빠지는지 (성인 4 + 유아 1, 4인실 → 1방)

**런타임 검증.** 타입체크·빌드 통과만으론 부족(과거 교훈: 빌드 green ≠ 런타임).
로컬 Supabase에 가족·독신·미선택이 섞인 fixture를 시드하고 `npm run dev` 로
`/admin` 을 실제로 열어 섹션 렌더와 토글 동작을 눈으로 확인한다.

## 범위 밖 (의도적 제외)

- **복사 버튼** — 호텔 이메일용 요약 텍스트 복사. 숫자를 얻는 데 불필요.
- **객실 등급(room_grades) 축** — Premium/Luxury/Junior suite 쿼터는 별개 축.
  호텔에 줄 숫자는 인원별 타입(2/3/4인실) 기준.
- **날짜별(1박차/2박차) 분리** — 부분참석을 전원 숙박으로 계산하기로 했으므로 불필요.
- **DB 스키마 변경** — 마이그레이션 없음. 읽기 전용 집계 + 화면 state.
