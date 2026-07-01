# Google Form 응답 → 프로덕션 `attendees` import (설계)

- **날짜**: 2026-07-01
- **성격**: 일회성 마이그레이션 (기존 Google Form 응답을 프로덕션 Supabase `attendees`에 1회 적재). 이후 앱 자체 등록만 사용.
- **소스**: `/Users/logosguru/Downloads/form-responses.xlsx` (Google Form → Google Sheets → xlsx 다운로드)

## 배경 / 문제

늘푸른교회 수련회 등록이 초기에 Google Form으로 수집되었다. 앱 배포(retreat.nyevergreen.com) 이후 이 응답들을 앱 DB로 옮겨야 한다. 폼의 자유 입력 데이터를 정규화된 `attendees` 스키마(사람당 1행, self-FK `householder_id` 가구 묶음, enum 토큰, 부분참석 시각)로 정확히 매핑하는 것이 핵심 난제다.

### 소스 파일 구조

xlsx는 5개 시트: `combined`, `ko`, `en`, `es`, `Expanded_Attendees`.

- **`Expanded_Attendees`** 를 소스로 사용한다 — 시트 제작자가 이미 각 등록을 **참석자 1인당 1행**으로 펼쳐놓았고, 우리 스키마 구조와 일치한다.
- 9개 컬럼: `Timestamp`, `Attendance Status`, `Main Registrant Name`, `Organization`, `Cell Group (Leader)`, `Requests or Other Comments`, `Attendee Name`, `Relationship`, `Age Group`.
- 규모: **29건 등록 → 총 63명** (ko 폼 14건 + en 폼 15건 + es 0건).

### 데이터 특성 (실측)

- **`Timestamp` = 가구 식별키.** 동일 타임스탬프를 공유하는 행 = 한 등록 = 한 가구. `Relationship`이 Self 계열인 행이 가구주.
- **언어 판별 가능.** attendance/relationship 텍스트가 한글('전일 참석')이면 ko, 영문('Attending the full retreat')이면 en.
- **이름이 지저분함.** `'박준영, joonyoung park'`, `'안정은 (Mary Ko)'`, `'박준영 장로 / joonyoung park'` 처럼 한글+영문+직함이 콤마/점/슬래시/괄호로 섞임.
- **구역이 지저분함.** `'4구역 (이재훈)'`, `'6구역, 마하나임'`, `'Michael'`, `'미가엘 (문에바다)'` 등 자유 입력.
- **폼에 없는 필드**: `email`, `phone`, `gender`, `role`. (role은 이름 속 직함/Organization에서 힌트만 얻음)
- **부분참석 시각 없음**: 폼은 full/partial만 물었고 도착/출발 시각은 수집 안 함.

## 확정된 결정사항

| 항목 | 결정 |
|---|---|
| import 성격 | 일회성, 프로덕션 직접 (A) |
| 부족 필드 채우는 곳 | **import 전 정리용 CSV**에서 admin이 수기 편집 (A). 앱 편집 UI 신설은 추후 별도 과제 |
| 미정·불참 응답 | **DB에서 제외**하되 별도 참고 CSV로 보존 (C) |
| 프로덕션 적재 | **SQL 파일 생성 → admin이 Supabase SQL Editor에서 검토·실행** (A) |
| 도구 언어 | **Python** (openpyxl 이미 설치, 새 의존성 0) |

## 전체 워크플로 (3단계)

```
[form-responses.xlsx]
   │  ① 파싱 스크립트 (Claude 실행)
   ▼
[import-worksheet.csv]         ← 자동 채움 + best-effort + "확인 필요" 플래그
[followup-undecided-absent.csv] ← 미정·불참 명단 (참고용, DB 미적재)
   │  ② admin이 Excel/Sheets에서 편집 (빈 칸 채우고 애매한 셀 교정)
   ▼
[import-worksheet-final.csv]
   │  ③ SQL 생성 스크립트 (Claude 실행) — 검증 통과 시에만 생성
   ▼
[import.sql]                   ← admin이 Supabase SQL Editor에서 검토 후 실행
   ▼
[프로덕션 attendees]
```

