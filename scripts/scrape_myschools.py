#!/usr/bin/env python3
"""
AdmitDay - MySchools Program Scraper (issue #135)

Fetches per-program admissions data from MySchools and returns structured
Program records with source provenance. This module is standalone: it does
not touch `data/schools.json`, does not run as part of `build_school_data.py`,
and is not wired into any pipeline. Integration is a follow-up issue.

## Why this scrapes a JSON endpoint, not HTML

The issue's starting assumption was that https://www.myschools.nyc/en/schools/
is server-rendered HTML, matching the technique `build_school_data.py` uses
against NYC-SIFT. That turned out not to hold: fetching that URL returns an
Angular single-page-app shell with an empty mount point (`<div id="app">`) --
there is no program data in the initial HTML to parse.

That shell's own bootstrap config, embedded in the page as `window.App`,
discloses `apiUrl` and `state.school.admissionInstances`. Those point at the
same JSON endpoint the page's own client-side JS calls, unauthenticated, to
render the page for a logged-out visitor browsing the public directory:

    GET https://www.myschools.nyc/en/api/v2/schools/process/{process_id}/{dbn}/

`process_id` selects which admissions process's programs to return.
`PROCESS_ID_HIGH_SCHOOL = 1` is the one AdmitDay cares about (confirmed via
`admissionInstances["high-school"]` in the page's bootstrap config; other
processes -- kindergarten, 3-K, G&T, District 75, etc. -- have their own ids
and are out of scope here). No login, application, or cookie is required.

This module fetches that endpoint directly. It is still "scraping MySchools"
in every sense the issue cares about (no official/documented API, same site,
same politeness obligations) -- it just targets the JSON the page's own code
fetches instead of re-deriving the same data from rendered markup.

`https://www.myschools.nyc/en/calendar/` (event calendar, filterable by
admission process and school) was noted per the issue but not explored
further -- out of scope here, left for a follow-up issue.

## Record shapes

`Program` (see dataclass below) is the per-program record. Fields the source
page does not publish for a given program are omitted entirely -- never an
empty string or a zero -- consistent with how the rest of the app treats
missing data. Only `dbn`, `school_name`, and `program_name` are guaranteed
present; everything else is Optional and dropped by `to_dict()` when absent.

`Provenance` (nested under `Program.provenance`) records where a record came
from and when, captured at scrape time from the response itself:
  - `source`: always "MySchools" (the site, not a per-record derived value)
  - `url`: the exact API URL fetched for this record
  - `fetched_at`: UTC ISO-8601 timestamp of the fetch
  - `admissions_cycle`: the cycle label MySchools itself publishes on the
    school record (e.g. "2025-26 School Year"), if present -- this is what
    makes the app's displayed "last verified" date correct automatically
    once this data replaces the stale 2018 DOE directory (see #138), instead
    of being a typed string nobody remembers to update.

## What's actually available vs. what the issue hoped for

Available directly on each program object: program name, program code,
admissions method (name + description), a free-text program description,
per-category demand-last-year seat/applicant counts (general education,
students with disabilities, specialized education), 10th-grade seat
availability, selection criteria, selection-criteria notes, audition
information/schedule, priority-group and diversity-in-admission notes, and
program-level grade span text (frequently blank -- see below).

Available on the *school*, not per program, and used here as a fallback:
grade span (`grades_description`, e.g. "9 to 12") and a general eligibility
list (e.g. "10th Grade Seats Available"). Every program in a school observed
so far shares the school's grade span, so `Program.grade_span` falls back to
the school-level value when the program itself doesn't specify one -- this
is a deliberate choice, not a bug, and is called out in `_program_grade_span`.

Not observed on any fixture pulled during this issue: a structured
essay/interview/portfolio-required boolean, or a single canonical deadline
date. What MySchools publishes instead is free text (`selection_criteria`,
`selection_criteria_note`, `audition_information`, `audition_schedule`) that
would need per-school-type parsing to turn into structured booleans/dates --
that's follow-up work, not something to guess at here. `Program.requirements`
carries that free text through as-is.

## Politeness

- `USER_AGENT` identifies the tool and purpose.
- `fetch_school` sleeps `DEFAULT_DELAY_SECONDS` before each network request.
- `fetch_school` retries transient failures (429/5xx/timeout) with capped
  exponential backoff.
- Responses are cached to disk (`DEFAULT_CACHE_DIR`) keyed by the exact URL,
  so re-running against the same schools does not re-hit the site.
- Nothing in this module issues concurrent requests.
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
import time
import urllib.parse
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import requests

USER_AGENT = "Mozilla/5.0 (compatible; AdmitDay/1.0; +https://github.com/admitday; research tool, per-program scraper)"
API_BASE = "https://www.myschools.nyc/en/api/v2/schools/process"
PROCESS_ID_HIGH_SCHOOL = 1

DEFAULT_DELAY_SECONDS = 1.5
DEFAULT_TIMEOUT_SECONDS = 20
DEFAULT_MAX_RETRIES = 3
DEFAULT_CACHE_DIR = Path(__file__).parent / ".myschools_cache"

DBN_RE = re.compile(r"\b(\d{2}[A-Z]\d{3})\b")


class MySchoolsError(Exception):
    """Raised when a request fails or a response cannot be resolved."""


class MySchoolsParseError(MySchoolsError):
    """Raised when a response's shape doesn't match what this module expects.

    Deliberately loud: a page-shape change upstream should surface as a
    failure here, not as a silent empty list of programs.
    """


@dataclass
class Provenance:
    url: str
    fetched_at: str
    source: str = "MySchools"
    admissions_cycle: Optional[str] = None

    def to_dict(self) -> dict:
        return _drop_absent(
            {
                "source": self.source,
                "url": self.url,
                "fetched_at": self.fetched_at,
                "admissions_cycle": self.admissions_cycle,
            }
        )


@dataclass
class Program:
    dbn: str
    school_name: str
    program_name: str
    provenance: Provenance
    program_code: Optional[str] = None
    admissions_method: Optional[str] = None
    admissions_method_description: Optional[str] = None
    grade_span: Optional[str] = None
    seats: Optional[dict] = None
    eligibility: Optional[dict] = None
    requirements: Optional[dict] = None
    description: Optional[str] = None

    def to_dict(self) -> dict:
        return _drop_absent(
            {
                "dbn": self.dbn,
                "school_name": self.school_name,
                "program_name": self.program_name,
                "program_code": self.program_code,
                "admissions_method": self.admissions_method,
                "admissions_method_description": self.admissions_method_description,
                "grade_span": self.grade_span,
                "seats": self.seats,
                "eligibility": self.eligibility,
                "requirements": self.requirements,
                "description": self.description,
                "provenance": self.provenance.to_dict(),
            }
        )


def _is_absent(value: Any) -> bool:
    """True for values that mean "the page didn't publish this" -- None,
    "", [], {} -- but NOT for a real 0, which some fields (e.g.
    applications_per_seat) publish as a meaningful value."""
    if value is None:
        return True
    if isinstance(value, (str, list, dict)) and len(value) == 0:
        return True
    return False


def _drop_absent(d: dict) -> dict:
    out = {}
    for k, v in d.items():
        if isinstance(v, dict):
            v = _drop_absent(v)
        if _is_absent(v):
            continue
        out[k] = v
    return out


def extract_dbn(dbn_or_url: str) -> str:
    """Accepts a bare DBN ("03M485") or a MySchools school URL
    (".../en/schools/03M485/") and returns the DBN."""
    match = DBN_RE.search(dbn_or_url)
    if not match:
        raise MySchoolsError(f"Could not find a DBN in {dbn_or_url!r}")
    return match.group(1)


def build_school_url(dbn: str, process_id: int = PROCESS_ID_HIGH_SCHOOL) -> str:
    return f"{API_BASE}/{process_id}/{urllib.parse.quote(dbn)}/"


def _cache_path(cache_dir: Path, url: str) -> Path:
    key = hashlib.sha256(url.encode("utf-8")).hexdigest()
    return cache_dir / f"{key}.json"


def fetch_school(
    dbn_or_url: str,
    process_id: int = PROCESS_ID_HIGH_SCHOOL,
    cache_dir: Optional[Path] = DEFAULT_CACHE_DIR,
    delay_seconds: float = DEFAULT_DELAY_SECONDS,
    timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
    max_retries: int = DEFAULT_MAX_RETRIES,
    session: Optional[requests.Session] = None,
) -> tuple[dict, str, str]:
    """Fetch a school's MySchools record. Returns (raw_json, url, fetched_at_iso).

    Politeness: checks the on-disk cache first; only hits the network on a
    cache miss, after sleeping `delay_seconds`, retrying transient failures
    with exponential backoff.
    """
    dbn = extract_dbn(dbn_or_url)
    url = build_school_url(dbn, process_id)

    if cache_dir is not None:
        cache_dir.mkdir(parents=True, exist_ok=True)
        cache_file = _cache_path(cache_dir, url)
        if cache_file.exists():
            cached = json.loads(cache_file.read_text())
            return cached["raw"], cached["url"], cached["fetched_at"]

    session = session or requests.Session()
    last_error: Optional[Exception] = None
    for attempt in range(max_retries):
        time.sleep(delay_seconds)
        try:
            response = session.get(
                url,
                headers={"User-Agent": USER_AGENT},
                timeout=timeout_seconds,
            )
            if response.status_code == 429 or response.status_code >= 500:
                last_error = MySchoolsError(
                    f"{url} -> HTTP {response.status_code}"
                )
                time.sleep(delay_seconds * (2**attempt))
                continue
            response.raise_for_status()
            raw = response.json()
            fetched_at = datetime.now(timezone.utc).isoformat()
            if cache_dir is not None:
                cache_file.write_text(
                    json.dumps({"raw": raw, "url": url, "fetched_at": fetched_at})
                )
            return raw, url, fetched_at
        except requests.RequestException as exc:
            last_error = exc
            time.sleep(delay_seconds * (2**attempt))

    raise MySchoolsError(f"Failed to fetch {url} after {max_retries} attempts") from last_error


def _program_grade_span(program: dict, response: dict) -> Optional[str]:
    """Program-level grade span if MySchools publishes one for this program,
    else the school's overall grade span (every program observed so far
    shares its school's span; there is no per-program override in the data
    seen during this issue)."""
    own = program.get("grades_description")
    if own:
        return own
    return response.get("grades_description")


def _program_seats(program: dict) -> Optional[dict]:
    demand = program.get("demand_last_year") or {}
    seats: dict = {}
    for category in ("general_education", "students_with_disabilities", "specialized_education"):
        entry = demand.get(category) or {}
        cleaned = _drop_absent(
            {
                "seats": entry.get("seats"),
                "applicants": entry.get("applicants"),
                "applications_per_seat": entry.get("applications_per_seat"),
            }
        )
        if cleaned:
            seats[category] = cleaned
    tenth_grade = _drop_absent(
        {
            "available": program.get("seats_10th_available") or None,
            "number": program.get("seats_10th_number"),
            "description": program.get("seats_description"),
        }
    )
    if tenth_grade:
        seats["tenth_grade"] = tenth_grade
    return seats or None


def _program_eligibility(program: dict, response: dict) -> Optional[dict]:
    return _drop_absent(
        {
            "description": program.get("eligibility_description"),
            "priority_groups": program.get("program_priority_groups"),
            "lowest_priority": program.get("lowest_priority"),
            "preference": program.get("preference"),
            "diversity_in_admission": [
                v
                for v in (
                    program.get("diversity_in_admission_1"),
                    program.get("diversity_in_admission_2"),
                )
                if v
            ],
            "school_eligibility": [e.get("name") for e in (response.get("eligibility") or []) if e.get("name")],
        }
    ) or None


def _program_requirements(program: dict) -> Optional[dict]:
    return _drop_absent(
        {
            "selection_criteria": program.get("selection_criteria"),
            "selection_criteria_note": program.get("selection_criteria_note"),
            "audition_information": program.get("audition_information"),
            "audition_schedule": program.get("audition_schedule"),
            "deadline_text": program.get("end_date") or program.get("start_date"),
        }
    ) or None


def parse_programs(raw: dict, url: str, fetched_at: str) -> list[Program]:
    """Parse a raw MySchools school-detail JSON response into Program records.

    Raises MySchoolsParseError -- rather than returning [] -- if the response
    doesn't have the shape this module expects, so an upstream page-shape
    change fails loudly instead of silently producing no data.
    """
    if not isinstance(raw, dict):
        raise MySchoolsParseError(f"Expected a JSON object, got {type(raw).__name__}")

    school = raw.get("school")
    if not isinstance(school, dict) or not school.get("dbn"):
        raise MySchoolsParseError("Response is missing school.dbn")

    programs_raw = raw.get("programs")
    if not isinstance(programs_raw, list):
        raise MySchoolsParseError(
            "Response is missing a 'programs' list -- MySchools page shape may have changed"
        )
    if len(programs_raw) == 0:
        raise MySchoolsParseError(f"{school.get('dbn')} has zero programs -- expected at least one")

    dbn = school["dbn"]
    school_name = raw.get("name") or school.get("name") or dbn
    admissions_cycle = school.get("school_year")
    provenance = Provenance(url=url, fetched_at=fetched_at, admissions_cycle=admissions_cycle)

    programs = []
    for entry in programs_raw:
        if not isinstance(entry, dict):
            raise MySchoolsParseError(f"Program entry is not an object: {entry!r}")
        program_info = entry.get("program")
        if not isinstance(program_info, dict) or not program_info.get("name"):
            raise MySchoolsParseError(f"Program entry is missing program.name: {entry!r}")

        method = entry.get("admissions_method") or {}

        programs.append(
            Program(
                dbn=dbn,
                school_name=school_name,
                program_name=program_info["name"],
                program_code=program_info.get("code"),
                admissions_method=method.get("name"),
                admissions_method_description=method.get("description"),
                grade_span=_program_grade_span(entry, raw),
                seats=_program_seats(entry),
                eligibility=_program_eligibility(entry, raw),
                requirements=_program_requirements(entry),
                description=entry.get("description"),
                provenance=provenance,
            )
        )
    return programs


def scrape_school_programs(
    dbn_or_url: str,
    process_id: int = PROCESS_ID_HIGH_SCHOOL,
    cache_dir: Optional[Path] = DEFAULT_CACHE_DIR,
    **fetch_kwargs,
) -> list[Program]:
    """Fetch + parse in one call: given a DBN or MySchools school URL,
    return that school's Program records."""
    raw, url, fetched_at = fetch_school(dbn_or_url, process_id=process_id, cache_dir=cache_dir, **fetch_kwargs)
    return parse_programs(raw, url, fetched_at)


def main(argv: list[str]) -> int:
    if not argv:
        print("Usage: scrape_myschools.py <DBN or MySchools school URL> [...]", file=sys.stderr)
        return 1
    all_programs = []
    for arg in argv:
        try:
            programs = scrape_school_programs(arg)
        except MySchoolsError as exc:
            print(f"error: {arg}: {exc}", file=sys.stderr)
            return 1
        all_programs.extend(p.to_dict() for p in programs)
    print(json.dumps(all_programs, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
