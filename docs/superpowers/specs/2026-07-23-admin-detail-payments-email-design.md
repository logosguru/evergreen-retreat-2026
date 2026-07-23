# 관리자 참석자 상세 페이지: 회비 납입 관리 임베드 + 가구주 이메일 표시

날짜: 2026-07-23
상태: 사용자 구두 승인(납입 임베드) + 이메일 표시 추가 요청 반영

## 배경 / 문제

- 회비 납입 관리(`HouseholdPaymentManager`)가 별도 페이지 `/admin/attendees/[id]/payments`에만 있어, 참석자 상세(`/admin/attendees/[id]/edit`)에서 납입을 확인·기록하려면 페이지를 이동해야 해 불편하다.
- 등록 시 이메일은 **가구주 행에만** 저장된다(`register/actions.ts` — 가구원은 `email: null`). 그래서 가구원 상세 페이지에서는 이메일 칸이 항상 비어 있어, 그 가구의 등록 이메일을 볼 방법이 없다.

## 결정 사항 (사용자 확인 완료)

- 가구원(비가구주) 상세 페이지에서도 **소속 가구의 납입 관리를 그대로 표시**하고 기록도 가능하게 한다. 납부는 가구 단위이므로 어느 구성원 페이지에서 열어도 같은 데이터다.
- 기존 `/admin/attendees/[id]/payments` 페이지와 목록의 납입 링크는 **그대로 유지**한다(추가 노출일 뿐 제거 없음).

## 변경 내용

### 1. 상세 페이지에 회비 납입 관리 임베드

- `edit/page.tsx`:
  - 기존에 계산하는 `headId`(본인이 가구주면 본인 id, 아니면 `householder_id`)를 기준으로
    `household_total(head_id)` RPC와 `fee_payments`(head_id, `paid_at` asc) 조회를 **기존 쿼리와 병렬**로 추가.
  - `AdminEditForm`에 새 prop으로 전달: `payment: { headId, total, payments } | null` (headId가 없으면 null → 섹션 미표시).
- `AdminEditForm.tsx`:
  - "관리자 항목" fieldset 안(관리자 권한 토글 아래)에 소구역 추가:
    - 제목: 기존 키 `Admin.paymentsTitle`("회비 납입 관리") 재사용.
    - 본문: 기존 `HouseholdPaymentManager` 컴포넌트를 그대로 렌더(요약 3칸 + 내역 + 기록/환불 폼 — 동작 동일, 즉시 반영 + `router.refresh()`).
    - 안내문(신규 i18n 키 `Admin.paymentInlineHint`): 납입 기록/삭제는 아래 저장 버튼과 무관하게 즉시 반영된다는 문구 (ko/en/es).
- 새 서버 액션·DB 변경 없음. `addPayment`/`deletePayment`/`household_total` 기존 것 재사용.

### 2. 가구주 등록 이메일 표시

- `edit/page.tsx`의 가구 맥락 조회(select)에 `email` 컬럼 추가.
- 페이지 상단 가구 표시 영역에, 가구주의 이메일이 있으면 읽기 전용 한 줄 표시:
  - 신규 i18n 키 `Admin.headEmail` — ko: "등록 이메일(가구주)", en: "Registered email (householder)", es 상응 번역.
  - 가구원 페이지에서도 소속 가구주의 이메일이 보이므로 "회원 이메일을 볼 곳이 없다" 문제 해소.
  - 가구주 본인 페이지에서는 폼의 이메일 입력칸과 중복 표시되지만, 상단에서 바로 보이는 편의를 위해 항상 표시(이메일이 있을 때만).

## 비범위 (Non-goals)

- 참석자 목록 테이블에 이메일 열 추가 없음.
- `/payments` 페이지 제거/이동 없음.
- DB 스키마·RLS·서버 액션 변경 없음.

## 검증

- `npx tsc --noEmit`, `npm run lint`, `npm run build` 통과.
- 로컬(`supabase start` + `npm run dev`)에서:
  - 가구주 상세: 납입 요약/내역/기록 폼 표시 + 기록·삭제 즉시 반영 확인.
  - 가구원 상세: 같은 가구 납입 데이터 표시 + 상단에 가구주 이메일 표시 확인.
  - ko/en/es 3개 언어에서 신규 문구 렌더 확인.
