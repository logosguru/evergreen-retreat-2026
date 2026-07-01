"""편집 완료된 import-worksheet CSV → 검증 + 프로덕션용 import.sql."""
import argparse
import csv
import os
import sys

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
        if not (row.get("korean_name") or "").strip() and not (row.get("english_name") or "").strip():
            errors.append(f"{tag}: korean_name/english_name 둘 다 비어있음 (하나는 필수)")
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
        # is_householder=TRUE 가 2개 이상이면 group_households 가 마지막 1개만 잡으므로 원시 카운트로 검증
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
