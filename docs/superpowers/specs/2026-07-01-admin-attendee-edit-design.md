# 관리자 참석자 편집 UI (설계)

- **날짜**: 2026-07-01
- **목적**: 관리자가 참석자 각 개인의 정보를 하나씩 수정/삭제할 수 있는 화면. Google Form import 데이터가 미완(구역·이메일·직분 상당수 비었거나 임시값)이라 앱에서 정정할 수단이 필요. Google Form은 폐쇄, 신규 입력 창구는 공개 `/register`.

## 배경 / 현재 상태

- `/admin/attendees` = 정렬 가능한 읽기 위주 표(`AdminAttendeeTable`). 인라인 편집은 **언어(드롭다운)·회비 납부(토글)만**.
- 방 배정은 별도 `/admin/assignments`, 성도 본인수정은 매직링크 `EditForm`(관리자 전용 컬럼 제외 화이트리스트) + `updateMyAttendee`.
- 관리자 액션(`setPaid`/`setLanguage`)은 RLS + `app_role=admin` 클레임으로 관리자만 통과. `guard_privileged_cols` 트리거는 admin이면 통과(관리자 컬럼 쓰기 허용).
- `attendees` 컬럼: 0001_init + 0007(language) + 0008(korean_name nullable + name_required check). 회비/방/가구 규칙은 `CLAUDE.md` 참조.

## 확정된 결정사항

| 항목 | 결정 |
|---|---|
| 편집 위치 | 참석자별 **전용 편집 페이지** `/admin/attendees/[id]/edit` |
| 편집 필드 | 개인 서술 필드 전체 + 관리자 조직 필드(language, retreat_group, is_group_leader) |
| 방·회비 | 이 페이지에서 다루지 않음(기존 전용 UI 유지: assignments / 표 인라인 토글) |
| 가구 구조 | `is_householder`/`householder_id`는 이 페이지에서 직접 편집 안 함 |
| 동작 | **편집 + 삭제** (신규 추가는 공개 `/register`가 창구이므로 제외) |
| 삭제 시 가구주 | 남은 구성원 중 **가장 먼저 등록된(created_at)** 1명을 새 가구주로 **승격**(원자적 RPC) |

## 컴포넌트 / 파일

**신규:**
- `src/app/[locale]/admin/(protected)/attendees/[id]/edit/page.tsx` — RSC. `id` 참석자 단건 + 같은 가구 구성원(읽기전용 맥락) 조회 → `AdminEditForm`에 전달. 없으면 `notFound()`.
- `src/components/AdminEditForm.tsx` — client. `PersonFields` 재사용(서술 필드) + 관리자 필드 섹션 + 저장/삭제.
- `supabase/migrations/0009_admin_delete.sql` — `admin_delete_attendee(target uuid)` RPC.

**수정:**
- `src/app/[locale]/admin/actions.ts` — `adminUpdateAttendee`, `adminDeleteAttendee` 추가.
- `src/components/AdminAttendeeTable.tsx` — 이름 셀을 편집 페이지 링크로.
- `messages/{ko,en,es}.json` — Admin 편집 관련 키 추가.

## 필드 & 데이터 매핑

**서술 필드 (PersonFields 재사용, `PersonInput` 기반):**
korean_name, english_name, district, gender, role, email, phone, is_under_6, attendance, arrival_at, departure_at, note.

**관리자 필드 섹션 (AdminEditForm 추가 입력):**
- `language` — 드롭다운 `ko`/`en`/`es` (Language 네임스페이스 라벨 재사용)
- `retreat_group` — 텍스트 (수련회조)
- `is_group_leader` — 체크박스 (조장)

**편집 안 함(이 페이지에서):** paid, paid_at(표 토글), room_id(assignments), is_householder, householder_id(구조), created_at/updated_at.

**읽기전용 맥락:** 상단에 가구 정보 — 가구주 이름, 본인 `is_householder` 배지, 같은 가구 구성원 이름 목록. (수정 불가, 방향 파악용)

## 서버 액션 (`admin/actions.ts`)

```
adminUpdateAttendee(id: string, input: AdminEditInput): Promise<{ok:true}|{ok:false,error:string}>
adminDeleteAttendee(id: string): Promise<{ok:true}|{ok:false,error:string}>
```

