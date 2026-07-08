# 등록 여부 이름 확인 설계 (등록 1단계 확장)

## Context (배경)

등록(`/register`) 1단계는 현재 **이메일로만** 기존 등록 여부를 확인한다(`email_registered` RPC,
0005). 그런데 이메일은 **가구주(head) 행에만** 저장되므로, 가구 등록에 포함된 가족 구성원은
자기 이름이 어떤 이메일로 등록됐는지 모르면 본인 등록 여부를 확인할 방법이 없다 → 중복
등록으로 이어질 수 있다.

이 기능은 1단계 확인 화면에 **이름으로 확인** 경로를 추가한다. 입력한 이름(한글/영어/스페인어
표기 무관)을 `korean_name`/`english_name` **두 필드 모두**에 대조하고, 일치하면 "이미 등록됨" +
**마스킹된 가구 대표 이메일**(수정 매직링크를 받을 주소 힌트)을 보여준다.

> 스페인어 이름은 별도 컬럼 없이 라틴 문자로 `english_name`에 저장되는 구조이므로,
> 두 컬럼 대조로 세 언어 입력을 모두 커버한다.

## 핵심 제약

- **anon은 `attendees` SELECT 정책이 없다**(명단 비노출). 0005와 동일하게 `SECURITY DEFINER`
  RPC로만 확인하고, 반환은 **마스킹된 이메일 배열**로 제한한다. 원본 이메일·행 데이터는 DB
  밖으로 나가지 않는다.
- **부분 일치 금지**: "김"만 입력해 명단을 열거하는 것을 막기 위해 정규화 후 **정확 일치**만
  허용한다.
- 가구 구성원 행은 `email = null` → 일치한 사람의 **가구주(head) 이메일**을 역추적해야 한다
  (`householder_id` self-FK; head 본인이면 자기 email).

## 확정된 결정사항

| 항목 | 결정 |
|---|---|
| 결과 노출 | 등록 여부 + **마스킹된 가구 대표 이메일** (예: `jo***@gm***.com`) |
| 매칭 방식 | `lower()` + **모든 공백 제거** 후 정확 일치, `korean_name`·`english_name` 둘 다 대조 |
| 동명이인 | 일치하는 **모든 가구**의 마스킹 이메일을 중복 제거해 배열로 반환 |
| UI 배치 | 1단계 화면 상단 **탭 전환**: [이메일로 확인] / [이름으로 확인] |
| 미일치 시 | "등록 내역 없음" 안내 + 이메일 탭으로 전환해 새 등록 진행 유도 |
| 확인 방식 | `SECURITY DEFINER` 함수 `name_registered(text) → text[]`, anon/authenticated 실행 허용 |
| Turnstile | 확인 단계엔 미적용(기존 `checkEmail`과 동일). 마스킹 이메일만 노출되므로 위험 수용 |

## 데이터/함수 — `supabase/migrations/0013_name_check.sql`

```sql
-- 이메일 마스킹: joeykim@gmail.com → jo***@gm***.com
create or replace function public.mask_email(addr text)
returns text
language sql
immutable
as $$
  select left(split_part(addr, '@', 1), 2) || '***@'
      || left(split_part(addr, '@', 2), 2) || '***.'
      || regexp_replace(split_part(addr, '@', 2), '^.*\.', '');
$$;

-- 입력한 이름이 등록돼 있으면, 일치한 사람들의 가구 대표 이메일(마스킹)을
-- 중복 제거해 배열로 반환. 빈 배열 = 미등록. (명단 비노출 유지)
create or replace function public.name_registered(check_name text)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  with norm as (
    select lower(regexp_replace(coalesce(check_name, ''), '\s', '', 'g')) as q
  ),
  matched as (
    select a.email, a.householder_id
    from public.attendees a, norm
    where length(norm.q) >= 2
      and (
        lower(regexp_replace(coalesce(a.korean_name,  ''), '\s', '', 'g')) = norm.q
        or
        lower(regexp_replace(coalesce(a.english_name, ''), '\s', '', 'g')) = norm.q
      )
  ),
  head_emails as (
    select distinct coalesce(h.email, m.email) as email
    from matched m
    left join public.attendees h on h.id = m.householder_id
  )
  select coalesce(array_agg(distinct public.mask_email(email)), '{}')
  from head_emails
  where email is not null;
$$;

grant execute on function public.name_registered(text) to anon, authenticated;
```

- 정규화(공백 제거+소문자)를 **양쪽에** 적용: "김 철수"="김철수", "john kim"="John Kim".
- `length(norm.q) >= 2` 가드로 1글자 입력의 광범위 매칭을 함수 차원에서도 차단(서버 액션이
  먼저 검증하지만 이중 방어).
- 인덱스 없이 풀스캔이지만 참석자 수백 명 규모라 무시 가능.

## 서버 액션 — `src/app/[locale]/register/actions.ts`

