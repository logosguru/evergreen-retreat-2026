# Google Form → attendees Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Google Form 응답(xlsx)을 파싱해 admin이 편집할 정리용 CSV를 만들고, 편집 완료본을 검증해 프로덕션 `attendees`에 넣을 트랜잭션 SQL을 생성한다.

**Architecture:** 두 개의 독립 Python CLI. `parse_form.py`가 `Expanded_Attendees` 시트를 읽어 best-effort 파싱한 워크시트 CSV + 미정/불참 followup CSV를 출력한다. admin이 CSV의 빈 칸/애매한 셀을 편집한 뒤, `build_sql.py`가 그 최종본을 검증하고 가구별 CTE로 self-FK(`householder_id`)를 연결하는 `import.sql`을 생성한다. 순수 함수(이름 분리·구역 정규화·검증·SQL 생성)를 최대한 분리해 xlsx 없이 단위 테스트한다.

**Tech Stack:** Python 3 (stdlib + openpyxl 3.1.5, 이미 설치됨). 테스트는 stdlib `unittest` (pytest 미설치, 새 의존성 0). 대상 DB는 Supabase Postgres.

## Global Constraints

- 새 런타임/파이썬 의존성 추가 금지. openpyxl(설치됨) + stdlib만 사용.
- 디렉토리는 `scripts/form_import/` (`import`은 Python 예약어라 dir명에 쓰지 않음).
- 테스트 실행은 항상 해당 디렉토리에서: `cd scripts/form_import && python3 -m unittest <mod> -v`.
- enum 토큰은 DB(`supabase/migrations/0001_init.sql`)가 source of truth. `role_t`는 `pastor, elder, gwonsa, deacon, seogyosa, member, student, child, other` (9개 — `src/lib/types.ts`엔 `seogyosa` 누락되어 있으니 DB 기준으로 미러). `DISTRICTS`는 `src/lib/types.ts` 기준: `1..9, im, mahanaim, michael, gideon`.
- `attendees` 제약: `korean_name` NOT NULL, `role` nullable(기본 `member`), `attendance` NOT NULL 기본 `full`, **check `partial_requires_times`: attendance가 `partial`이면 `arrival_at`·`departure_at` 둘 다 NOT NULL 필수**.
- 시각 값은 wall-clock 문자열(`YYYY-MM-DDTHH:MM`) 그대로 저장(타임존 변환 금지).
- 생성 CSV/SQL은 개인정보 → `scripts/form_import/out/`에 쓰고 gitignore. 저장소에 커밋 금지.
- 소스 시트: `Expanded_Attendees` (참석자 1인당 1행). 9컬럼: Timestamp, Attendance Status, Main Registrant Name, Organization, Cell Group (Leader), Requests or Other Comments, Attendee Name, Relationship, Age Group.

## File Structure

- `scripts/form_import/parse_form.py` — xlsx 파싱 + best-effort 변환 + CSV 출력 (Task 1–4)
- `scripts/form_import/enums.py` — DB enum 토큰 미러 (Task 2)
- `scripts/form_import/build_sql.py` — 최종 CSV 검증 + SQL 생성 (Task 5–7)
- `scripts/form_import/test_parse_form.py` — parse 단위/통합 테스트
- `scripts/form_import/test_build_sql.py` — build_sql 단위/통합 테스트
- `scripts/form_import/README.md` — 실행 순서 안내 (Task 7)
- `.gitignore` — `scripts/form_import/out/` 추가 (Task 4)

---

### Task 1: 이름 분리 `split_name()`

**Files:**
- Create: `scripts/form_import/parse_form.py`
- Test: `scripts/form_import/test_parse_form.py`

**Interfaces:**
- Produces: `split_name(raw: str) -> tuple[str, str, str, list[str]]` → `(korean_name, english_name, title_hint, review_flags)`. `review_flags`는 `['name-split']` 또는 `[]`.

- [ ] **Step 1: Write the failing test**

`scripts/form_import/test_parse_form.py`:
```python
import unittest
from parse_form import split_name


class TestSplitName(unittest.TestCase):
    def test_comma_ko_en(self):
        self.assertEqual(split_name("박준영, joonyoung park"),
                         ("박준영", "joonyoung park", "", []))

    def test_paren_en(self):
        self.assertEqual(split_name("안정은 (Mary Ko)"),
                         ("안정은", "Mary Ko", "", []))

    def test_title_and_slash(self):
        self.assertEqual(split_name("박준영 장로 / joonyoung park"),
                         ("박준영", "joonyoung park", "장로", []))

    def test_period_separator(self):
        self.assertEqual(split_name("박명란.  Myungran park"),
                         ("박명란", "Myungran park", "", []))

    def test_english_only_flagged(self):
        ko, en, title, flags = split_name("Mi Young Han")
        self.assertEqual(ko, "")
        self.assertEqual(en, "Mi Young Han")
        self.assertIn("name-split", flags)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scripts/form_import && python3 -m unittest test_parse_form -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'parse_form'`

- [ ] **Step 3: Write minimal implementation**

