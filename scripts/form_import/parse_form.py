"""Google Form 응답(xlsx) → 정리용 워크시트 CSV + 미정/불참 followup CSV."""
import argparse
import csv
import os
import re
import openpyxl
from enums import DISTRICTS

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
        # Use word boundary for better matching (avoid "im" matching in "mahanaim")
        for k in keys:
            k_stripped = k.strip()
            # For "im", use word boundaries; for Korean/longer names, substring is fine
            if len(k_stripped) > 2:
                if k_stripped in s:
                    matches.append(token)
                    break
            else:
                if re.search(r"\b" + re.escape(k_stripped) + r"\b", s):
                    matches.append(token)
                    break
    matches = list(dict.fromkeys(matches))
    if len(matches) == 1 and matches[0] in DISTRICTS:
        return matches[0], flags
    return "", ["district"]


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
