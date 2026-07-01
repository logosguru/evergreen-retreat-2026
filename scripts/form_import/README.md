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