`scripts/form_import/parse_form.py`:
```python
"""Google Form 응답(xlsx) → 정리용 워크시트 CSV + 미정/불참 followup CSV."""
import re

# 이름에 섞여 들어오는 직함 (긴 것 먼저 매칭)
TITLES = ["서리집사", "전도사", "목사", "장로", "권사", "집사"]
_HANGUL = re.compile(r"[가-힣]")


def _has_hangul(s: str) -> bool:
    return bool(_HANGUL.search(s or ""))


def split_name(raw):
    """'박준영, joonyoung park' → ('박준영', 'joonyoung park', '', [])
    한글 토큰이 없으면 review_flags 에 'name-split'."""
    flags = []
    title_hint = ""
    s = (raw or "").strip()
    for t in sorted(TITLES, key=len, reverse=True):
        if t in s:
            title_hint = t
            s = s.replace(t, " ")
            break
    parts = [p.strip() for p in re.split(r"[,\./()]+", s) if p.strip()]
    korean = ""
    english = ""
    for p in parts:
        if _has_hangul(p):
            korean = korean or p
        else:
            english = english or p
    korean = re.sub(r"\s+", " ", korean).strip()
    english = re.sub(r"\s+", " ", english).strip()
    if not korean:
        flags.append("name-split")
    return korean, english, title_hint, flags
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd scripts/form_import && python3 -m unittest test_parse_form -v`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/form_import/parse_form.py scripts/form_import/test_parse_form.py
git commit -m "feat(import): split_name 이름 한/영/직함 분리"
```

---

### Task 2: 구역 정규화 `normalize_district()` + enums

**Files:**
- Create: `scripts/form_import/enums.py`
- Modify: `scripts/form_import/parse_form.py`
- Test: `scripts/form_import/test_parse_form.py`

**Interfaces:**
- Consumes: `enums.DISTRICTS`
- Produces: `normalize_district(raw: str) -> tuple[str, list[str]]` → `(token_or_empty, review_flags)`. 매칭 실패/복수면 `("", ["district"])`.

- [ ] **Step 1: Write the failing test** (append to `test_parse_form.py`, before the `if __name__` block)

```python
from parse_form import normalize_district


class TestNormalizeDistrict(unittest.TestCase):
    def test_numbered(self):
        self.assertEqual(normalize_district("4구역 (이재훈)"), ("4", []))

    def test_leading_digit(self):
        self.assertEqual(normalize_district("8 - Eldress Woojung Hong"), ("8", []))

    def test_named_korean(self):
        self.assertEqual(normalize_district("미가엘 (문에바다)"), ("michael", []))

    def test_named_english(self):
        self.assertEqual(normalize_district("Mahanaim (Esther and Sarah)"), ("mahanaim", []))

    def test_multiple_flagged(self):
        token, flags = normalize_district("6구역, 마하나임")
        self.assertEqual(token, "")
        self.assertIn("district", flags)

    def test_unmatched_flagged(self):
        token, flags = normalize_district("Sandra Orosio")
        self.assertEqual(token, "")
        self.assertIn("district", flags)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scripts/form_import && python3 -m unittest test_parse_form -v`
Expected: FAIL — `ImportError: cannot import name 'normalize_district'`

- [ ] **Step 3: Write minimal implementation**

Create `scripts/form_import/enums.py`:
```python
"""DB enum 토큰 미러. source of truth = supabase/migrations/0001_init.sql
및 src/lib/types.ts. 일회성 도구라 런타임 공유 대신 복제."""

GENDERS = ("male", "female")

# role_t (DB) — types.ts 는 seogyosa 누락. DB enum 기준으로 미러.
ROLES = ("pastor", "elder", "gwonsa", "deacon", "seogyosa",
         "member", "student", "child", "other")

LANGUAGES = ("ko", "en", "es")
ATTENDANCE = ("full", "partial")

# src/lib/types.ts DISTRICTS
DISTRICTS = ("1", "2", "3", "4", "5", "6", "7", "8", "9",
             "im", "mahanaim", "michael", "gideon")
```

Add to `scripts/form_import/parse_form.py` (below `split_name`):
```python
from enums import DISTRICTS  # noqa: E402  (모듈 상단 import 그룹에 두어도 됨)

# 자유입력 구역명 → DISTRICTS 토큰
_NAMED_DISTRICTS = [
    (("마하나임", "mahanaim"), "mahanaim"),
    (("미가엘", "michael"), "michael"),
    (("기드온", "gideon"), "gideon"),
    (("international", " im ", "im그룹"), "im"),
]


def normalize_district(raw):
    flags = []
    s = (raw or "").strip().lower()
    if not s:
        return "", ["district"]
    matches = []
    for n in re.findall(r"([1-9])\s*구역", s):
        matches.append(n)
    if not matches:
        m = re.match(r"\s*([1-9])\b", s)
        if m:
            matches.append(m.group(1))
    for keys, token in _NAMED_DISTRICTS:
        if any(k.strip() in s for k in keys):
            matches.append(token)
    matches = list(dict.fromkeys(matches))
    if len(matches) == 1 and matches[0] in DISTRICTS:
        return matches[0], flags
    return "", ["district"]