## 컴포넌트

### ① 파싱 스크립트 — `scripts/import/parse_form.py`

**입력**: `form-responses.xlsx` (경로 인자)
**출력**: `import-worksheet.csv`, `followup-undecided-absent.csv`

**동작**:
1. `Expanded_Attendees` 시트 로드, 빈 행 제거.
2. attendance 상태 정규화:
   - 전일 참석 / Attending the full retreat → `full`
   - 부분 참석 / (partial 계열) → `partial`
   - 미정 / Undecided, 불참 / Cannot attend → **followup CSV로 분리, worksheet에서 제외**
3. `Timestamp`로 그룹핑 → `household_id`(H01, H02…) 부여. Self 계열 relationship 행 = 가구주(`is_householder=TRUE`).
4. best-effort 파싱(아래 규칙) 후 `import-worksheet.csv` 작성.
5. 애매한 필드는 `_needs_review` 컬럼에 목록으로 기록.

**best-effort 파싱 규칙**:
- **이름 분리**: 구분자(`,` `.` `/` 괄호)로 토큰화 → 한글 토큰은 `korean_name`, 라틴 토큰은 `english_name`. 직함(장로/권사/집사/전도사/목사)은 떼어내 `_title_hint`에. 한글 토큰이 없거나 분리 불확실하면 `_needs_review`에 "name-split".
- **구역 → DISTRICTS 토큰**: `N구역`→`"N"`, `마하나임/Mahanaim`→`mahanaim`, `미가엘/Michael`→`michael`, `기드온/Gideon`→`gideon`, `IM/International`→`im`. 매칭 실패 또는 복수 매칭이면 값 비우고 `_needs_review`에 "district".
- **언어**: 한글 텍스트 감지 시 `ko`, 아니면 `en`.
- **is_under_6**: Age Group이 "6세 미만 / under 6" 계열일 때만 `TRUE`. "6-12", "13세 이상 / 13 or older", 빈값은 `FALSE`.
- **Self 판정(가구주)**: relationship이 Self/본인/Me/It's me/NA(가구주 자기 행) 계열. 판정은 "각 timestamp 그룹에서 `Main Registrant Name`과 `Attendee Name`이 일치하는 행"을 1차 기준으로 하고, 없으면 relationship 텍스트로 보강.

### 워크시트 CSV 컬럼

**참고용 원본 컬럼** (`_` 접두사 — import 시 무시, admin 교정용):
`_row`, `_timestamp`, `_raw_name`, `_raw_relationship`, `_raw_cellgroup`, `_raw_organization`, `_raw_attendance`, `_title_hint`, `_needs_review`

**import 대상 컬럼**:

| 컬럼 | 채움 | 비고 |
|---|---|---|
| `household_id` | 🤖 자동 | H01… (동일 timestamp) |
| `is_householder` | 🤖 자동 | Self 행 = TRUE |
| `korean_name` | 🤖 best-effort ⚠️ | NOT NULL 필수 |
| `english_name` | 🤖 best-effort ⚠️ | nullable |
| `district` | 🤖 best-effort ⚠️ | DISTRICTS 토큰 or 빈값 |
| `language` | 🤖 자동 | ko/en/es |
| `is_under_6` | 🤖 자동 | 6세미만만 TRUE |
| `attendance` | 🤖 자동 | full/partial |
| `note` | 🤖 자동 | Requests 원문 |
| `gender` | ✍️ admin | male/female (or 빈값) |
| `role` | ✍️ admin | `_title_hint` 참고, ROLES 토큰 |
| `email` | ✍️ admin | 빈값 허용 (nullable) |
| `phone` | ✍️ admin | 빈값 허용 |
| `arrival_at` | ✍️ admin | partial만, `YYYY-MM-DDTHH:MM` wall-clock |
| `departure_at` | ✍️ admin | partial만 |

관리자 전용 컬럼(`paid`, `paid_at`, `retreat_group`, `is_group_leader`, `room_id`)은 import에서 설정하지 않고 DB 기본값 사용.

### ③ SQL 생성 스크립트 — `scripts/import/build_sql.py`

