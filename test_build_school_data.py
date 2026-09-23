"""
Tests for build_school_data.py.

Issue #336: NYC-SIFT was dropped as a data source -- its terms of use,
updated 2026-08-28, forbid scraping the site and using its data in an AI
application. The school list now comes from the DOE Fall 2025 HS Directory
(build_school_list_from_directory) instead of a NYC-SIFT scrape, and
per-program admissions data still comes from MySchools
(fetch_myschools_program_detail).
"""

import build_school_data


# ── Issue #336: NYC-SIFT scraping removed ───────────────────────────────────


def test_nycsift_functions_removed():
    assert not hasattr(build_school_data, "fetch_nycsift_schools")
    assert not hasattr(build_school_data, "fetch_school_detail")
    assert not hasattr(build_school_data, "extract_borough")


# ── The DOE Fall 2025 HS Directory path: base school list ──────────────────


def _directory_row(dbn, school_name, boro, total_students=500):
    # dbn, school_name, boro, and total_students are real columns in the
    # Fall 2025 HS Directory's Data sheet -- confirmed 2026-09-23 against the
    # live workbook, not guessed (see build_school_list_from_directory).
    return {
        "dbn": dbn,
        "school_name": school_name,
        "boro": boro,
        "total_students": total_students,
    }


def test_build_school_list_from_directory_maps_name_borough_and_enrollment():
    doe_by_dbn = {
        "13K430": _directory_row("13K430", "Brooklyn Technical High School (13K430)", "K", 5921),
    }

    schools = build_school_data.build_school_list_from_directory(doe_by_dbn)

    assert schools == [
        {
            "dbn": "13K430",
            "name": "Brooklyn Technical High School",
            "borough": "Brooklyn",
            "total_students": 5921,
        }
    ]


def test_build_school_list_from_directory_only_strips_own_dbn_suffix():
    # A parenthetical that isn't the trailing dbn (e.g. a school's own
    # abbreviation) must survive -- only "(<this school's dbn>)" is stripped.
    doe_by_dbn = {
        "01M539": _directory_row(
            "01M539", "New Explorations into Science, Technology and Math High School (NEST+m)", "M"
        ),
    }

    schools = build_school_data.build_school_list_from_directory(doe_by_dbn)

    assert schools[0]["name"] == "New Explorations into Science, Technology and Math High School (NEST+m)"


def test_build_school_list_from_directory_unknown_boro_code_maps_to_unknown():
    doe_by_dbn = {"99Z999": _directory_row("99Z999", "Mystery School (99Z999)", "Z")}

    schools = build_school_data.build_school_list_from_directory(doe_by_dbn)

    assert schools[0]["borough"] == "Unknown"


def test_build_school_list_from_directory_missing_total_students_is_none():
    doe_by_dbn = {"13K430": _directory_row("13K430", "Brooklyn Technical High School (13K430)", "K", total_students=None)}

    schools = build_school_data.build_school_list_from_directory(doe_by_dbn)

    assert schools[0]["total_students"] is None


# ── build_school_json: MySchools + DOE directory paths ──────────────────────


def _directory_school(dbn, name, borough="Bronx", total_students=500):
    return {
        "dbn": dbn,
        "name": name,
        "borough": borough,
        "total_students": total_students,
    }


def _myschools_program():
    return {
        "program_name": "Test Program",
        "program_code": "T01",
        "admissions_method": "Screened",
        "provenance": {
            "source": "MySchools",
            "url": "https://www.myschools.nyc/fake",
            "fetched_at": "2026-09-18T00:00:00+00:00",
        },
    }


def test_build_school_json_excludes_school_with_no_myschools_programs(monkeypatch):
    def fake_fetch(dbn):
        if dbn == "08X537":
            raise build_school_data.MySchoolsNotAdmittingError(f"{dbn} returned no MySchools programs")
        return (["Screened"], [_myschools_program()], {})

    monkeypatch.setattr(build_school_data, "fetch_myschools_program_detail", fake_fetch)
    monkeypatch.setattr(build_school_data, "fetch_myschools_school_location", lambda dbn: None)
    monkeypatch.setattr(build_school_data.time, "sleep", lambda *_: None)

    school_list = [
        _directory_school("08X537", "Bronx Arena High School"),
        _directory_school("13K430", "Brooklyn Technical High School", borough="Brooklyn"),
    ]

    schools, excluded_dbns = build_school_data.build_school_json(school_list, {})

    assert excluded_dbns == ["08X537"]
    assert [s["dbn"] for s in schools] == ["13K430"]
    assert "myschools_status" not in schools[0]


def test_build_school_json_keeps_school_with_myschools_programs(monkeypatch):
    monkeypatch.setattr(
        build_school_data,
        "fetch_myschools_program_detail",
        lambda dbn: (["Screened"], [_myschools_program()], {}),
    )
    monkeypatch.setattr(build_school_data, "fetch_myschools_school_location", lambda dbn: None)
    monkeypatch.setattr(build_school_data.time, "sleep", lambda *_: None)

    school_list = [_directory_school("13K430", "Brooklyn Technical High School", borough="Brooklyn")]

    schools, excluded_dbns = build_school_data.build_school_json(school_list, {})

    assert excluded_dbns == []
    assert len(schools) == 1
    assert schools[0]["programs"] == [_myschools_program()]


