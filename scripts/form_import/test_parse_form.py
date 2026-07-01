import os
import tempfile
import unittest
import openpyxl
from parse_form import split_name, normalize_district, detect_language, age_to_under6, normalize_attendance
from parse_form import parse_workbook, WORKSHEET_COLUMNS


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


if __name__ == "__main__":
    unittest.main()
