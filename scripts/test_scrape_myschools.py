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
    parse_school_meta,
)

FIXTURES = Path(__file__).parent / "myschools_fixtures"
FAKE_URL = "https://www.myschools.nyc/en/api/v2/schools/process/1/fixture/"
FAKE_FETCHED_AT = "2026-08-05T00:00:00+00:00"


def load_fixture(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text())


def _raw_with_priority_groups(priority_groups: list) -> dict:
    return {
        "school": {"dbn": "99X999", "school_year": "2025-26 School Year"},
        "name": "Test School",
        "programs": [
            {
                "program": {"name": "Test Program", "code": "T1"},
                "admissions_method": {"name": "Screened"},
                "program_priority_groups": priority_groups,
            }
        ],
    }


def _walk_strings(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for v in value.values():
            yield from _walk_strings(v)
    elif isinstance(value, list):
        for v in value:
            yield from _walk_strings(v)


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


def test_empty_priority_group_descriptions_are_dropped_not_kept_as_empty_strings():
    # Mirrors what MySchools actually returns (issue #252): a real group
    # with valid id/order/name but blank ge_/swd_priority_group_description.
    raw = _raw_with_priority_groups(
        [
            {
                "id": 1,
                "order": 1,
                "name": "New York City residents",
                "ge_priority_group_description": "",
                "swd_priority_group_description": "   ",
            }
        ]
    )
    programs = parse_programs(raw, FAKE_URL, FAKE_FETCHED_AT)
    serialized = programs[0].to_dict()

    for s in _walk_strings(serialized):
        assert s.strip() != "", f"found a blank string in serialized output: {serialized!r}"

    groups = serialized["eligibility"]["priority_groups"]
    assert len(groups) == 1
    assert groups[0]["name"] == "New York City residents"
    assert "ge_priority_group_description" not in groups[0]
    assert "swd_priority_group_description" not in groups[0]


def test_priority_group_with_only_empty_fields_is_dropped():
    raw = _raw_with_priority_groups(
        [
            {
                "id": 1,
                "order": 1,
                "name": "New York City residents",
                "ge_priority_group_description": "some real description",
            },
            {
                "ge_priority_group_description": "",
                "swd_priority_group_description": "  ",
            },
        ]
    )
    programs = parse_programs(raw, FAKE_URL, FAKE_FETCHED_AT)
    serialized = programs[0].to_dict()

    groups = serialized["eligibility"]["priority_groups"]
    assert len(groups) == 1
    assert groups[0]["name"] == "New York City residents"


def test_priority_groups_omitted_entirely_when_every_group_is_empty():
    raw = _raw_with_priority_groups(
        [
            {"ge_priority_group_description": "", "swd_priority_group_description": "  "},
        ]
    )
    programs = parse_programs(raw, FAKE_URL, FAKE_FETCHED_AT)
    serialized = programs[0].to_dict()

    eligibility = serialized.get("eligibility", {})
    assert "priority_groups" not in eligibility


# ── seats_filled_last_year (issue #304) ──────────────────────────────────────


def test_seats_filled_last_year_captures_ge_and_swd_booleans():
    raw = load_fixture("single_program_02M047.json")
    programs = parse_programs(raw, FAKE_URL, FAKE_FETCHED_AT)
    serialized = programs[0].to_dict()

    # Fixture: general_education.all_seats_filled is false, students_with_disabilities
    # is true.
    assert serialized["seats_filled_last_year"] == {
        "general_education": False,
        "students_with_disabilities": True,
    }


def test_seats_filled_last_year_false_is_kept_not_dropped_as_falsy():
    raw = load_fixture("laguardia_03M485.json")
    programs = parse_programs(raw, FAKE_URL, FAKE_FETCHED_AT)
    dance = next(p for p in programs if p.program_name == "Dance")
    serialized = dance.to_dict()

    # false is a real, meaningful value here (seats were left open) -- the
    # general _drop_absent/_is_absent convention must not treat it as absent.
    assert serialized["seats_filled_last_year"] == {
        "general_education": False,
        "students_with_disabilities": False,
    }


def test_seats_filled_last_year_absent_when_no_demand_data():
    raw = _raw_with_priority_groups([])
    programs = parse_programs(raw, FAKE_URL, FAKE_FETCHED_AT)
    serialized = programs[0].to_dict()

    assert "seats_filled_last_year" not in serialized


# ── parse_school_meta: open house / hours / website (issue #346) ────────────


def test_all_four_fixtures_have_no_open_house_text_today():
    # Confirms the "most schools are empty today" premise against real
    # fixtures pulled from MySchools -- an empty open_house key here is
    # expected, not a sign parse_school_meta is broken.
    for name in (
        "laguardia_03M485.json",
        "malformed_missing_programs.json",
        "mixed_methods_gramercy_02M374.json",
        "single_program_02M047.json",
    ):
        raw = load_fixture(name)
        meta = parse_school_meta(raw, FAKE_FETCHED_AT)
        assert "open_house" not in meta


def test_hours_and_website_map_through_from_a_real_fixture():
    raw = load_fixture("laguardia_03M485.json")
    meta = parse_school_meta(raw, FAKE_FETCHED_AT)

    assert meta["hours"] == {"start": "08:00am", "end": "03:35pm"}
    assert meta["school_website"] == "https://www.laguardiahs.org/"
    assert "open_house" not in meta


def test_open_house_text_maps_through_verbatim_with_fetched_at():
    raw = load_fixture("laguardia_03M485.json")
    raw = {**raw, "open_house_information": "Wed Oct 15, 6:00pm - 8:00pm"}
    meta = parse_school_meta(raw, FAKE_FETCHED_AT)

    assert meta["open_house"] == {
        "text": "Wed Oct 15, 6:00pm - 8:00pm",
        "fetched_at": FAKE_FETCHED_AT,
    }


def test_whitespace_only_open_house_text_is_absent_not_kept():
    raw = load_fixture("laguardia_03M485.json")
    raw = {**raw, "open_house_information": "   "}
    meta = parse_school_meta(raw, FAKE_FETCHED_AT)

    assert "open_house" not in meta


def test_empty_hours_and_missing_website_produce_no_keys():
    raw = load_fixture("laguardia_03M485.json")
    raw = {**raw, "start_time": "", "end_time": "   ", "independent_website": None}
    meta = parse_school_meta(raw, FAKE_FETCHED_AT)

    assert "hours" not in meta
    assert "school_website" not in meta


def test_hours_keeps_whichever_side_is_present():
    raw = load_fixture("laguardia_03M485.json")
    raw = {**raw, "start_time": "08:00am", "end_time": ""}
    meta = parse_school_meta(raw, FAKE_FETCHED_AT)

    assert meta["hours"] == {"start": "08:00am"}


def test_parse_school_meta_returns_empty_dict_for_non_dict_input():
    assert parse_school_meta(["not", "a", "dict"], FAKE_FETCHED_AT) == {}
