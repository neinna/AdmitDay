"""
Tests for the NYC-SIFT fallback de-duplication fix (issue #252).

fetch_school_detail parses NYC-SIFT's div.NYCSF_twocolumn program rows for
the handful of schools MySchools doesn't list. A school can list the same
admissions method twice with no program name attached, which used to
produce two identical, unnamed program rows and fail the data-refresh
validation gate with "duplicate program key" (lib/validate-school-data.ts).
"""

from types import SimpleNamespace

import build_school_data


def _fake_get(html):
    def fake_get(url, headers=None, timeout=None):
        return SimpleNamespace(text=html, raise_for_status=lambda: None)

    return fake_get


DUPLICATE_METHOD_HTML = """
<html><body>
  <div class="NYCSF_twocolumn">
    <div>Method:</div>
    <div>Educational Option / Ed. Opt.</div>
  </div>
  <div class="NYCSF_twocolumn">
    <div>Method:</div>
    <div>Educational Option / Ed. Opt.</div>
  </div>
</body></html>
"""


def test_fallback_deduplicates_identical_method_rows(monkeypatch):
    monkeypatch.setattr(build_school_data.requests, "get", _fake_get(DUPLICATE_METHOD_HTML))

    admissions_types, programs = build_school_data.fetch_school_detail("02M316", "https://nycsift.com/fake")

    assert admissions_types == ["Educational Option"]
    assert len(programs) == 1
    assert programs[0]["raw_method"] == "Educational Option / Ed. Opt."


DISTINCT_METHODS_HTML = """
<html><body>
  <div class="NYCSF_twocolumn">
    <div>Method:</div>
    <div>Screened</div>
  </div>
  <div class="NYCSF_twocolumn">
    <div>Method:</div>
    <div>Educational Option / Ed. Opt.</div>
  </div>
</body></html>
"""


def test_fallback_keeps_distinct_methods(monkeypatch):
    monkeypatch.setattr(build_school_data.requests, "get", _fake_get(DISTINCT_METHODS_HTML))

    admissions_types, programs = build_school_data.fetch_school_detail("03M299", "https://nycsift.com/fake")

    assert set(admissions_types) == {"Screened", "Educational Option"}
    assert len(programs) == 2
    assert {p["raw_method"] for p in programs} == {"Screened", "Educational Option / Ed. Opt."}


# ── Issue #255: schools with no programs in this cycle's MySchools
# admissions are excluded from schools.json instead of falling back to
# NYC-SIFT detail. ────────────────────────────────────────────────────────

def _sift_school(dbn, name, borough="Bronx"):
    return {
        "dbn": dbn,
        "name": name,
        "borough": borough,
        "total_students": 500,
        "applicants_per_seat": 2.0,
        "academic_score_pct": 70.0,
        "sift_url": f"https://nycsift.com/school.phtml?id={dbn}",
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
        return (["Screened"], [_myschools_program()])

    monkeypatch.setattr(build_school_data, "fetch_myschools_program_detail", fake_fetch)
    monkeypatch.setattr(build_school_data, "fetch_myschools_location", lambda dbn: None)
    monkeypatch.setattr(build_school_data.time, "sleep", lambda *_: None)

    sift_schools = [
        _sift_school("08X537", "Bronx Arena High School"),
        _sift_school("13K430", "Brooklyn Technical High School", borough="Brooklyn"),
    ]

    schools, excluded_dbns = build_school_data.build_school_json(sift_schools, {})

    assert excluded_dbns == ["08X537"]
    assert [s["dbn"] for s in schools] == ["13K430"]
    assert "myschools_status" not in schools[0]


def test_build_school_json_keeps_school_with_myschools_programs(monkeypatch):
    monkeypatch.setattr(
        build_school_data,
        "fetch_myschools_program_detail",
        lambda dbn: (["Screened"], [_myschools_program()]),
    )
    monkeypatch.setattr(
        build_school_data, "fetch_myschools_location", lambda dbn: {"lat": 40.7, "lng": -73.9}
    )
    monkeypatch.setattr(build_school_data.time, "sleep", lambda *_: None)

    sift_schools = [_sift_school("13K430", "Brooklyn Technical High School", borough="Brooklyn")]

    schools, excluded_dbns = build_school_data.build_school_json(sift_schools, {})

    assert excluded_dbns == []
    assert len(schools) == 1
    assert schools[0]["programs"] == [_myschools_program()]
    assert schools[0]["location"] == {"lat": 40.7, "lng": -73.9}


def test_build_school_json_aborts_on_network_error_instead_of_excluding(monkeypatch):
    # A flaky request must never quietly drop a school: the seed cron would
    # then delete it from production. Only an empty MySchools listing excludes.
    def fake_fetch(dbn):
        if dbn == "02M475":
            raise build_school_data.MySchoolsError("Failed to fetch https://www.myschools.nyc/... after 3 attempts")
        return (["Screened"], [_myschools_program()])

    monkeypatch.setattr(build_school_data, "fetch_myschools_program_detail", fake_fetch)
    monkeypatch.setattr(build_school_data.time, "sleep", lambda *_: None)
    sift_schools = [_sift_school("02M475", "Stuyvesant High School"), _sift_school("13K430", "Brooklyn Technical High School", borough="Brooklyn")]

    import pytest
    with pytest.raises(build_school_data.MySchoolsError):
        build_school_data.build_school_json(sift_schools, {})


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

    admissions_types, enriched = build_school_data.fetch_myschools_program_detail("13K430")

    assert admissions_types == ["Screened"]
    assert [p["program_name"] for p in enriched] == ["Screened Program"]


def test_fetch_myschools_program_detail_raises_when_only_transfer(monkeypatch):
    programs = [_fake_program("13K430", "Transfer Program", "Transfer")]
    monkeypatch.setattr(build_school_data, "scrape_school_programs", lambda dbn, cache_dir=None: programs)

    import pytest
    with pytest.raises(build_school_data.MySchoolsNotAdmittingError):
        build_school_data.fetch_myschools_program_detail("13K430")


# ── Issue #295: school.address.latitude/longitude from the MySchools record
# becomes each school's `location`. ─────────────────────────────────────────

def test_parse_school_location_reads_address_lat_lng():
    from scripts.scrape_myschools import parse_school_location

    raw = {"school": {"dbn": "13K430", "address": {"latitude": "40.694", "longitude": "-73.978"}}}
    assert parse_school_location(raw) == {"lat": 40.694, "lng": -73.978}


def test_parse_school_location_absent_when_coordinates_missing():
    from scripts.scrape_myschools import parse_school_location

    assert parse_school_location({"school": {"dbn": "13K430", "address": {}}}) is None
    assert parse_school_location({"school": {"dbn": "13K430"}}) is None
    assert parse_school_location({}) is None


def test_fetch_myschools_location_returns_none_on_myschools_error(monkeypatch):
    def raise_error(dbn, cache_dir=None):
        raise build_school_data.MySchoolsError("boom")

    monkeypatch.setattr(build_school_data, "scrape_school_location", raise_error)
    assert build_school_data.fetch_myschools_location("13K430") is None
