# 관리자 참석자 관리 개선 — 방 라벨 · 티셔츠 사이즈 · 강사 회비 면제

**날짜**: 2026-08-09
**범위**: 관리자(`/admin`) 참석자 관리 + 회비 계산 규칙 + Excel 내보내기

## 배경

수련회 운영 단위가 "가구(가족)"에서 "방(같은 객실을 쓰는 묶음)"으로 옮겨갔다.
데이터 모델은 이미 이 형태를 그대로 표현할 수 있으므로(자기참조 `householder_id` 묶음),
**스키마는 그대로 두고 관리자 화면 문구만 바꾼다.**

또한 (1) 참석자 티셔츠를 배부하므로 사이즈를 기록해야 하고,
(2) 초청 강사 목사님들도 방 배정을 받으려면 참석자로 등록해야 하는데 이분들은 회비가 면제다.

## 1. 가구 → 방 (관리자 화면 라벨 전용)

### 결정
- DB 테이블·컬럼·RLS·RPC·컴포넌트명·함수명(`householder_id`, `groupHouseholds`,
  `HouseholdPaymentManager` 등)은 **전부 그대로 둔다.** 변경은 `messages/{ko,en,es}.json`의
  표시 문자열뿐.
- **관리자 화면 한정.** 성도가 보는 등록 폼·본인 수정·회비 안내(`Register`/`Fields`/`Fee`
  네임스페이스)는 "가구/가족" 문구를 유지한다 — 성도에게는 가족 단위 등록이 자연스럽다.

### 용어 충돌 해소
관리자 표의 `Admin.colRoom`("방")은 *배정된 물리 호실*을 가리킨다. 가구를 "방"이라 부르면
겹치므로, `Rooms` 네임스페이스가 이미 쓰는 용어에 맞춰 **배정 호실 열을 "호실"로** 바꾼다.

| 대상 키 | 기존(ko) | 변경(ko) | en | es |
|---|---|---|---|---|
| `colHousehold`, `householdLabel`, `dashHouseholds` | 가구 | 방 | Room | Habitación |
| `householder`, `headSelect` | 가구주 | 방 대표 | Room lead | Responsable |
| `viewGrouped` | 가구별 | 방별 | By room | Por habitación |
| `groupHeader` | `{name} 가구 · {count}명` | `{name} 방 · {count}명` | — | — |
| `paymentTotal` | 가구 회비 | 방 회비 | Room fee | Cuota de habitación |
| `payerHousehold` | 가구 전체 | 방 전체 | Whole room | Habitación completa |
| `dashPaidHouseholds`/`dashSettledHouseholds` | 납부/정산 가구 | 납부/정산 방 | — | — |
| `colRoom` (배정 호실) | 방 | 호실 | Room # | Hab. n.º |
| `headIndependent`/`headNewIndependent`/`headHint`/`headNotFound`/`householdError`/`deleteConfirm`/`headEmail`/`roomTypeHeadOnly`/`dashNeedsActionNote` | 가구… | 방… | — | — |

`Export.householdSize`("가구 인원" → "방 인원")도 관리자 산출물이므로 함께 변경한다.
Excel 내보내기는 `Admin` 네임스페이스 라벨을 그대로 재사용하므로 자동 반영된다.

## 2. 티셔츠 사이즈

### 스키마 (마이그레이션 `0026_tshirt_size.sql`)
```sql
create type public.tshirt_size_t as enum
  ('xxxs','xxs','xs','s','m','l','xl','xxl','xxxl');
alter table public.attendees add column tshirt_size public.tshirt_size_t;  -- nullable
```
`guard_privileged_cols`에 `new.tshirt_size := old.tshirt_size` 추가 — **관리자 전용 컬럼**
(현재 성도 UI에 노출하지 않으므로 위조 UPDATE도 막는다).

### 코드
- `lib/types.ts`: `TSHIRT_SIZES` 상수 + `Attendee.tshirt_size: TshirtSize | null`
- i18n `Tshirt` 네임스페이스 — 라벨은 세 언어 모두 동일한 `XXXS…XXXL`
  (DB엔 소문자 토큰, 화면 라벨은 messages 규칙 유지)
- `AdminEditForm` 관리자 항목에 select(빈 옵션 = 미지정) — **수정 지점은 여기 한 곳**
- `AdminAttendeeTable`: 두 보기(방별/리스트) 공통 `personCells`에 열 추가,
  `attendee-sort.ts`의 `SORT_KEYS`에 `"tshirt"` 추가(선언 순서 정렬, 미지정은 뒤로)
- Excel: `h.tshirt` 헤더 + 값(미지정은 빈칸)
- 신규 등록 폼(`AdminNewAttendeeForm`)·공개 등록 폼에는 넣지 않는다 — 등록 후 상세에서 지정.

## 3. 강사 직분 + 회비 면제

### 스키마
- `0027_speaker_role.sql`: `alter type public.role_t add value 'speaker';`
  (enum 값 추가는 같은 트랜잭션에서 사용할 수 없으므로 독립 파일로 분리)
- `0028_fee_waived.sql`:
  `alter table public.attendees add column fee_waived boolean not null default false;`
  + `guard_privileged_cols`에 추가 + `household_total()` / `my_household_fee()` 재작성

### 회비 규칙 (TS·SQL 동시 변경 — `lib/fees.ts`와 SQL을 항상 같이 고칠 것)
우선순위: **면제 → 6세 미만 → 6~12세 → 부분/전일**

```
personFee(a):
  fee_waived    → 0
  is_under_6    → 0
  is_child_6_12 → partial ? 50 : 100
  partial       → 100
  full          → 선택 객실 타입 단가 (미선택 시 null = 미산정)
```

- 면제자는 **방 인원에는 그대로 집계**된다(6세 미만과 달리 실제로 방을 쓴다).
  `lib/hotel-estimate.ts`는 `is_under_6`/`attendance`만 보므로 변경 없음.
- `my_household_fee()`의 `fee_determined` 판정에서 면제자를 제외한다 —
  강사 혼자인 방은 객실 타입 미선택이어도 회비가 확정($0)된 상태다.

### UI
- `Role` 네임스페이스에 `speaker` 추가: ko "강사" / en "Speaker" / es "Conferencista".
  `ROLES` 배열에서 `pastor` 다음 위치(직분 서열 정렬·대시보드 집계 순서에 반영).
- `AdminEditForm` 관리자 항목에 "회비 면제" 체크박스(`fee_waived`).
- 참석자 표·Excel의 회비 칸: 면제자는 `Fee.waived`("면제") 표시.
  기존 `Fee.exempt`("면제(6세 미만)")와 구분한다.
- 강사 등록 자체는 기존 `/admin/attendees/new`로 가능 — 추가 작업 없음.

## 검증

- `lib/fees.test.ts`에 면제 케이스 추가(면제 우선순위, 가구 합계에서 제외, `unassignedCount` 미포함)
- `attendee-sort.test.ts`에 티셔츠 정렬 케이스, `attendee-export.test.ts` 라벨/열 갱신
- `node --test`(기존 러너) → `npx tsc --noEmit` → `npm run lint` → `npm run build`
- 로컬 Supabase에 마이그레이션 적용 후 관리자 화면 실제 확인
- 프로덕션: `supabase db push` → git push(Vercel 자동 배포)
