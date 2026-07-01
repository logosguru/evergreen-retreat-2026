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
