# 등록 이메일 중복 확인 단계 설계

## Context (배경)

공개 등록(`/register`)은 로그인 없이 anon으로 `attendees`에 INSERT한다. 현재는 같은 이메일로
여러 번 등록해도 막히지 않아 **중복 가구 등록**이 발생할 수 있다. 등록 시 입력하는 이메일은
가구주(head) 행에 저장되며, 이후 본인 수정(`/edit` 매직링크)의 식별자로 쓰인다.

이 기능은 등록을 **이메일 먼저 단계**로 나눠, 이미 등록된 이메일이면 새 등록을 막고 `/edit`로
안내한다.

## 핵심 제약

- **anon은 `attendees` SELECT 정책이 없다**(명단 비노출). 따라서 일반 쿼리로는 이메일 존재
  확인이 불가 → 존재 여부(boolean)만 돌려주는 **`SECURITY DEFINER` 함수**가 유일한 안전책.
  클라이언트/anon은 명단 데이터를 받지 않고, 입력한 한 이메일의 등록 여부만 확인한다.
- 이메일은 **가구주(head) 행에만** 저장된다(`rowFor`에서 head만 `email` 채움). 따라서 이 확인은
  곧 "등록 시 쓰는 대표 이메일"의 중복 확인이다.

## 확정된 결정사항

| 항목 | 결정 |
|---|---|
| 흐름 | **이메일 먼저 단계** → 확인 → 미등록이면 폼 노출, 등록됨이면 차단 |
| 중복 시 동작 | **차단(hard)** + "이미 등록됨" 안내 + `/edit` 링크 + "다른 이메일로 등록"(뒤로) |
| 2단계 이메일 | **읽기전용 표시**(재입력 X). 변경하려면 1단계로 되돌아가기 |
| 확인 방식 | `SECURITY DEFINER` 함수 `email_registered(text) → boolean`, anon/authenticated 실행 허용 |
| 대소문자 | 무시(`lower(email)`), 기존 `attendees_email_idx` 활용 |
| 방어 | `insertRegistration`에서 insert 직전 재확인(폼 우회·동시성 대비) |

## 데이터/함수 — `supabase/migrations/0005_email_check.sql`

```sql
-- 입력한 이메일이 이미 등록되어 있는지 여부만 반환(명단 비노출 유지).
create or replace function public.email_registered(check_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.attendees
    where email is not null and lower(email) = lower(check_email)
  );
$$;

grant execute on function public.email_registered(text) to anon, authenticated;
```

- `SECURITY DEFINER` + `set search_path = public`로 RLS를 우회해 존재만 확인. 반환은 boolean뿐
  이라 행 데이터는 노출되지 않는다.
- 빈/널 입력은 `exists`가 자연스럽게 false 처리(서버 액션에서 형식 검증을 먼저 한다).

## 서버 액션 — `src/app/[locale]/register/actions.ts`

```ts
export type CheckEmailResult =
  | { ok: true; registered: boolean }
  | { ok: false; error: string }; // "validationEmail"

export async function checkEmail(emailRaw: string): Promise<CheckEmailResult> {
  const email = clean(emailRaw);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "validationEmail" };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("email_registered", {
    check_email: email,
  });
  if (error) return { ok: false, error: "error" };
  return { ok: true, registered: !!data };
}
```

`insertRegistration` 보강(방어적 재확인): 이메일 형식 검증 직후, `email_registered`를 호출해
`true`면 `{ ok: false, error: "alreadyRegistered" }` 반환. (정상 흐름에선 1단계가 이미 걸러내므로
도달하지 않지만, 폼 우회/동시성 대비.)

## UI — `src/components/RegistrationForm.tsx` 2단계화

현재 `RegistrationForm`은 한 폼 안에 [등록방식 선택] → [이메일 입력(102–116행)] → [가구주/가족] →
[제출]을 둔다. 이를 phase 상태(`"email" | "form"`)로 나눈다. `email` state는 이미 존재하므로 재사용.

- **phase "email"**(신규, 폼 위쪽): 이메일 입력 + "다음" 버튼.
  - `checkEmail(email)` 호출 중 `t("checking")` 표시.
  - `error==="validationEmail"` → 형식 검증 메시지.
  - `registered===true` → 차단 카드: `alreadyTitle`/`alreadyHint` + **[내 등록 수정하러 가기]**
    (`/edit` Link) + [다른 이메일로 등록](`useAnotherEmail`, phase "email" 유지하며 입력 수정).
  - `registered===false` → phase "form"으로 전환(`email`은 state에 그대로 유지).
- **phase "form"**: 기존 폼에서 **이메일 입력 블록(102–116행)을 제거**하고, 그 자리에 확인된 이메일을
  **읽기전용 표시**(`emailReadonlyNote` + 값) + "이메일 변경"(`changeEmail`, phase "email" 복귀) 링크.
  나머지(모드/가구주/가족/제출)는 그대로. 제출 시 기존 `handleSubmit`의 payload `email` 사용.

> 단순화를 위해 phase 분기는 `RegistrationForm` 내부 state로 처리(별도 컴포넌트 분리 불필요).
> 성공 화면(`done`) 분기는 현행 유지.

## i18n — `Register` 네임스페이스 추가 (ko/en 동일 키)

`emailStepTitle`, `emailStepHint`, `next`, `checking`, `alreadyTitle`, `alreadyHint`,
`goToEdit`, `useAnotherEmail`, `emailLabel`(있으면 재사용), `changeEmail`,
그리고 액션 에러용 `alreadyRegistered`(폼 우회 시 표시).

## 검증 (Verification)

- **마이그레이션**: `supabase db reset` → 함수 생성. psql로 `select public.email_registered('x@y.com')`
  동작. anon 역할로 함수는 호출되지만 `select * from attendees`는 여전히 차단(RLS 유지) 확인.
- **존재 확인**: 등록된 head 이메일 → true, 미등록 → false, 대소문자 다른 입력 → true(정규화).
- **UI**: 등록된 이메일 입력 → 차단 카드 + `/edit` 링크. 새 이메일 → 폼 노출(이메일 읽기전용) →
  제출 → 행 생성. "다른 이메일로 등록"/"이메일 변경" 동작.
- **방어**: `insertRegistration`에 이미 등록된 이메일을 직접 보내면 `alreadyRegistered` 거부.
- tsc/lint/build, ko/en 키 파리티.

## 범위 밖 (후속)
- 봇/스팸 방지(Cloudflare Turnstile) — 기존 TODO.
- 이메일 존재 probing 레이트리밋 — 후속(현재는 church 내부 대상이라 위험 낮음).
- 한 이메일을 서로 다른 두 가구가 공유하는 경우: 차단형이라 두 번째 등록 불가 → 다른 이메일 사용
  또는 관리자 처리. (드문 케이스, 의도된 트레이드오프.)
