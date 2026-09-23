"""
Tests for scripts/enrich_doe_directory.py (issue #289).

Replaces the 2019 DOE High School Directory (NYC Open Data `uq7m-95z8`) with
the Fall 2025 InfoHub HS directory, filling in attendance_rate (blank in the
directory) and a handful of missing graduation_rate values from School
Quality Reports 2024-25 (NYC Open Data `dnpx-dfnc`).
"""

import json

import pytest

import scripts.enrich_doe_directory as enrich


def _directory_row(**overrides):
    row = {
        "dbn": "13K430",
        "overview_paragraph": "A great school.",
        "language_classes": "Spanish",
        "extracurricular_activities": "Robotics Club",
        "website": "www.example.org",
        "phone_number": "718-555-0100",
        "primary_address_line_1": "123 Main St",
        "zip": "11201",
        "subway": "A to Jay St",
        "bus": "B38",
        "psal_sports_boys": "Basketball",
        "psal_sports_girls": "Basketball",
        "psal_sports_coed": "",
        "advancedplacement_courses": "AP Biology",
        "diplomaendorsements": "STEM",
        "neighborhood": "Fort Greene",
        "addtl_info1": "Extended Day Program",
        "academicopportunities1": "Robust arts program",
        "academicopportunities2": ".",
        "prgdesc1": "Program one description.",
        "prgdesc2": "",
        "auditioninformation1": "",
        "interest1": "STEM",
        "interest2": "STEM",
        "requirement_1_1": "Course Grades: A",
        "requirement_2_1": "Attendance",
        "graduation_rate": "93",
        "attendance_rate": ".",
        "college_career_rate": "71",
    }
    row.update(overrides)
    return row


# ── Mapping: '.' / blank becomes absent, never zero ─────────────────────────


def test_dot_graduation_rate_is_absent_not_zero_when_no_sqr_fallback():
    row = _directory_row(graduation_rate=".")
    doe_data = enrich.build_doe_data(row, sqr_row=None)
    assert "graduation_rate" not in doe_data


def test_dot_college_career_rate_is_absent_not_zero():
    row = _directory_row(college_career_rate=".")
    doe_data = enrich.build_doe_data(row)
    assert "college_career_rate" not in doe_data


def test_blank_text_field_is_absent_not_a_literal_dot():
    row = _directory_row(language_classes=".")
    doe_data = enrich.build_doe_data(row)
    assert doe_data["language"] == ""


def test_percent_to_fraction_never_returns_zero_for_absent_input():
    assert enrich.percent_to_fraction(".") is None
    assert enrich.percent_to_fraction("") is None
    assert enrich.percent_to_fraction(None) is None


def test_percent_to_fraction_converts_whole_percent_to_fraction():
    assert enrich.percent_to_fraction("93") == 0.93


def test_parsed_fraction_passes_through_sqr_style_values():
    assert enrich.parsed_fraction("0.879") == 0.879
    assert enrich.parsed_fraction(".") is None


# ── Rate reconciliation: SQR is the fallback, directory wins when present ──


def test_attendance_rate_falls_back_to_sqr_when_directory_is_blank():
    row = _directory_row(attendance_rate=".")
    doe_data = enrich.build_doe_data(row, sqr_row={"attendance_hs_all": "0.818"})
    assert doe_data["attendance_rate"] == 0.818


def test_attendance_rate_uses_directory_value_when_present():
    row = _directory_row(attendance_rate="77")
    doe_data = enrich.build_doe_data(row, sqr_row={"attendance_hs_all": "0.5"})
    assert doe_data["attendance_rate"] == 0.77


def test_graduation_rate_falls_back_to_sqr_when_directory_is_blank():
    row = _directory_row(graduation_rate=".")
    doe_data = enrich.build_doe_data(row, sqr_row={"grad_pct_4_all": "0.879"})
    assert doe_data["graduation_rate"] == 0.879


def test_graduation_rate_stays_absent_with_no_sqr_fallback_either():
    row = _directory_row(graduation_rate=".")
    doe_data = enrich.build_doe_data(row, sqr_row={})
    assert "graduation_rate" not in doe_data


def test_college_career_rate_has_no_sqr_fallback():
    row = _directory_row(college_career_rate=".")
    doe_data = enrich.build_doe_data(row, sqr_row={"grad_pct_4_all": "0.9", "attendance_hs_all": "0.9"})
    assert "college_career_rate" not in doe_data


# ── Field mapping ────────────────────────────────────────────────────────


