# PayPal 회비 납부 링크 (Option A2 — 인라인 결제 링크)

- 날짜: 2026-07-11
- 상태: 설계 확정 대기 (사용자 리뷰)

## 배경 / 목표

현재 회비는 배정 객실 타입 단가로 `my_household_fee()` RPC가 가구별 자동 계산하고,
성도는 `/edit/manage`의 회비 카드에서 금액·납부여부를 보며, **관리자가 수동으로
`paid`를 체크**한다. 온라인 결제는 없다.

교회의 기존 PayPal 온라인 헌금 수단을 활용해, 성도가 회비 카드에서 바로
**PayPal로 회비를 낼 수 있는 링크**를 제공한다. 백엔드/API/DB 변경 없이,
관리자 수동 대조·`paid` 토글은 그대로 유지한다.

### 확정된 결정사항

| 항목 | 결정 |
|---|---|
| 연동 수준 | **A2 — 인라인 결제 링크(link-out)**. 백엔드/API/웹훅/DB 변경 없음 |
| 결제 채널 | 교회 PayPal **기부(Donate)** 엔드포인트, 인라인 파라미터 방식 |
| 수취 이메일 | `newyorkevergreen@gmail.com` (환경변수로 주입, 공개값) |
| 금액 | **사전입력 + 수정가능** (고정 아님) |
| 대조 참조값 | `item_number` = **가구주 이름 + 구역** (예: `김철수 (1구역)`) |
| 납부 처리 | **관리자 수동 `paid` 토글 유지** (자동 반영 없음) |

## 비목표 (YAGNI)

- 서버 주문 생성/Orders API/웹훅/자동 `paid` 반영 (= Option B, 후속으로 미룸)
- DB 스키마 변경(거래 ID·결제 상태 저장 없음)
- 환불·부분납부·영수증 자동화
- 공개 페이지 결제(회비 카드는 매직링크 인증된 본인 가구 전용)

## 기술 근거 (PayPal 공식 확인, 2026-07-11)

- 인라인 donate URL은 `business`, `amount`, `currency_code`, `item_name`,
  `item_number`, `no_recurring` 변수를 지원한다.
- `amount` 는 금액을 사전입력한다(고정도 가능하나 본 설계는 미고정=수정가능).
- `item_number` 는 거래내역에 남아 **대조용 참조값**으로 쓸 수 있다.
- ⚠️ 계정에 "인라인(비암호화) 버튼 결제 차단" 보안 설정이 켜져 있으면 인라인
  `amount` 가 무시될 수 있음 → **교회 계정 실결제 1건으로 최종 검증 필요**.
- 기존 `hosted_button_id` 링크는 설정이 서버 저장이라 URL 파라미터가 대체로
  무시되므로 인라인 방식을 사용한다.

## 설계

### 1. 설정값

- `NEXT_PUBLIC_PAYPAL_BUSINESS_EMAIL` — 교회 PayPal 수취 이메일. URL에 노출되는
  공개값(비밀 아님). 값이 없으면(미설정) **결제 버튼을 렌더하지 않음**(안전 폴백).
- 통화는 `USD` 상수.

### 2. URL 빌더 — `src/lib/paypal.ts` (순수 함수)

```ts
buildDonateUrl({
  email: string,       // business
  amount: number,      // 가구 회비 합계
  itemName: string,    // i18n 텍스트 (payer가 봄)
  itemNumber: string,  // "가구주 이름 (구역)" — 대조용
}): string
```

- 반환: `https://www.paypal.com/donate?business=…&no_recurring=1&item_name=…&item_number=…&amount=…&currency_code=USD`
- 모든 값 `encodeURIComponent` (한글 이름·구역 안전).
- `amount` 는 소수점 2자리 문자열(`amount.toFixed(2)`)로 직렬화.
- 순수/결정적 → 단위 테스트 대상.

### 3. 회비 카드 — `HouseholdFeeCard` (`/edit/manage`)

현재 props: `total`, `unassignedCount`, `paid`. 추가 props:
`payUrl?: string | null` (페이지에서 빌더로 생성해 주입) — 컴포넌트는 URL만 받고
빌드 책임은 페이지(서버)에 둔다.

- **결제 버튼 표시 조건**: `!paid && total > 0 && unassignedCount === 0 && payUrl`.
  - 미배정 인원 존재(금액 미확정) → 버튼 숨김, 기존 `unassignedNotice` 유지
    (불완전 금액 결제 방지).
  - 이미 납부 → 기존 paid 배지만.
- 버튼: "PayPal로 {금액} 납부하기". `target="_blank"`, `rel="noopener noreferrer"`.
- 버튼 아래 안내문: "결제 후 반영에는 관리자 확인이 필요합니다."

### 4. 페이지 — `/edit/manage/page.tsx`

- 이미 스코프된 가구 행(`attendees`)에서 head(`is_householder`) 추출 →
  `korean_name`(없으면 `english_name`)·`district`로 `itemNumber` 구성.
- `my_household_fee()` 결과 `total`·`unassigned_count`·`paid` 사용.
- `NEXT_PUBLIC_PAYPAL_BUSINESS_EMAIL` 있고 위 표시 조건 충족 시 `buildDonateUrl`로
  `payUrl` 생성해 `HouseholdFeeCard`에 전달, 아니면 `null`.

### 5. 관리자 측

- 변경 없음. 기존 수동 `paid` 토글 유지. 관리자는 PayPal 거래내역의
  결제자명 + `item_number`(가구주 이름·구역) + 금액으로 대조 후 체크.

### 6. i18n (ko/en/es, `Fee` 네임스페이스)

- 버튼 라벨(`payWithPaypal`, 금액 보간), 결제 후 안내문(`payNotice`),
  `item_name` 텍스트(`payItemName`, 예: "늘푸른교회 2026 수련회 회비").
- `item_number`(가구주 이름·구역)는 데이터이므로 번역하지 않음.

## 에러 처리 / 엣지 케이스

- 이메일 env 미설정 → 버튼 미표시(기존 카드 그대로).
- `total === 0` (전원 6세 미만 등) → 버튼 미표시.
- 미배정 인원 존재 → 버튼 미표시(금액 미확정).
- head 이름 공백 → `english_name` 폴백, 둘 다 없으면 `item_number` 는 구역만/빈값
  허용(빌더는 방어적으로 처리).
- 인라인 금액이 계정 설정으로 무시될 가능성 → 실결제 검증 항목으로 문서화.

## 테스트

- **단위**: `buildDonateUrl` — 파라미터 구성, 한글 `encodeURIComponent`,
  `amount.toFixed(2)`, 필수 파라미터 존재.
- **컴포넌트/브라우저**: 표시 조건별 버튼 노출/숨김(미납+배정완료=노출,
  미배정/납부완료/이메일없음=숨김), 링크 URL·금액 확인.
- **실환경(사용자)**: 교회 PayPal 계정으로 실결제 1건 → 인라인 `amount` 반영 및
  거래내역 `item_number` 노출 여부 최종 확인.

## 영향 범위

- 신규: `src/lib/paypal.ts` (+ 테스트)
- 수정: `src/components/HouseholdFeeCard.tsx`, `src/app/[locale]/edit/manage/page.tsx`,
  `messages/{ko,en,es}.json`
- 환경변수: `NEXT_PUBLIC_PAYPAL_BUSINESS_EMAIL` (.env.local + Vercel Production).
  ⚠️ Vercel env 추가 후 **Redeploy** 필요.
- DB 마이그레이션: 없음.