**입력**: `import-worksheet-final.csv` (admin 편집 완료본)
**출력**: `import.sql`

**검증(생성 전 — 하나라도 실패 시 SQL 미생성, 오류 리포트만 출력)**:
- enum 유효성: `district ∈ DISTRICTS ∪ {빈값}`, `role ∈ ROLES`, `gender ∈ {male, female, 빈값}`, `language ∈ LANGUAGES`, `attendance ∈ {full, partial}`.
- `korean_name` 비어있지 않음.
- 각 `household_id` 그룹에 가구주(`is_householder=TRUE`) 정확히 1명.
- `partial` 행의 `arrival_at`/`departure_at` 형식 검증(값이 있을 때 ISO 형태).
- email 중복 없음(비어있지 않은 값 기준, 대소문자 무시) — `attendees` email partial unique 인덱스 대비.

**SQL 구조**:
- 전체를 `begin; … commit;` 트랜잭션으로 감쌈(부분 실패 시 전부 롤백).
- **중복 방지**: 프로덕션에 이미 앱 등록 데이터가 있을 수 있으므로 "행이 있으면 무조건 중단"은 쓰지 않는다. 대신 파일 상단에 (a) 실행 전 현재 `attendees` 행 수를 보여주는 `select count(*)` 안내 주석, (b) `commit` 직전 이번 import로 추가된 행 수를 검증하는 assertion(예: 기대 63행과 실제 삽입 행 수 비교, 불일치 시 `raise exception`으로 롤백)을 둔다. admin은 SQL Editor에서 내용을 검토하고 **1회만** 실행한다(폼 import는 일회성).
- 가구별 CTE로 가구주 → 구성원 자동 링크:
  ```sql
  with hh as (
    insert into attendees (korean_name, english_name, district, gender, role,
      is_householder, householder_id, language, is_under_6, attendance,
      arrival_at, departure_at, note, email, phone)
    values (…가구주… , true, null, …)
    returning id
  )
  insert into attendees (…, householder_id)
  values
    (…, (select id from hh)),   -- 구성원 1
    (…, (select id from hh));   -- 구성원 2
  ```
  - 1인 가구는 단순 insert.
- 문자열은 파라미터가 아닌 리터럴로 생성하되 작은따옴표 이스케이프 처리. wall-clock 시각은 문자열 그대로.

### enum 토큰 미러링

`DISTRICTS`, `ROLES`, `GENDERS`, `LANGUAGES`, `ATTENDANCE` 토큰 리스트를 Python 스크립트 내에 미러링하고, 출처(`src/lib/types.ts`)를 주석으로 명시. 일회성 도구라 런타임 공유 대신 복제 허용.

## 테스트 (TDD)

- 실제 `form-responses.xlsx`를 fixture로 사용.
- `parse_form.py`: 이름 분리·구역 정규화·언어 판별·is_under_6·가구 그룹핑·미정불참 분리 각각에 대해 대표 케이스(뒤섞인 이름, 복수 구역, 영/한 응답, 자녀/배우자) 단위 테스트.
- `build_sql.py`: 검증 로직(enum 위반·가구주 0명/2명·email 중복 감지)과 CTE SQL 생성(1인 가구 / 다인 가구) 테스트.
- 생성된 `import.sql`은 **로컬 Supabase**(`supabase start`)에 먼저 실행해 성공·행 수·가구 링크를 확인한 뒤에야 프로덕션 실행을 admin에게 안내한다.

## 산출물 위치

- 스크립트: `scripts/import/parse_form.py`, `scripts/import/build_sql.py`, 테스트 `scripts/import/test_*.py`
- 중간/최종 CSV·SQL: 저장소에 커밋하지 않음(개인정보). scratchpad 또는 gitignore 처리.

## 범위 밖 (YAGNI)

- 앱 관리자 편집 UI 신설 (name/role/district/email/phone/gender 인라인 편집) — **추후 별도 과제**로 인지됨.
- 반복 실행/멱등 자동 동기화, xlsx 업로드 admin 기능.
- es(스페인어) 응답 처리 로직 — 현재 0건이므로 en 규칙에 흡수, 필요 시 확장.
```