def test_build_school_json_aborts_on_network_error_instead_of_excluding(monkeypatch):
    # A flaky request must never quietly drop a school: the seed cron would
    # then delete it from production. Only an empty MySchools listing excludes.
    def fake_fetch(dbn):
        if dbn == "02M475":
            raise build_school_data.MySchoolsError("Failed to fetch https://www.myschools.nyc/... after 3 attempts")
        return (["Screened"], [_myschools_program()], {})

    monkeypatch.setattr(build_school_data, "fetch_myschools_program_detail", fake_fetch)
    monkeypatch.setattr(build_school_data.time, "sleep", lambda *_: None)
    school_list = [
        _directory_school("02M475", "Stuyvesant High School"),
        _directory_school("13K430", "Brooklyn Technical High School", borough="Brooklyn"),
    ]

    import pytest
    with pytest.raises(build_school_data.MySchoolsError):
        build_school_data.build_school_json(school_list, {})


def test_build_school_json_has_no_sift_url_and_no_nycsift_provenance(monkeypatch):
    monkeypatch.setattr(
        build_school_data,
        "fetch_myschools_program_detail",
        lambda dbn: (["Screened"], [_myschools_program()], {}),
    )
    monkeypatch.setattr(build_school_data.time, "sleep", lambda *_: None)

    school_list = [_directory_school("13K430", "Brooklyn Technical High School", borough="Brooklyn")]

    schools, _ = build_school_data.build_school_json(school_list, {})

    assert "sift_url" not in schools[0]
    assert all(p["provenance"]["source"] != "NYC-SIFT" for p in schools[0]["programs"])


def test_build_school_json_has_no_applicants_per_seat_or_academic_score_source(monkeypatch):
    # NYC-SIFT was the only source of these two fields (issue #336). Neither
    # the DOE directory nor MySchools replaces them, so a school built from
    # the directory must come out with both None -- and degrade gracefully
    # (no crash, hidden-gem flag simply off) rather than a fabricated value.
    monkeypatch.setattr(
        build_school_data,
        "fetch_myschools_program_detail",
        lambda dbn: (["Screened"], [_myschools_program()], {}),
    )
    monkeypatch.setattr(build_school_data.time, "sleep", lambda *_: None)

    school_list = [_directory_school("13K430", "Brooklyn Technical High School", borough="Brooklyn")]

    schools, _ = build_school_data.build_school_json(school_list, {})

    assert schools[0]["applicants_per_seat"] is None
    assert schools[0]["academic_score_pct"] is None
    assert schools[0]["flags"]["is_hidden_gem"] is False


def test_validate_reports_missing_applicants_per_seat_and_academic_score(capsys):
    school = {
        "admissions_types": ["Screened"],
        "flags": {
            "has_shsat": False,
            "has_audition": False,
            "has_screened": True,
            "has_open": False,
            "is_hidden_gem": False,
            "has_consortium": False,
            "has_ib": False,
        },
        "borough": "Brooklyn",
        "applicants_per_seat": None,
        "academic_score_pct": None,
    }

    build_school_data.validate([school], excluded_dbns=[])

    out = capsys.readouterr().out
    assert "Missing applicants/seat data:   1" in out
    assert "Missing academic score data:    1" in out


def test_build_school_json_merges_doe_directory_data(monkeypatch):
    monkeypatch.setattr(
        build_school_data,
        "fetch_myschools_program_detail",
        lambda dbn: (["Screened"], [_myschools_program()], {}),
    )
    monkeypatch.setattr(build_school_data.time, "sleep", lambda *_: None)

    school_list = [_directory_school("13K430", "Brooklyn Technical High School", borough="Brooklyn")]
    doe_by_dbn = {
        "13K430": {
            "overview_paragraph": "A great school.",
            "website": "www.bths.edu",
            "graduation_rate": "0.97",
        }
    }

    schools, _ = build_school_data.build_school_json(school_list, doe_by_dbn)

    assert schools[0]["doe_data"]["overview"] == "A great school."
    assert schools[0]["doe_data"]["website"] == "www.bths.edu"


def test_empty_myschools_record_is_not_admitting():
    from scripts.scrape_myschools import parse_programs, MySchoolsNotAdmittingError, MySchoolsParseError
    import pytest
    empty = {"school": {"dbn": "", "name": ""}, "programs": []}
    with pytest.raises(MySchoolsNotAdmittingError):
        parse_programs(empty, "https://example/08X537", "2026-09-18T00:00:00+00:00")
    # A real shape change is still a plain parse error, not an exclusion.
    with pytest.raises(MySchoolsParseError) as e:
        parse_programs({"school": "not-an-object"}, "https://example/x", "2026-09-18T00:00:00+00:00")
    assert not isinstance(e.value, MySchoolsNotAdmittingError)


# ── Issue #271: recognize D75/ASD-ACES/Language Criteria MySchools methods,
# and drop Transfer programs entirely. ──────────────────────────────────────

