"""
Tests for scrape_myschools.py (issue #135).

Runs entirely against saved fixtures in myschools_fixtures/ -- no network
calls. Run with: python3 -m pytest scripts/test_scrape_myschools.py
"""

import json
from pathlib import Path

import pytest

from scrape_myschools import (
    MySchoolsParseError,
    parse_programs,
)

FIXTURES = Path(__file__).parent / "myschools_fixtures"
FAKE_URL = "https://www.myschools.nyc/en/api/v2/schools/process/1/fixture/"
FAKE_FETCHED_AT = "2026-08-05T00:00:00+00:00"


def load_fixture(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text())


def test_laguardia_returns_six_distinct_programs():
    raw = load_fixture("laguardia_03M485.json")
    programs = parse_programs(raw, FAKE_URL, FAKE_FETCHED_AT)

    assert len(programs) == 6

    names = [p.program_name for p in programs]
    assert len(set(names)) == 6, f"expected 6 distinct names, got {names}"
    assert {"Dance", "Drama", "Fine Arts", "Instrumental Music", "Technical Theater", "Vocal Music"} == set(names)

    codes = [p.program_code for p in programs]
    assert len(set(codes)) == 6

    for p in programs:
        assert p.dbn == "03M485"
        assert p.admissions_method == "Audition"


def test_single_program_school_returns_one_record():
    raw = load_fixture("single_program_02M047.json")
    programs = parse_programs(raw, FAKE_URL, FAKE_FETCHED_AT)

    assert len(programs) == 1
    program = programs[0]
    assert program.dbn == "02M047"
    assert program.program_name == "American Sign Language Studies Program"
    assert program.admissions_method == "Screened"


def test_mixed_admissions_methods_school():
    raw = load_fixture("mixed_methods_gramercy_02M374.json")
    programs = parse_programs(raw, FAKE_URL, FAKE_FETCHED_AT)

    assert len(programs) == 3
    methods = {p.program_name: p.admissions_method for p in programs}
    assert methods == {
        "Capstone Scholars": "Screened With Assessment",
        "Theater Arts": "Audition",
        "Visual Arts": "Audition",
    }
    # Not all six programs are the same method -- distinguishes this school
    # from LaGuardia, where a single school-level "track" would be wrong.
    assert len(set(methods.values())) > 1


def test_malformed_page_shape_fails_loudly():
    raw = load_fixture("malformed_missing_programs.json")
    with pytest.raises(MySchoolsParseError):
        parse_programs(raw, FAKE_URL, FAKE_FETCHED_AT)


def test_not_a_dict_fails_loudly():
    with pytest.raises(MySchoolsParseError):
        parse_programs(["not", "a", "dict"], FAKE_URL, FAKE_FETCHED_AT)


def test_empty_programs_list_fails_loudly():
    raw = load_fixture("single_program_02M047.json")
    raw["programs"] = []
    with pytest.raises(MySchoolsParseError):
        parse_programs(raw, FAKE_URL, FAKE_FETCHED_AT)


def test_provenance_is_captured_from_the_page_not_hardcoded():
    raw = load_fixture("laguardia_03M485.json")
    programs = parse_programs(raw, FAKE_URL, FAKE_FETCHED_AT)

    for p in programs:
        prov = p.provenance.to_dict()
        assert prov["source"] == "MySchools"
        assert prov["url"] == FAKE_URL
        assert prov["fetched_at"] == FAKE_FETCHED_AT
        # Derived from school.school_year in the fixture, not typed by hand.
        assert prov["admissions_cycle"] == raw["school"]["school_year"]


def test_missing_fields_are_absent_not_empty_or_zero():
    raw = load_fixture("laguardia_03M485.json")
    programs = parse_programs(raw, FAKE_URL, FAKE_FETCHED_AT)
    dance = next(p for p in programs if p.program_name == "Dance")
    serialized = dance.to_dict()

    # The Dance program's own grades_description is blank in the fixture,
    # but grade_span still comes back present via the school-level fallback.
    assert serialized["grade_span"] == "9 to 12"

    # Fields with no data anywhere (e.g. this program's general-education
    # seat count is null in the fixture) must be absent, not "" or 0.
    seats = serialized.get("seats", {})
    assert "general_education" not in seats or seats["general_education"].get("seats") not in (0, "", None)

    for key, value in serialized.items():
        if isinstance(value, str):
            assert value != "", f"{key} should be omitted, not an empty string"
        if isinstance(value, (list, dict)):
            assert len(value) > 0, f"{key} should be omitted, not empty"
