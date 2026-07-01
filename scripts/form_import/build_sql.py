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