def test_maps_core_text_fields():
    doe_data = enrich.build_doe_data(_directory_row())
    assert doe_data["overview"] == "A great school."
    assert doe_data["language"] == "Spanish"
    assert doe_data["extracurriculars"] == "Robotics Club"
    assert doe_data["address"] == "123 Main St"
    assert doe_data["zip"] == "11201"
    assert doe_data["subway"] == "A to Jay St"
    assert doe_data["bus"] == "B38"
    assert doe_data["psal_sports_boys"] == "Basketball"
    assert doe_data["advancedplacement_courses"] == "AP Biology"
    assert doe_data["neighborhood"] == "Fort Greene"
    assert doe_data["addtl_info"] == "Extended Day Program"


def test_joins_academic_opportunities_skipping_absent_entries():
    doe_data = enrich.build_doe_data(_directory_row())
    assert doe_data["academic_opportunities"] == "Robust arts program"


def test_requirements_translates_new_column_shape_and_drops_empty():
    doe_data = enrich.build_doe_data(_directory_row())
    assert doe_data["requirements"] == {
        "requirement1_1": "Course Grades: A",
        "requirement1_2": "Attendance",
    }


def test_interests_deduplicated():
    doe_data = enrich.build_doe_data(_directory_row())
    assert doe_data["interests"] == ["STEM"]


def test_rates_stored_as_0_to_1_fractions_matching_existing_schema():
    doe_data = enrich.build_doe_data(_directory_row(attendance_rate="82"))
    assert doe_data["graduation_rate"] == 0.93
    assert doe_data["college_career_rate"] == 0.71
    assert doe_data["attendance_rate"] == 0.82


# ── enrich_schools_json: every school must be found in the directory ───────


def test_enrich_schools_json_rewrites_doe_data_in_place(tmp_path):
    schools_path = tmp_path / "schools.json"
    schools_path.write_text(json.dumps([
        {"dbn": "13K430", "name": "Brooklyn Tech", "doe_data": {"overview": "stale"}},
    ]))

    directory_by_dbn = {"13K430": _directory_row()}
    sqr_by_dbn = {"13K430": {"grad_pct_4_all": "0.9", "attendance_hs_all": "0.9"}}

    schools = enrich.enrich_schools_json(
        str(schools_path), directory_by_dbn=directory_by_dbn, sqr_by_dbn=sqr_by_dbn
    )

    assert schools[0]["doe_data"]["overview"] == "A great school."
    on_disk = json.loads(schools_path.read_text())
    assert on_disk[0]["doe_data"]["overview"] == "A great school."


def test_enrich_schools_json_touches_only_doe_data(tmp_path):
    schools_path = tmp_path / "schools.json"
    schools_path.write_text(json.dumps([
        {"dbn": "13K430", "name": "Brooklyn Tech", "borough": "Brooklyn", "doe_data": {}},
    ]))

    schools = enrich.enrich_schools_json(
        str(schools_path),
        directory_by_dbn={"13K430": _directory_row()},
        sqr_by_dbn={},
    )

    assert schools[0]["name"] == "Brooklyn Tech"
    assert schools[0]["borough"] == "Brooklyn"


def test_enrich_schools_json_raises_loudly_when_a_school_is_missing_from_the_directory(tmp_path):
    schools_path = tmp_path / "schools.json"
    schools_path.write_text(json.dumps([
        {"dbn": "13K430", "name": "Brooklyn Tech", "doe_data": {}},
        {"dbn": "99Z999", "name": "Not In Directory", "doe_data": {}},
    ]))

    with pytest.raises(SystemExit):
        enrich.enrich_schools_json(
            str(schools_path),
            directory_by_dbn={"13K430": _directory_row()},
            sqr_by_dbn={},
        )


# ── Directory parsing ────────────────────────────────────────────────────


def test_parse_directory_rows_keys_by_dbn(monkeypatch):
    import openpyxl

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Data"
    ws.append(["dbn", "school_name", "graduation_rate"])
    ws.append(["13K430", "Brooklyn Tech", "93"])
    ws.append(["02M475", "Stuyvesant", "99"])
    import io
    buf = io.BytesIO()
    wb.save(buf)

    by_dbn = enrich.parse_directory_rows(buf.getvalue())

    assert set(by_dbn.keys()) == {"13K430", "02M475"}
    assert by_dbn["13K430"]["graduation_rate"] == "93"


# ── School Quality Report 4-year history (issue #292) ───────────────────────


def _sqr_row(dbn, performance=None, impact=None):
    return {
        "DBN": dbn,
        "Performance Score": performance,
        "Impact Score": impact,
    }