```
> `im` 매칭은 오탐이 많아 좁게(`international`, `im그룹`) 잡는다. 애매하면 `_needs_review`로 admin이 처리.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd scripts/form_import && python3 -m unittest test_parse_form -v`
Expected: PASS (11 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/form_import/enums.py scripts/form_import/parse_form.py scripts/form_import/test_parse_form.py
git commit -m "feat(import): enums 미러 + normalize_district 구역 토큰화"
```

---

### Task 3: 분류기 3종 (언어·6세미만·참석)

**Files:**
- Modify: `scripts/form_import/parse_form.py`
- Test: `scripts/form_import/test_parse_form.py`

**Interfaces:**
- Produces:
  - `detect_language(*texts: str) -> str` → `"ko"` if any text has Hangul else `"en"`.
  - `age_to_under6(raw: str) -> bool` → 6세 미만 라벨일 때만 True.
  - `normalize_attendance(raw: str) -> str | None` → `"full"` / `"partial"` / `None`(미정·불참·불명 = 제외).

- [ ] **Step 1: Write the failing test** (append to `test_parse_form.py`)

```python
from parse_form import detect_language, age_to_under6, normalize_attendance


class TestClassifiers(unittest.TestCase):
    def test_language(self):
        self.assertEqual(detect_language("전일 참석", "이재훈"), "ko")
        self.assertEqual(detect_language("Attending the full retreat", "Joan"), "en")
        self.assertEqual(detect_language("", None), "en")

    def test_under6(self):
        self.assertFalse(age_to_under6("13세 이상"))
        self.assertFalse(age_to_under6("13 or older"))
        self.assertFalse(age_to_under6("6-12세"))
        self.assertFalse(age_to_under6("6-12 y.o."))
        self.assertFalse(age_to_under6(""))
        self.assertTrue(age_to_under6("6세 미만"))
        self.assertTrue(age_to_under6("Younger than 6"))

    def test_attendance(self):
        self.assertEqual(normalize_attendance("전일 참석"), "full")
        self.assertEqual(normalize_attendance("Attending the full retreat"), "full")
        self.assertEqual(normalize_attendance("부분 참석"), "partial")
        self.assertIsNone(normalize_attendance("미정"))
        self.assertIsNone(normalize_attendance("Undecided"))
        self.assertIsNone(normalize_attendance("불참"))
        self.assertIsNone(normalize_attendance("Cannot attend"))
        self.assertIsNone(normalize_attendance(""))
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scripts/form_import && python3 -m unittest test_parse_form -v`
Expected: FAIL — `ImportError: cannot import name 'detect_language'`

- [ ] **Step 3: Write minimal implementation** (append to `parse_form.py`)

```python
def detect_language(*texts):
    for t in texts:
        if t and _has_hangul(str(t)):
            return "ko"
    return "en"


_UNDER6 = ("6세 미만", "under 6", "younger than 6", "6 미만", "만 6세 미만")


def age_to_under6(raw):
    s = (raw or "").strip().lower()
    if not s:
        return False
    return any(lbl.lower() in s for lbl in _UNDER6)


_PARTIAL = ("부분 참석", "부분참석", "partial")
_FULL = ("전일 참석", "전일참석", "attending the full retreat", "full retreat", "full")
_EXCLUDE = ("미정", "undecided", "불참", "cannot attend", "can't attend")


def normalize_attendance(raw):
    s = (raw or "").strip().lower()
    if not s:
        return None
    if any(x in s for x in _PARTIAL):
        return "partial"
    if any(x in s for x in _FULL):
        return "full"
    return None  # 미정·불참·불명 → 제외(followup)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd scripts/form_import && python3 -m unittest test_parse_form -v`
Expected: PASS (14 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/form_import/parse_form.py scripts/form_import/test_parse_form.py
git commit -m "feat(import): 언어/6세미만/참석 분류기"
```

---

### Task 4: 워크북 파싱 + 가구 그룹핑 + CSV 출력 + CLI

**Files:**
- Modify: `scripts/form_import/parse_form.py`
- Test: `scripts/form_import/test_parse_form.py`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `split_name`, `normalize_district`, `detect_language`, `age_to_under6`, `normalize_attendance`.
- Produces:
  - `WORKSHEET_COLUMNS: list[str]`, `FOLLOWUP_COLUMNS: list[str]`.
  - `parse_workbook(path: str) -> tuple[list[dict], list[dict]]` → `(worksheet_rows, followup_rows)`. 각 dict의 key는 해당 COLUMNS.
  - `write_csv(path: str, columns: list[str], rows: list[dict]) -> None`.
  - `main()` — CLI: `python3 parse_form.py <xlsx> [--outdir DIR]`.

- [ ] **Step 1: Write the failing test** (append to `test_parse_form.py`)

```python
import os
import tempfile
import openpyxl
from parse_form import parse_workbook, WORKSHEET_COLUMNS


def _make_wb(path, rows):
    """rows: list of 9-tuples matching Expanded_Attendees columns."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Expanded_Attendees"
    ws.append(["Timestamp", "Attendance Status", "Main Registrant Name",
               "Organization", "Cell Group (Leader)", "Requests or Other Comments",
               "Attendee Name", "Relationship", "Age Group"])
    for r in rows:
        ws.append(list(r))
    wb.save(path)


class TestParseWorkbook(unittest.TestCase):
    def test_grouping_and_exclusion(self):
        rows = [
            # 가구 A: 가구주(전일) + 배우자 + 미성년 자녀
            ("2026-05-31 12:00", "전일 참석", "이재훈", "남선교회", "4구역 (이재훈)",
             "", "이재훈", "Self", "13세 이상"),
            ("2026-05-31 12:00", "전일 참석", "이재훈", "남선교회", "4구역 (이재훈)",
             "", "박인경", "배우자", "6세 미만"),
            # 가구 B: 영어 응답 1인
            ("2026-06-02 09:00", "Attending the full retreat", "Ebada Mun", "Michael",
             "Michael group", "", "Ebada Mun", "Self", "13 or older"),
            # 불참 → followup
            ("2026-06-03 10:00", "Cannot attend", "Kaitlyn Hung", "Michael", "Ebada",
             "", "Kaitlyn Hung", "Me", "13 or older"),
        ]
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "s.xlsx")
            _make_wb(p, rows)
            worksheet, followup = parse_workbook(p)

        self.assertEqual(len(worksheet), 3)   # 불참 제외
        self.assertEqual(len(followup), 1)

        # 가구 그룹핑: 2개 household
        hids = {r["household_id"] for r in worksheet}
        self.assertEqual(len(hids), 2)

        # 가구주 정확히 1명씩
        a = [r for r in worksheet if r["_raw_name"] == "이재훈"][0]
        self.assertEqual(a["is_householder"], "TRUE")
        spouse = [r for r in worksheet if r["_raw_name"] == "박인경"][0]
        self.assertEqual(spouse["is_householder"], "FALSE")
        self.assertEqual(spouse["household_id"], a["household_id"])

        # 파생 필드
        self.assertEqual(a["korean_name"], "이재훈")
        self.assertEqual(a["district"], "4")
        self.assertEqual(a["language"], "ko")
        self.assertEqual(spouse["is_under_6"], "TRUE")
        b = [r for r in worksheet if r["_raw_name"] == "Ebada Mun"][0]
        self.assertEqual(b["language"], "en")
        self.assertEqual(b["district"], "michael")

        # 모든 행이 WORKSHEET_COLUMNS 키를 가진다
        for r in worksheet:
            self.assertEqual(set(r.keys()), set(WORKSHEET_COLUMNS))
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scripts/form_import && python3 -m unittest test_parse_form -v`
Expected: FAIL — `ImportError: cannot import name 'parse_workbook'`

- [ ] **Step 3: Write minimal implementation** (append to `parse_form.py`)

```python
import argparse
import csv
import os
import openpyxl

WORKSHEET_COLUMNS = [
    "_row", "_timestamp", "_raw_name", "_raw_relationship", "_raw_cellgroup",
    "_raw_organization", "_raw_attendance", "_raw_age", "_title_hint", "_needs_review",
    "household_id", "is_householder", "korean_name", "english_name", "district",
    "language", "is_under_6", "attendance", "note",
    "gender", "role", "email", "phone", "arrival_at", "departure_at",
]
FOLLOWUP_COLUMNS = [
    "_timestamp", "_raw_name", "_raw_relationship", "_raw_cellgroup",
    "_raw_organization", "_raw_attendance", "_raw_age",
]

_SELF_REL = ("self", "본인", "me", "it's me", "it’s me", "na", "n/a", "")


def _norm(s):
    return re.sub(r"\s+", " ", (s or "").strip()).lower()


def _b(v):
    return "TRUE" if v else "FALSE"


def parse_workbook(path):
    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb["Expanded_Attendees"]

    raw = []
    for r in ws.iter_rows(min_row=2, values_only=True):
        r = (list(r) + [None] * 9)[:9]
        if all(v is None or str(v).strip() == "" for v in r):
            continue
        ts, status, main, org, cell, req, name, rel, age = r
        raw.append(dict(ts=ts, status=status, main=main, org=org, cell=cell,
                        req=req, name=name, rel=rel, age=age))

    # timestamp 순서대로 가구 그룹핑
    order = []
    groups = {}
    for row in raw:
        key = str(row["ts"])
        if key not in groups:
            groups[key] = []
            order.append(key)
        groups[key].append(row)

    worksheet, followup = [], []
    hcount = 0
    seq = 0
    for key in order:
        members = groups[key]
        included = [m for m in members if normalize_attendance(m["status"]) is not None]
        excluded = [m for m in members if normalize_attendance(m["status"]) is None]
        for m in excluded:
            followup.append({
                "_timestamp": str(m["ts"]), "_raw_name": m["name"] or "",
                "_raw_relationship": m["rel"] or "", "_raw_cellgroup": m["cell"] or "",
                "_raw_organization": m["org"] or "", "_raw_attendance": m["status"] or "",
                "_raw_age": m["age"] or "",
            })
        if not included:
            continue
        hcount += 1
        hid = f"H{hcount:02d}"
        # 가구주: 이름이 main 과 일치 → 없으면 self relationship → 없으면 첫 행
        head = next((m for m in included if _norm(m["name"]) == _norm(m["main"])), None)
        if head is None:
            head = next((m for m in included if _norm(m["rel"]) in _SELF_REL), None)
        if head is None:
            head = included[0]
        for m in included:
            seq += 1
            ko, en, title, name_flags = split_name(m["name"])
            dist, dist_flags = normalize_district(m["cell"])
            flags = name_flags + dist_flags
            worksheet.append({
                "_row": str(seq),
                "_timestamp": str(m["ts"]),
                "_raw_name": m["name"] or "",
                "_raw_relationship": m["rel"] or "",
                "_raw_cellgroup": m["cell"] or "",
                "_raw_organization": m["org"] or "",
                "_raw_attendance": m["status"] or "",
                "_raw_age": m["age"] or "",
                "_title_hint": title,
                "_needs_review": ", ".join(flags),
                "household_id": hid,
                "is_householder": _b(m is head),
                "korean_name": ko,
                "english_name": en,
                "district": dist,
                "language": detect_language(m["status"], m["name"], m["rel"]),
                "is_under_6": _b(age_to_under6(m["age"])),
                "attendance": normalize_attendance(m["status"]),
                "note": m["req"] or "",
                "gender": "", "role": "", "email": "", "phone": "",
                "arrival_at": "", "departure_at": "",
            })
    return worksheet, followup


def write_csv(path, columns, rows):
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=columns)
        w.writeheader()
        for r in rows:
            w.writerow(r)


def main():
    ap = argparse.ArgumentParser(description="Google Form xlsx → import worksheet CSV")
    ap.add_argument("xlsx")
    ap.add_argument("--outdir", default=os.path.join(os.path.dirname(__file__), "out"))
    args = ap.parse_args()
    os.makedirs(args.outdir, exist_ok=True)
    worksheet, followup = parse_workbook(args.xlsx)
    ws_path = os.path.join(args.outdir, "import-worksheet.csv")
    fu_path = os.path.join(args.outdir, "followup-undecided-absent.csv")
    write_csv(ws_path, WORKSHEET_COLUMNS, worksheet)
    write_csv(fu_path, FOLLOWUP_COLUMNS, followup)
    print(f"worksheet: {len(worksheet)} rows → {ws_path}")
    print(f"followup:  {len(followup)} rows → {fu_path}")


if __name__ == "__main__":
    main()
```
> `utf-8-sig`(BOM)으로 써야 Excel이 한글을 깨지 않고 연다.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd scripts/form_import && python3 -m unittest test_parse_form -v`
Expected: PASS (15 tests)

- [ ] **Step 5: Add gitignore for outputs**

Append to `.gitignore` (프로젝트 루트):
```
# form import 산출물 (개인정보 — 커밋 금지)
scripts/form_import/out/
```

- [ ] **Step 6: Smoke-run against the real file**

Run: `cd scripts/form_import && python3 parse_form.py /Users/logosguru/Downloads/form-responses.xlsx`
Expected 출력: `worksheet: 약 55~60 rows` (63명 중 미정·불참 제외), `followup: 약 3~8 rows`. 오류 없이 두 CSV 생성.

- [ ] **Step 7: Commit**

```bash
git add scripts/form_import/parse_form.py scripts/form_import/test_parse_form.py .gitignore
git commit -m "feat(import): parse_workbook 가구 그룹핑 + CSV 출력 + CLI"
```

---

### Task 5: 최종 CSV 읽기 + 가구 그룹핑 + 검증

**Files:**
- Create: `scripts/form_import/build_sql.py`
- Test: `scripts/form_import/test_build_sql.py`

**Interfaces:**
- Consumes: `enums.{DISTRICTS, ROLES, GENDERS, LANGUAGES, ATTENDANCE}`.
- Produces:
  - `read_csv(path: str) -> list[dict]`.
  - `group_households(rows: list[dict]) -> list[dict]` → 각 `{"id": str, "householder": dict|None, "members": list[dict]}`, 입력 등장 순서 유지.
  - `validate_rows(rows: list[dict]) -> list[str]` → 오류 메시지 리스트(빈 리스트면 통과).

- [ ] **Step 1: Write the failing test**

`scripts/form_import/test_build_sql.py`:
```python
import unittest
from build_sql import group_households, validate_rows


def _row(**kw):
    base = dict(household_id="H01", is_householder="FALSE", korean_name="홍길동",
                english_name="", district="", gender="", role="", language="ko",
                is_under_6="FALSE", attendance="full", arrival_at="", departure_at="",
                note="", email="", phone="", _raw_name="홍길동")
    base.update(kw)
    return base


class TestGroupHouseholds(unittest.TestCase):
    def test_group(self):
        rows = [_row(household_id="H01", is_householder="TRUE", korean_name="가장"),
                _row(household_id="H01", korean_name="식구"),
                _row(household_id="H02", is_householder="TRUE", korean_name="독거")]
        hh = group_households(rows)
        self.assertEqual(len(hh), 2)
        self.assertEqual(hh[0]["householder"]["korean_name"], "가장")
        self.assertEqual(len(hh[0]["members"]), 1)
        self.assertEqual(hh[1]["members"], [])


class TestValidate(unittest.TestCase):
    def test_ok(self):
        rows = [_row(household_id="H01", is_householder="TRUE", role="elder")]
        self.assertEqual(validate_rows(rows), [])

    def test_missing_korean_name(self):
        rows = [_row(household_id="H01", is_householder="TRUE", korean_name="")]
        self.assertTrue(any("korean_name" in e for e in validate_rows(rows)))

    def test_bad_enum(self):
        rows = [_row(household_id="H01", is_householder="TRUE", district="99",
                     role="bishop", gender="x", language="fr", attendance="maybe")]
        errs = validate_rows(rows)
        self.assertTrue(any("district" in e for e in errs))
        self.assertTrue(any("role" in e for e in errs))
        self.assertTrue(any("gender" in e for e in errs))
        self.assertTrue(any("language" in e for e in errs))
        self.assertTrue(any("attendance" in e for e in errs))

    def test_householder_count(self):
        rows = [_row(household_id="H01", is_householder="FALSE"),
                _row(household_id="H01", is_householder="FALSE")]
        self.assertTrue(any("가구주" in e for e in validate_rows(rows)))

    def test_partial_requires_times(self):
        rows = [_row(household_id="H01", is_householder="TRUE",
                     attendance="partial", arrival_at="", departure_at="")]
        self.assertTrue(any("partial" in e for e in validate_rows(rows)))

    def test_email_duplicate(self):
        rows = [_row(household_id="H01", is_householder="TRUE", email="a@b.com"),
                _row(household_id="H02", is_householder="TRUE", email="A@b.com")]
        self.assertTrue(any("email" in e.lower() for e in validate_rows(rows)))


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scripts/form_import && python3 -m unittest test_build_sql -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'build_sql'`

- [ ] **Step 3: Write minimal implementation**

`scripts/form_import/build_sql.py`:
```python
"""편집 완료된 import-worksheet CSV → 검증 + 프로덕션용 import.sql."""
import argparse
import csv
import os

from enums import DISTRICTS, ROLES, GENDERS, LANGUAGES, ATTENDANCE


def read_csv(path):
    with open(path, newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def _truthy(v):
    return str(v).strip().lower() in ("true", "1", "yes", "t")


def group_households(rows):
    order = []
    groups = {}
    for row in rows:
        hid = row.get("household_id")
        if hid not in groups:
            groups[hid] = {"id": hid, "householder": None, "members": []}
            order.append(hid)
        if _truthy(row.get("is_householder")):
            groups[hid]["householder"] = row
        else:
            groups[hid]["members"].append(row)
    return [groups[h] for h in order]


def validate_rows(rows):
    errors = []
    for i, row in enumerate(rows, 1):
        who = row.get("_raw_name") or row.get("korean_name") or "?"
        tag = f"row {i} ({who})"
        if not (row.get("korean_name") or "").strip():
            errors.append(f"{tag}: korean_name 비어있음")
        d = (row.get("district") or "").strip()
        if d and d not in DISTRICTS:
            errors.append(f"{tag}: district '{d}' 유효하지 않음")
        r = (row.get("role") or "").strip()
        if r and r not in ROLES:
            errors.append(f"{tag}: role '{r}' 유효하지 않음")
        g = (row.get("gender") or "").strip()
        if g and g not in GENDERS:
            errors.append(f"{tag}: gender '{g}' 유효하지 않음")
        lang = (row.get("language") or "").strip()
        if lang not in LANGUAGES:
            errors.append(f"{tag}: language '{lang}' 유효하지 않음")
        att = (row.get("attendance") or "").strip()
        if att not in ATTENDANCE:
            errors.append(f"{tag}: attendance '{att}' 유효하지 않음")
        if att == "partial":
            if not (row.get("arrival_at") or "").strip() or not (row.get("departure_at") or "").strip():
                errors.append(f"{tag}: partial인데 arrival_at/departure_at 비어있음 (DB constraint 위반)")

    for hh in group_households(rows):
        n = 1 if hh["householder"] else 0
        heads_extra = sum(1 for _ in [])  # householder 는 group_households 가 1개만 잡음
        # is_householder=TRUE 가 2개 이상이면 마지막이 householder 로 덮이므로 원시 카운트로 검증
        raw_heads = [r for r in rows if r.get("household_id") == hh["id"] and _truthy(r.get("is_householder"))]
        if len(raw_heads) != 1:
            errors.append(f"household {hh['id']}: 가구주 {len(raw_heads)}명 (정확히 1명이어야 함)")

    seen = {}
    for i, row in enumerate(rows, 1):
        e = (row.get("email") or "").strip().lower()
        if e:
            if e in seen:
                errors.append(f"email 중복: '{e}' (row {seen[e]}, {i})")
            else:
                seen[e] = i
    return errors
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd scripts/form_import && python3 -m unittest test_build_sql -v`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/form_import/build_sql.py scripts/form_import/test_build_sql.py
git commit -m "feat(import): CSV 읽기 + 가구 그룹핑 + 검증(enum/가구주/partial/email)"
```

---

### Task 6: SQL 생성 `build_sql()`

**Files:**
- Modify: `scripts/form_import/build_sql.py`
- Test: `scripts/form_import/test_build_sql.py`

**Interfaces:**
- Consumes: `group_households`.
- Produces:
  - `sql_str(v) -> str` (`null` 또는 이스케이프된 `'...'`), `sql_bool(v) -> str` (`true`/`false`).
  - `build_sql(rows: list[dict], expected_count: int) -> str` — `begin;` … 가구별 CTE … 행수 assertion … `commit;` 전체 문자열.

- [ ] **Step 1: Write the failing test** (append to `test_build_sql.py`)

```python
from build_sql import build_sql, sql_str


class TestSqlHelpers(unittest.TestCase):
    def test_sql_str(self):
        self.assertEqual(sql_str(""), "null")
        self.assertEqual(sql_str(None), "null")
        self.assertEqual(sql_str("O'Brien"), "'O''Brien'")


class TestBuildSql(unittest.TestCase):
    def test_single_person_household(self):
        rows = [_row(household_id="H01", is_householder="TRUE", korean_name="독거",
                     role="member")]
        sql = build_sql(rows, expected_count=1)
        self.assertIn("begin;", sql)
        self.assertIn("commit;", sql)
        self.assertIn("insert into public.attendees", sql)
        self.assertIn("'독거'", sql)
        self.assertNotIn("with hh", sql)   # 1인 가구는 CTE 불필요
        self.assertIn("expected", sql.lower())  # 행수 assertion 존재

    def test_multi_person_household_links_via_cte(self):
        rows = [_row(household_id="H01", is_householder="TRUE", korean_name="가장", role="elder"),
                _row(household_id="H01", is_householder="FALSE", korean_name="식구", role="member")]
        sql = build_sql(rows, expected_count=2)
        self.assertIn("with hh as (", sql)
        self.assertIn("returning id", sql)
        self.assertIn("(select id from hh)", sql)
        self.assertIn("'가장'", sql)
        self.assertIn("'식구'", sql)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scripts/form_import && python3 -m unittest test_build_sql -v`
Expected: FAIL — `ImportError: cannot import name 'build_sql'`

- [ ] **Step 3: Write minimal implementation** (append to `build_sql.py`)

```python
INSERT_COLS = ["korean_name", "english_name", "district", "gender", "role",
               "is_householder", "householder_id", "language", "is_under_6",
               "attendance", "arrival_at", "departure_at", "note", "email", "phone"]


def sql_str(v):
    if v is None or str(v).strip() == "":
        return "null"
    return "'" + str(v).strip().replace("'", "''") + "'"


def sql_bool(v):
    return "true" if _truthy(v) else "false"


def _values(row, householder_expr):
    """householder_expr: 'null' (가구주) 또는 '(select id from hh)' (구성원)."""
    role = (row.get("role") or "").strip() or "member"  # 빈값이면 DB 기본값과 동일하게
    v = {
        "korean_name": sql_str(row.get("korean_name")),
        "english_name": sql_str(row.get("english_name")),
        "district": sql_str(row.get("district")),
        "gender": sql_str(row.get("gender")),
        "role": sql_str(role),
        "is_householder": sql_bool(row.get("is_householder")),
        "householder_id": householder_expr,
        "language": sql_str(row.get("language")),
        "is_under_6": sql_bool(row.get("is_under_6")),
        "attendance": sql_str(row.get("attendance")),
        "arrival_at": sql_str(row.get("arrival_at")),
        "departure_at": sql_str(row.get("departure_at")),
        "note": sql_str(row.get("note")),
        "email": sql_str(row.get("email")),
        "phone": sql_str(row.get("phone")),
    }
    return "(" + ", ".join(v[c] for c in INSERT_COLS) + ")"


def _cols_sql():
    return "(" + ", ".join(INSERT_COLS) + ")"


def build_sql(rows, expected_count):
    out = []
    out.append("-- 늘푸른교회 수련회 Google Form → attendees import")
    out.append("-- 실행 전 참고: select count(*) from public.attendees;")
    out.append("begin;")
    out.append("create temp table _before on commit drop as select count(*) c from public.attendees;")
    out.append("")
    for hh in group_households(rows):
        head = hh["householder"]
        members = hh["members"]
        if not members:
            out.append(f"-- {hh['id']} (1인)")
            out.append(f"insert into public.attendees {_cols_sql()}")
            out.append(f"values {_values(head, 'null')};")
        else:
            out.append(f"-- {hh['id']} (가구주 + {len(members)}인)")
            out.append("with hh as (")
            out.append(f"  insert into public.attendees {_cols_sql()}")
            out.append(f"  values {_values(head, 'null')}")
            out.append("  returning id")
            out.append(")")
            out.append(f"insert into public.attendees {_cols_sql()}")
            vals = ",\n".join("  " + _values(m, "(select id from hh)") for m in members)
            out.append("values")
            out.append(vals + ";")
        out.append("")
    out.append("do $$")
    out.append("declare b int; a int; expected int := %d;" % expected_count)
    out.append("begin")
    out.append("  select c into b from _before;")
    out.append("  select count(*) into a from public.attendees;")
    out.append("  if a - b <> expected then")
    out.append("    raise exception 'Import 행수 불일치: expected % new rows, got %', expected, a - b;")
    out.append("  end if;")
    out.append("end $$;")
    out.append("commit;")
    return "\n".join(out) + "\n"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd scripts/form_import && python3 -m unittest test_build_sql -v`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/form_import/build_sql.py scripts/form_import/test_build_sql.py
git commit -m "feat(import): build_sql 가구별 CTE + 행수 assertion SQL 생성"
```

---

### Task 7: build_sql CLI + README + 로컬 Supabase 통합 검증

**Files:**
- Modify: `scripts/form_import/build_sql.py`
- Create: `scripts/form_import/README.md`
- Test: `scripts/form_import/test_build_sql.py`

**Interfaces:**
- Consumes: `read_csv`, `validate_rows`, `build_sql`.
- Produces: `main()` — CLI: `python3 build_sql.py <final_csv> [--out PATH]`. 검증 실패 시 오류를 stderr로 출력하고 exit 1, SQL 미생성.

- [ ] **Step 1: Write the failing test** (append to `test_build_sql.py`)

```python
import os
import tempfile
import csv as _csv
from build_sql import read_csv


class TestReadCsv(unittest.TestCase):
    def test_roundtrip(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "w.csv")
            with open(p, "w", newline="", encoding="utf-8-sig") as f:
                w = _csv.DictWriter(f, fieldnames=["household_id", "korean_name"])
                w.writeheader()
                w.writerow({"household_id": "H01", "korean_name": "김철수"})
            rows = read_csv(p)
        self.assertEqual(rows[0]["korean_name"], "김철수")
        self.assertEqual(rows[0]["household_id"], "H01")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scripts/form_import && python3 -m unittest test_build_sql -v`
Expected: FAIL — `ImportError: cannot import name 'read_csv'` (아직 export 안 됨 → 실제로는 Task5에서 정의됨; 이 스텝은 read_csv 를 실제 파일로 검증하는 통합 테스트 추가가 목적. 이미 정의돼 있으면 곧장 통과할 수 있으니 Step 3로 진행)

- [ ] **Step 3: Write minimal implementation** (append `main()` to `build_sql.py`)

```python
import sys


def main():
    ap = argparse.ArgumentParser(description="편집 완료 CSV → import.sql (검증 포함)")
    ap.add_argument("final_csv")
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    rows = read_csv(args.final_csv)
    errors = validate_rows(rows)
    if errors:
        print(f"검증 실패 — {len(errors)}건, SQL 생성 안 함:", file=sys.stderr)
        for e in errors:
            print("  - " + e, file=sys.stderr)
        sys.exit(1)

    out_path = args.out or os.path.join(os.path.dirname(args.final_csv), "import.sql")
    sql = build_sql(rows, expected_count=len(rows))
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(sql)
    print(f"검증 통과 ({len(rows)}명) → {out_path}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd scripts/form_import && python3 -m unittest test_build_sql -v`
Expected: PASS (11 tests)

Run 전체: `cd scripts/form_import && python3 -m unittest test_parse_form test_build_sql -v`
Expected: 모든 테스트 PASS.

- [ ] **Step 5: Write README**

`scripts/form_import/README.md`:
```markdown
# Google Form → attendees import 도구 (일회성)

설계: `docs/superpowers/specs/2026-07-01-form-import-design.md`

## 실행 순서

1. **파싱** — xlsx → 정리용 CSV
   ```bash
   cd scripts/form_import
   python3 parse_form.py /path/to/form-responses.xlsx
   # → out/import-worksheet.csv, out/followup-undecided-absent.csv
   ```
2. **admin 편집** — `out/import-worksheet.csv`를 Excel/Google Sheets에서 열어
   - `_needs_review`에 표시된 행의 `korean_name`/`english_name`/`district` 교정
   - `gender`(male/female), `role`(pastor/elder/gwonsa/deacon/seogyosa/member/student/child/other), `email`, `phone` 입력
   - `attendance=partial` 행은 **`arrival_at`/`departure_at` 필수** (`YYYY-MM-DDTHH:MM`)
   - 저장(CSV, UTF-8). 예: `out/import-worksheet-final.csv`
3. **SQL 생성** — 검증 후 import.sql
   ```bash
   python3 build_sql.py out/import-worksheet-final.csv
   # 검증 실패 시 오류 출력 + 종료(SQL 미생성). 통과 시 out/import.sql 생성
   ```
4. **로컬 검증** — 프로덕션 전 로컬 Supabase에서 먼저 실행
   ```bash
   supabase start
   psql "$(supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '\"')" -f out/import.sql
   # 행수 assertion 통과 + 가구 링크 확인
   ```
5. **프로덕션** — Supabase 대시보드 SQL Editor에 `out/import.sql` 붙여넣고 검토 후 실행.

## 테스트
```bash
cd scripts/form_import && python3 -m unittest test_parse_form test_build_sql -v
```
```

- [ ] **Step 6: 로컬 Supabase 통합 검증 (실데이터)**

전체 파이프라인을 실데이터로 1회 실행하되 편집 단계는 최소로:
```bash
cd scripts/form_import
python3 parse_form.py /Users/logosguru/Downloads/form-responses.xlsx
# out/import-worksheet.csv 를 복사해 필수 필드(partial 시각 등)만 채운 -final.csv 준비
cp out/import-worksheet.csv out/import-worksheet-final.csv
# (partial 가구가 있으면 arrival_at/departure_at 임시로 채워 검증 통과시킴)
python3 build_sql.py out/import-worksheet-final.csv
```
로컬 Supabase가 켜져 있으면 `out/import.sql`을 로컬 DB에 실행해 성공·행수 assertion·가구 링크를 확인. (프로덕션 실행은 admin이 대시보드에서 직접.)
> 이 스텝의 산출물(CSV/SQL)은 gitignore되어 커밋되지 않는다.

- [ ] **Step 7: Commit**

```bash
git add scripts/form_import/build_sql.py scripts/form_import/test_build_sql.py scripts/form_import/README.md
git commit -m "feat(import): build_sql CLI + README + 통합 검증 절차"
```

---

## Self-Review Notes

- **Spec coverage**: 파싱 규칙(이름/구역/언어/6세미만/참석) = Task 1–3, 가구 그룹핑·워크시트 CSV·followup = Task 4, 검증(enum/가구주/email/partial) = Task 5, CTE SQL + 행수 assertion = Task 6, CLI/README/로컬검증 = Task 7. 미정·불참 followup 분리 = Task 4. ✅
- **partial_requires_times**: 스펙 작성 후 발견한 DB check 제약을 Task 5 검증 + Task 7 README에 반영. ✅
- **role_t seogyosa**: DB enum 기준으로 `enums.py`에 미러(Task 2). ✅
- **중복 import 방지**: "행 있으면 중단"이 아니라 before/after 행수 assertion(Task 6). ✅
- **PII**: 산출물 gitignore(Task 4). ✅
```
