import unittest
from parse_form import split_name


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


if __name__ == "__main__":
    unittest.main()