```ts
export type CheckNameResult =
  | { ok: true; matched: boolean; maskedEmails: string[] }
  | { ok: false; error: string }; // "validationCheckName"

export async function checkName(nameRaw: string): Promise<CheckNameResult> {
  const name = clean(nameRaw);
  if (!name || name.replace(/\s/g, "").length < 2) {
    return { ok: false, error: "validationCheckName" };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("name_registered", {
    check_name: name,
  });
  if (error) return { ok: false, error: "error" };
  const emails = (data ?? []) as string[];
  return { ok: true, matched: emails.length > 0, maskedEmails: emails };
}
```

`insertRegistration`은 변경 없음(이름 확인은 안내용이며 등록 차단은 기존 이메일 unique가 담당).

## UI — `src/components/RegistrationForm.tsx` 1단계 탭화

phase `"email"` 화면 상단에 탭 2개를 추가한다: `checkTab` state (`"email" | "name"`).

- **[이메일로 확인] 탭**: 기존 이메일 입력·차단 카드·"다음" 흐름 그대로.
- **[이름으로 확인] 탭**(신규): 이름 입력 1개 + [확인하기] 버튼 + 힌트("등록 때 쓴 한글 또는
  영어 이름 그대로").
  - `checkName` 호출 중 `checking` 표시.
  - `matched===true` → amber 카드(기존 차단 카드 스타일 재사용): "이미 등록되어 있습니다" +
    마스킹 이메일 목록("수정 링크는 이 이메일로 받을 수 있어요") + [내 정보 수정하러 가기]
    (`/edit` Link).
  - `matched===false` → slate 카드: "이 이름으로 등록된 내역이 없습니다" + [이메일로 새로
    등록하기] 버튼(이메일 탭으로 전환).
  - 입력 변경 시 결과 초기화(기존 이메일 입력과 동일 패턴).
- 이름 탭은 **확인 전용**이며 phase "form" 전환은 항상 이메일 탭의 "다음"으로만 일어난다.

## i18n — `Register` 네임스페이스 키 추가 (ko/en/es 3개 파일 동일 키)

`tabEmail`, `tabName`, `nameStepHint`, `checkName`(버튼), `nameFoundTitle`, `nameFoundHint`
(마스킹 이메일 안내), `nameNotFoundTitle`, `nameNotFoundHint`, `goRegisterByEmail`(탭 전환 버튼),
`validationCheckName`(2자 미만/빈 입력 — 기존 `validationName`은 등록 폼 필수 검증용이라 별도 키).
기존 `goToEdit`, `checking` 재사용.

## 검증 (Verification)

- **마이그레이션**: `supabase db reset` → 함수 2개 생성. psql로:
  - head 한글 이름 정확 일치 → 마스킹 이메일 1개. 공백 섞은 입력("김 철수")도 동일 결과.
  - 구성원(email=null) 영어 이름 대소문자 다르게 입력 → **가구주** 마스킹 이메일 반환.
  - 동명이인 2가구 → 마스킹 이메일 2개(중복 제거). 미등록 이름/1글자 → `{}`.
  - anon 역할로 함수 호출 가능하되 `select * from attendees`는 여전히 차단.
- **마스킹**: `joeykim@gmail.com → jo***@gm***.com`, 1글자 local(`a@b.co`)도 오류 없이 동작.
- **UI**: 탭 전환, 이름 일치 카드(+`/edit` 링크), 미일치 카드(+이메일 탭 전환), 이메일 탭 기존
  흐름 회귀 없음.
- tsc/lint/build, ko/en/es 키 파리티.

## 추록 (2026-07-05, migration 0014) — '등록됨 + 이메일 없음' 3번째 상태

프로덕션 스모크 테스트에서 발견: import된 가구(head email = null)는 이름이 일치해도 RPC가
빈 배열을 반환 → UI가 "등록 내역 없음"으로 오안내 → 중복 등록 유발 위험.

- `name_registered`를 **jsonb** 반환으로 변경(0014, drop 후 재생성):
  `{ "matched": boolean, "masked_emails": text[] }` — matched(이름 일치)와 이메일을 분리.
- `checkName`은 jsonb를 파싱해 기존 `CheckNameResult` 형태 그대로 반환(인터페이스 무변경).
- UI: `matched && maskedEmails.length === 0`이면 amber 카드에 `nameFoundNoEmailHint`
  ("등록 확인됨, 수정용 이메일 없음 → 등록 담당자(김효진 전도사) 문의") 표시, /edit 링크 없음.
- i18n: `nameFoundNoEmailHint` ko/en/es 추가 (39키).

## 범위 밖 (후속)

- 이름 열거 레이트리밋 — 정확 일치 + 마스킹 반환이라 위험 낮음, 교회 내부 대상. 후속.
- 유사 표기 매칭(예: "Chulsoo"/"Chul Soo Kim" 부분 표기) — 정확 일치만. 못 찾으면 이메일
  확인 또는 등록 담당자 문의로 안내.
- 이름 확인 결과에서 바로 매직링크 발송 — `/edit`로 이동해 기존 흐름 사용.
