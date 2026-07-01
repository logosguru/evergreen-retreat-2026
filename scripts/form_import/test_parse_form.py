import unittest
from parse_form import split_name, normalize_district


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


if __name__ == "__main__":
    unittest.main()
