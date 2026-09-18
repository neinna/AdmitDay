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