def test_classify_admissions_recognizes_new_myschools_methods():
    assert build_school_data.classify_admissions("D75 Special Education Inclusive Services") == "District 75"
    assert build_school_data.classify_admissions("District 75 Program") == "District 75"
    assert build_school_data.classify_admissions("ASD/ACES Program") == "ASD / ACES"
    assert build_school_data.classify_admissions("Language Criteria") == "Language Program"


def test_classify_admissions_keeps_existing_mappings():
    assert build_school_data.classify_admissions("Zoned Guarantee") == "Zoned"
    assert build_school_data.classify_admissions("Zoned Priority") == "Zoned"
    assert build_school_data.classify_admissions("Test") == "SHSAT"
    assert build_school_data.classify_admissions("Screened: Language & Academics") == "Screened"


def test_normalize_myschools_admissions_method_maps_new_methods_and_drops_transfer():
    assert build_school_data.normalize_myschools_admissions_method(
        "D75 Special Education Inclusive Services"
    ) == "District 75"
    assert build_school_data.normalize_myschools_admissions_method("ASD/ACES Program") == "ASD / ACES"
    assert build_school_data.normalize_myschools_admissions_method("Language Criteria") == "Language Program"
    assert build_school_data.normalize_myschools_admissions_method("Transfer") is None


def _fake_program(dbn, program_name, admissions_method):
    from scripts.scrape_myschools import Program, Provenance

    return Program(
        dbn=dbn,
        school_name="Test School",
        program_name=program_name,
        provenance=Provenance(url="https://www.myschools.nyc/fake", fetched_at="2026-09-18T00:00:00+00:00"),
        admissions_method=admissions_method,
    )


def test_fetch_myschools_program_detail_drops_transfer_but_keeps_others(monkeypatch):
    programs = [
        _fake_program("13K430", "Transfer Program", "Transfer"),
        _fake_program("13K430", "Screened Program", "Screened"),
    ]
    monkeypatch.setattr(build_school_data, "scrape_school_programs", lambda dbn, cache_dir=None: programs)

    admissions_types, enriched, _meta = build_school_data.fetch_myschools_program_detail("13K430")

    assert admissions_types == ["Screened"]
    assert [p["program_name"] for p in enriched] == ["Screened Program"]


def test_fetch_myschools_program_detail_raises_when_only_transfer(monkeypatch):
    programs = [_fake_program("13K430", "Transfer Program", "Transfer")]
    monkeypatch.setattr(build_school_data, "scrape_school_programs", lambda dbn, cache_dir=None: programs)

    import pytest
    with pytest.raises(build_school_data.MySchoolsNotAdmittingError):
        build_school_data.fetch_myschools_program_detail("13K430")


# ── Issue #342: each school's coordinates from MySchools ────────────────────


def _raw_with_address(latitude, longitude):
    return {
        "school": {"dbn": "02M475", "address": {"latitude": latitude, "longitude": longitude}},
        "programs": [],
    }


def test_fetch_myschools_school_location_maps_lat_lng(monkeypatch):
    raw = _raw_with_address("40.71336", "-73.986058")
    monkeypatch.setattr(build_school_data, "fetch_school", lambda dbn, cache_dir=None: (raw, "url", "2026-09-18T00:00:00+00:00"))

    location = build_school_data.fetch_myschools_school_location("02M475")

    assert location == {"lat": 40.71336, "lng": -73.986058}


def test_fetch_myschools_school_location_absent_when_latitude_non_numeric(monkeypatch):
    raw = _raw_with_address("not-a-number", "-73.986058")
    monkeypatch.setattr(build_school_data, "fetch_school", lambda dbn, cache_dir=None: (raw, "url", "2026-09-18T00:00:00+00:00"))

    assert build_school_data.fetch_myschools_school_location("02M475") is None


def test_build_school_json_carries_location_onto_the_school_when_present(monkeypatch):
    monkeypatch.setattr(
        build_school_data,
        "fetch_myschools_program_detail",
        lambda dbn: (["Screened"], [_myschools_program()], {}),
    )
    monkeypatch.setattr(
        build_school_data, "fetch_myschools_school_location", lambda dbn: {"lat": 40.71336, "lng": -73.986058}
    )
    monkeypatch.setattr(build_school_data.time, "sleep", lambda *_: None)

    school_list = [_directory_school("13K430", "Brooklyn Technical High School", borough="Brooklyn")]
    schools, _ = build_school_data.build_school_json(school_list, {})

    assert schools[0]["location"] == {"lat": 40.71336, "lng": -73.986058}


def test_build_school_json_omits_location_key_when_absent(monkeypatch):
    monkeypatch.setattr(
        build_school_data,
        "fetch_myschools_program_detail",
        lambda dbn: (["Screened"], [_myschools_program()], {}),
    )
    monkeypatch.setattr(build_school_data, "fetch_myschools_school_location", lambda dbn: None)
    monkeypatch.setattr(build_school_data.time, "sleep", lambda *_: None)

    school_list = [_directory_school("13K430", "Brooklyn Technical High School", borough="Brooklyn")]
    schools, _ = build_school_data.build_school_json(school_list, {})

    assert "location" not in schools[0]
