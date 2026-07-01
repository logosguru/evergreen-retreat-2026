import unittest
from parse_form import split_name, normalize_district, detect_language, age_to_under6, normalize_attendance


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


if __name__ == "__main__":
    unittest.main()
