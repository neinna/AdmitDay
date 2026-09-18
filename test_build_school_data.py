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
    monkeypatch.setattr(build_school_data.time, "sleep", lambda *_: None)

    sift_schools = [_sift_school("13K430", "Brooklyn Technical High School", borough="Brooklyn")]

    schools, excluded_dbns = build_school_data.build_school_json(sift_schools, {})

    assert excluded_dbns == []
    assert len(schools) == 1
    assert schools[0]["programs"] == [_myschools_program()]


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