- `AdminEditInput` = `PersonInput`(서술 필드) + `{ language: Language; retreat_group?: string; is_group_leader?: boolean }`.
- **adminUpdateAttendee** 화이트리스트 컬럼(전부): korean_name, english_name, district, gender, role, phone, email, is_under_6, attendance, arrival_at, departure_at, note, language, retreat_group, is_group_leader.
  - 검증(기존 규칙 재사용): 이름 최소 하나(korean_name 또는 english_name), `partial`이면 arrival_at·departure_at 필수. wall-clock 문자열 그대로 저장.
  - `full`이면 arrival_at/departure_at를 null로. role 빈값이면 `member`.
  - admin은 RLS update 정책 + guard 트리거 통과 → 관리자 컬럼(language/retreat_group/is_group_leader) 쓰기 허용.
- **adminDeleteAttendee**는 `supabase.rpc('admin_delete_attendee', { target: id })` 호출.

## 삭제 + 가구주 승격 RPC (`0009_admin_delete.sql`)

SECURITY INVOKER(기본) — 내부 쿼리는 호출한 관리자의 RLS로 실행됨. 함수 = 단일 트랜잭션이라 승격·재지정·삭제가 원자적.

```sql
create or replace function public.admin_delete_attendee(target uuid)
returns void
language plpgsql
as $$
declare
  is_head boolean;
  new_head uuid;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;

  select is_householder into is_head from public.attendees where id = target;
  if is_head is null then
    return;  -- 존재하지 않는 id: no-op
  end if;

  if is_head then
    -- 남은 구성원 중 가장 먼저 등록된 1명을 새 가구주로 승격
    select id into new_head
      from public.attendees
      where householder_id = target
      order by created_at asc
      limit 1;
    if new_head is not null then
      update public.attendees
        set is_householder = true, householder_id = null
        where id = new_head;
      update public.attendees
        set householder_id = new_head
        where householder_id = target and id <> new_head;
    end if;
  end if;

  delete from public.attendees where id = target;  -- 이 시점엔 참조 구성원 없음
end $$;

grant execute on function public.admin_delete_attendee(uuid) to authenticated;
```

- 재지정을 삭제보다 먼저 하므로 self-FK `on delete set null`로 고아가 생기지 않는다.
- 구성원 삭제(비가구주)는 승격 로직을 건너뛰고 바로 delete — 다른 행에 영향 없음.
- ⚠️ 0008처럼 **프로덕션에도 별도 적용** 필요(`supabase db push`).

## 삭제 UX

- 편집 페이지 하단 "삭제" 버튼 → 인라인 확인 단계("정말 삭제할까요? 가구주면 다음 구성원이 새 가구주가 됩니다. [삭제][취소]").
- 확인 시 `adminDeleteAttendee` → 성공하면 `/admin/attendees`로 이동(`router.push` + refresh).

## 저장 UX / 에러

- "저장" → `adminUpdateAttendee` → 성공 인라인 표시(저장됨), 실패 시 에러 메시지. 저장 중 버튼 비활성(`useTransition`).
- 상단 "← 목록으로" 링크.

## i18n (messages ko/en/es)

Admin 네임스페이스에 추가: `editTitle`, `save`, `saved`, `saveError`, `deleteBtn`, `deleteConfirm`, `deleteYes`, `deleteCancel`, `deleted`, `deleteError`, `backToList`, `retreatGroup`, `groupLeader`, `adminFields`(섹션 제목). 언어 라벨은 기존 `Language` 네임스페이스 재사용. Fields/Gender/Role/District/Attendance는 PersonFields가 이미 사용.

## 테스트 / 검증

- 이 앱엔 JS 테스트 러너가 없음(기존 패턴) → 정적/빌드 + 브라우저 + DB로 검증:
  1. `npx tsc --noEmit`, `npm run lint`, `npm run build` 통과.
  2. **RPC 로컬 DB 테스트**: 로컬 Supabase에서 가구(가구주+구성원 2) 삽입 → `select admin_delete_attendee(가구주id)` → 남은 구성원 중 최연장 등록자가 `is_householder=true, householder_id=null`이고 나머지가 그를 가리키는지, 원 가구주는 삭제됐는지 SQL로 확인. 비가구주 삭제·단독 가구주 삭제도 확인.
  3. **Playwright(MCP) 브라우저 플로우**: 로컬에서 관리자 로그인 → 표에서 이름 클릭 → 편집 페이지에서 필드 수정·저장 → 목록에서 반영 확인. 가구주 삭제 → 승격 결과 확인.
- 서버 액션 화이트리스트(관리자 컬럼만 의도대로)는 코드 리뷰로 확인.

## 범위 밖 (YAGNI)

- 신규 참석자 관리자 추가(공개 `/register` 존재).
- 가구 구조 직접 재지정(가구주 지정 변경, 가구 간 이동) — 삭제 시 자동 승격만 지원.
- 방/회비 편집(기존 전용 UI 유지).
- 일괄 편집.
