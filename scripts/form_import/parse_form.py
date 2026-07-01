"""Google Form 응답(xlsx) → 정리용 워크시트 CSV + 미정/불참 followup CSV."""
import re
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
