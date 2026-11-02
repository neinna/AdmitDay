"""Tests for the MySchools on-disk cache expiry in scripts/scrape_myschools.py."""

import json
from datetime import datetime, timedelta, timezone

from scripts import scrape_myschools
from scripts.scrape_myschools import fetch_school

DBN = "01M450"
URL = scrape_myschools.build_school_url(DBN, scrape_myschools.PROCESS_ID_HIGH_SCHOOL)


class _NoNetworkSession:
    def get(self, *args, **kwargs):
        raise AssertionError("network call made")


class _Response:
    status_code = 200

    def raise_for_status(self):
        pass

    def json(self):
        return {"fresh": True}


class _FakeSession:
    def __init__(self):
        self.calls = 0

    def get(self, *args, **kwargs):
        self.calls += 1
        return _Response()


def _write_cache(tmp_path, entry):
    cache_file = scrape_myschools._cache_path(tmp_path, URL)
    cache_file.write_text(json.dumps(entry))
    return cache_file


def _ago(**delta):
    return (datetime.now(timezone.utc) - timedelta(**delta)).isoformat()


def test_fresh_cache_is_used_without_network(tmp_path):
    fetched_at = _ago(hours=1)
    _write_cache(tmp_path, {"raw": {"old": True}, "url": URL, "fetched_at": fetched_at})
    raw, url, got = fetch_school(DBN, cache_dir=tmp_path, session=_NoNetworkSession(), delay_seconds=0)
    assert raw == {"old": True}
    assert got == fetched_at


def test_old_cache_is_refetched_and_overwritten(tmp_path):
    old = _ago(days=2)
    cache_file = _write_cache(tmp_path, {"raw": {"old": True}, "url": URL, "fetched_at": old})
    session = _FakeSession()
    raw, url, got = fetch_school(DBN, cache_dir=tmp_path, session=session, delay_seconds=0)
    assert session.calls == 1
    assert raw == {"fresh": True}
    assert got != old
    assert json.loads(cache_file.read_text())["fetched_at"] == got


def test_cache_without_fetched_at_is_refetched(tmp_path):
    _write_cache(tmp_path, {"raw": {"old": True}, "url": URL})
    session = _FakeSession()
    raw, _url, _got = fetch_school(DBN, cache_dir=tmp_path, session=session, delay_seconds=0)
    assert session.calls == 1
    assert raw == {"fresh": True}
