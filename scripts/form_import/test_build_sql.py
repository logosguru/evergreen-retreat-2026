import unittest
from build_sql import group_households, validate_rows


def _row(**kw):
    base = dict(household_id="H01", is_householder="FALSE", korean_name="홍길동",
                english_name="", district="", gender="", role="", language="ko",
                is_under_6="FALSE", attendance="full", arrival_at="", departure_at="",
                note="", email="", phone="", _raw_name="홍길동")
    base.update(kw)
    return base


class TestGroupHouseholds(unittest.TestCase):
    def test_group(self):
        rows = [_row(household_id="H01", is_householder="TRUE", korean_name="가장"),
                _row(household_id="H01", korean_name="식구"),
                _row(household_id="H02", is_householder="TRUE", korean_name="독거")]
        hh = group_households(rows)
        self.assertEqual(len(hh), 2)
        self.assertEqual(hh[0]["householder"]["korean_name"], "가장")
        self.assertEqual(len(hh[0]["members"]), 1)
        self.assertEqual(hh[1]["members"], [])


class TestValidate(unittest.TestCase):
    def test_ok(self):
        rows = [_row(household_id="H01", is_householder="TRUE", role="elder")]
        self.assertEqual(validate_rows(rows), [])

    def test_missing_korean_name(self):
        rows = [_row(household_id="H01", is_householder="TRUE", korean_name="")]
        self.assertTrue(any("korean_name" in e for e in validate_rows(rows)))

    def test_bad_enum(self):
        rows = [_row(household_id="H01", is_householder="TRUE", district="99",
                     role="bishop", gender="x", language="fr", attendance="maybe")]
        errs = validate_rows(rows)
        self.assertTrue(any("district" in e for e in errs))
        self.assertTrue(any("role" in e for e in errs))
        self.assertTrue(any("gender" in e for e in errs))
        self.assertTrue(any("language" in e for e in errs))
        self.assertTrue(any("attendance" in e for e in errs))

    def test_householder_count(self):
        rows = [_row(household_id="H01", is_householder="FALSE"),
                _row(household_id="H01", is_householder="FALSE")]
        self.assertTrue(any("가구주" in e for e in validate_rows(rows)))

    def test_partial_requires_times(self):
        rows = [_row(household_id="H01", is_householder="TRUE",
                     attendance="partial", arrival_at="", departure_at="")]
        self.assertTrue(any("partial" in e for e in validate_rows(rows)))

    def test_email_duplicate(self):
        rows = [_row(household_id="H01", is_householder="TRUE", email="a@b.com"),
                _row(household_id="H02", is_householder="TRUE", email="A@b.com")]
        self.assertTrue(any("email" in e.lower() for e in validate_rows(rows)))


if __name__ == "__main__":
    unittest.main()
