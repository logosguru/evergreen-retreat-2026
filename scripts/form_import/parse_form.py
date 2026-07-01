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