def test_build_sqr_history_entries_computes_percentiles_within_one_year():
    results = {
        "13K430": _sqr_row("13K430", performance=0.9, impact=0.8),
        "02M475": _sqr_row("02M475", performance=0.5, impact=0.4),
        "20K490": _sqr_row("20K490", performance=0.1, impact=0.2),
    }

    by_dbn = enrich.build_sqr_history_entries(results)

    assert by_dbn["13K430"] == {"performance_score": 0.9, "performance_pctl": 100, "impact_score": 0.8, "impact_pctl": 100}
    assert by_dbn["20K490"]["performance_pctl"] == 33
    assert by_dbn["20K490"]["impact_pctl"] == 33


def test_build_sqr_history_entries_omits_dbn_with_no_numeric_score():
    results = {
        "13K430": _sqr_row("13K430", performance=0.9, impact=0.8),
        "99Z999": _sqr_row("99Z999", performance=".", impact=None),
    }

    by_dbn = enrich.build_sqr_history_entries(results)

    assert "99Z999" not in by_dbn
    assert "13K430" in by_dbn


def test_build_sqr_history_skips_a_year_a_school_is_missing_from():
    results_by_year = {
        "2021-22": {"13K430": _sqr_row("13K430", performance=0.5, impact=0.5)},
        "2022-23": {"02M475": _sqr_row("02M475", performance=0.6, impact=0.6)},  # 13K430 absent this year
        "2023-24": {"13K430": _sqr_row("13K430", performance=0.7, impact=0.7)},
        "2024-25": {"13K430": _sqr_row("13K430", performance=0.8, impact=0.8)},
    }

    history = enrich.build_sqr_history(
        results_by_year,
        years=[("2021-22", ""), ("2022-23", ""), ("2023-24", ""), ("2024-25", "")],
    )

    assert [entry["year"] for entry in history["13K430"]] == ["2021-22", "2023-24", "2024-25"]


def test_build_sqr_history_orders_entries_oldest_year_first():
    results_by_year = {
        "2021-22": {"13K430": _sqr_row("13K430", performance=0.5, impact=0.5)},
        "2022-23": {"13K430": _sqr_row("13K430", performance=0.6, impact=0.6)},
        "2023-24": {"13K430": _sqr_row("13K430", performance=0.7, impact=0.7)},
        "2024-25": {"13K430": _sqr_row("13K430", performance=0.8, impact=0.8)},
    }

    history = enrich.build_sqr_history(
        results_by_year,
        years=[("2021-22", ""), ("2022-23", ""), ("2023-24", ""), ("2024-25", "")],
    )

    assert [entry["year"] for entry in history["13K430"]] == ["2021-22", "2022-23", "2023-24", "2024-25"]
    assert history["13K430"][0]["performance_score"] == 0.5
    assert history["13K430"][-1]["performance_score"] == 0.8


def test_build_sqr_history_skips_a_year_whose_workbook_never_downloaded():
    # results_by_year has no key at all for 2022-23 (e.g. that year's fetch
    # failed) -- every dbn just has no entry for it, not a zeroed one.
    results_by_year = {
        "2021-22": {"13K430": _sqr_row("13K430", performance=0.5, impact=0.5)},
        "2023-24": {"13K430": _sqr_row("13K430", performance=0.7, impact=0.7)},
        "2024-25": {"13K430": _sqr_row("13K430", performance=0.8, impact=0.8)},
    }

    history = enrich.build_sqr_history(
        results_by_year,
        years=[("2021-22", ""), ("2022-23", ""), ("2023-24", ""), ("2024-25", "")],
    )

    assert [entry["year"] for entry in history["13K430"]] == ["2021-22", "2023-24", "2024-25"]


def test_fetch_sqr_history_downloads_and_parses_each_year(monkeypatch):
    calls = []

    def fake_download(url):
        calls.append(url)
        return b"workbook-bytes-for-" + url.encode()

    def fake_parse(xlsx_bytes, sheet_name=enrich.SQR_RESULTS_SHEET_NAME):
        # Echo the fake bytes back as a single-school result so we can tell
        # which URL's "workbook" produced this year's rows.
        return {"13K430": _sqr_row("13K430", performance=0.5, impact=0.5)}

    monkeypatch.setattr(enrich, "download_sqr_results_workbook", fake_download)
    monkeypatch.setattr(enrich, "parse_sqr_results_rows", fake_parse)

    history = enrich.fetch_sqr_history()

    assert calls == [url for _year, url in enrich.SQR_HISTORY_YEARS]
    assert len(history["13K430"]) == len(enrich.SQR_HISTORY_YEARS)
