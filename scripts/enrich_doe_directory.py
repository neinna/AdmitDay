#!/usr/bin/env python3
"""
AdmitDay - DOE directory enrichment (issue #289)

Replaces the 2019 DOE High School Directory (NYC Open Data `uq7m-95z8`, whose
own metadata says it was last updated 2018-08-16) with two current sources:

  - Fall 2025 HS Directory: an xlsx published on InfoHub (not Open Data), one
    row per school on the `Data` sheet, keyed by `dbn`. Its `attendance_rate`
    column is blank for effectively every school.
  - School Quality Reports 2024-25 (NYC Open Data `dnpx-dfnc`): long-format
    dbn/metric/value rows. Used for `attendance_rate` (the directory has none)
    and as a fallback for `graduation_rate` where the directory has none.

Run directly to rewrite `doe_data` on every school in schools.json in place:
  python3 scripts/enrich_doe_directory.py

It touches only `doe_data` -- it does not re-scrape NYC-SIFT, MySchools, or
any other part of a school record. build_school_data.py's fetch_doe_directory()
reuses the download/parse helpers below for the full data refresh.
"""

import io
import json
import os
from pathlib import Path

import openpyxl
import requests

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; AdmitDay/1.0; research tool)"
}

DIRECTORY_XLSX_URL = (
    "https://infohub.nyced.org/docs/default-source/default-document-library/"
    "ose/fall-2025---hs-directory-datab85f64a0-05b9-439a-8e29-052ce60a5d86.xlsx"
)
DIRECTORY_SHEET_NAME = "Data"

SQR_DATASET_ID = "dnpx-dfnc"
SQR_URL = f"https://data.cityofnewyork.us/resource/{SQR_DATASET_ID}.json"
# "School Quality Reports 2024-25" reports on the 2024 school year.
SQR_SCHOOL_YEAR = "2024"
SQR_METRIC_GRADUATION = "grad_pct_4_all"
SQR_METRIC_ATTENDANCE = "attendance_hs_all"

# The HS School Quality Report *results* workbook (issue #290) -- a different
# publication from the long-format Open Data SQR rows above. This is the
# per-school Performance/Impact score sheet InfoHub publishes once a cycle;
# it replaces NYC-SIFT's academic score, which its 2026-08-28 terms now
# forbid scraping and using in an AI app.
SQR_RESULTS_XLSX_URL = (
    "https://infohub.nyced.org/docs/default-source/default-document-library/"
    "202425-hs-sqr-results.xlsx"
)
SQR_RESULTS_SHEET_NAME = "Summary"
SQR_RESULTS_YEAR = "2024-25"

# The directory (and, for genuinely missing text, School Quality Reports) use
# '.' or '' to mean "unknown" -- never treat either as a real value.
ABSENT_MARKERS = {"", "."}


def clean_text(value):
    if value is None:
        return ""
    text = str(value).strip()
    return "" if text in ABSENT_MARKERS else text


def percent_to_fraction(value):
    """Directory rates are whole-number percentages (e.g. '93'); schools.json
    stores rates as 0-1 fractions (e.g. 0.93) -- see graduation_rate on any
    existing school. Returns None (never 0) when the source value is absent
    or not numeric."""
    text = clean_text(value)
    if not text:
        return None
    try:
        return round(float(text) / 100.0, 4)
    except ValueError:
        return None


def parsed_fraction(value):
    """School Quality Reports rates are already 0-1 fractions (e.g. '0.879')."""
    text = clean_text(value)
    if not text:
        return None
    try:
        return round(float(text), 4)
    except ValueError:
        return None


def download_directory_workbook(url=DIRECTORY_XLSX_URL):
    r = requests.get(url, headers=HEADERS, timeout=60)
    r.raise_for_status()
    return r.content


def parse_directory_rows(xlsx_bytes, sheet_name=DIRECTORY_SHEET_NAME):
    """Returns {dbn: {column_name: raw_value}} from the Data sheet."""
    wb = openpyxl.load_workbook(io.BytesIO(xlsx_bytes), read_only=True, data_only=True)
    ws = wb[sheet_name]
    rows = ws.iter_rows(values_only=True)
    header = [str(h).strip() if h is not None else "" for h in next(rows)]
    by_dbn = {}
    for values in rows:
        record = dict(zip(header, values))
        dbn = clean_text(record.get("dbn"))
        if dbn:
            by_dbn[dbn] = record
    return by_dbn


def fetch_sqr_rows(school_year=SQR_SCHOOL_YEAR, dataset_url=SQR_URL):
    """Returns {dbn: {metric_variable_name: metric_value}} for the graduation
    and attendance metrics, for one school year, restricted to HS reports."""
    metrics = f"'{SQR_METRIC_GRADUATION}','{SQR_METRIC_ATTENDANCE}'"
    where = (
        f"school_year='{school_year}' AND report_type='HS' "
        f"AND metric_variable_name in ({metrics})"
    )
    params = {
        "$where": where,
        "$select": "dbn,metric_variable_name,metric_value",
        "$limit": 50000,
    }
    r = requests.get(dataset_url, params=params, headers=HEADERS, timeout=30)
    r.raise_for_status()
    by_dbn = {}
    for record in r.json():
        dbn = clean_text(record.get("dbn"))
        metric = record.get("metric_variable_name")
        if not dbn or not metric:
            continue
        by_dbn.setdefault(dbn, {})[metric] = record.get("metric_value")
    return by_dbn


def build_doe_data(directory_row, sqr_row=None):
    """Maps one Fall 2025 HS Directory row (+ optional School Quality Reports
    2024-25 fallback row) onto the doe_data shape schools.json already uses.
    A '.' or blank source value means the fact is unknown: the key is left
    out entirely, never written as 0 (issue #289)."""
    row = directory_row or {}
    sqr_row = sqr_row or {}

    def col(name):
        return clean_text(row.get(name))

    academic_opportunities = " ".join(
        v for v in (col(f"academicopportunities{i}") for i in range(1, 6)) if v
    )
    prgdesc = " ".join(v for v in (col(f"prgdesc{i}") for i in range(1, 4)) if v)
    requirements = {
        f"requirement{prog}_{req}": col(f"requirement_{req}_{prog}")
        for prog in range(1, 5)
        for req in range(1, 4)
        if col(f"requirement_{req}_{prog}")
    }
    audition_information = [
        v for v in (col(f"auditioninformation{i}") for i in range(1, 4)) if v
    ]
    interests = list(dict.fromkeys(
        v for v in (col(f"interest{i}") for i in range(1, 4)) if v
    ))

    graduation_rate = percent_to_fraction(row.get("graduation_rate"))
    if graduation_rate is None:
        graduation_rate = parsed_fraction(sqr_row.get(SQR_METRIC_GRADUATION))

    attendance_rate = percent_to_fraction(row.get("attendance_rate"))
    if attendance_rate is None:
        attendance_rate = parsed_fraction(sqr_row.get(SQR_METRIC_ATTENDANCE))

    college_career_rate = percent_to_fraction(row.get("college_career_rate"))

    doe_data = {
        "overview": col("overview_paragraph"),
        "language": col("language_classes"),
        "extracurriculars": col("extracurricular_activities"),
        "website": col("website"),
        "phone": col("phone_number"),
        "address": col("primary_address_line_1"),
        "zip": col("zip"),
        "academic_opportunities": academic_opportunities,
        "prgdesc": prgdesc,
        "requirements": requirements,
        "audition_information": audition_information,
        "interests": interests,
        "subway": col("subway"),
        "bus": col("bus"),
        "psal_sports_boys": col("psal_sports_boys"),
        "psal_sports_girls": col("psal_sports_girls"),
        "psal_sports_coed": col("psal_sports_coed"),
        "advancedplacement_courses": col("advancedplacement_courses"),
        "diplomaendorsements": col("diplomaendorsements"),
        "neighborhood": col("neighborhood"),
        "addtl_info": col("addtl_info1"),
    }
    # Never write 0 for an unknown rate -- omit the key instead (issue #289).
    if graduation_rate is not None:
        doe_data["graduation_rate"] = graduation_rate
    if attendance_rate is not None:
        doe_data["attendance_rate"] = attendance_rate
    if college_career_rate is not None:
        doe_data["college_career_rate"] = college_career_rate
    return doe_data


def enrich_schools_json(schools_path="schools.json", directory_by_dbn=None, sqr_by_dbn=None):
    path = Path(schools_path)
    schools = json.loads(path.read_text())

    if directory_by_dbn is None:
        print("Downloading Fall 2025 HS Directory from InfoHub...")
        directory_by_dbn = parse_directory_rows(download_directory_workbook())
        print(f"  Found {len(directory_by_dbn)} records")
    if sqr_by_dbn is None:
        print("Fetching School Quality Reports 2024-25 from NYC Open Data...")
        sqr_by_dbn = fetch_sqr_rows()
        print(f"  Found records for {len(sqr_by_dbn)} schools")

    missing = [s["dbn"] for s in schools if s.get("dbn") not in directory_by_dbn]
    if missing:
        raise SystemExit(
            f"{len(missing)} school(s) not found in the Fall 2025 HS Directory: "
            + ", ".join(missing)
        )

    for school in schools:
        dbn = school["dbn"]
        school["doe_data"] = build_doe_data(directory_by_dbn.get(dbn), sqr_by_dbn.get(dbn))

    path.write_text(json.dumps(schools, indent=2) + "\n")
    print(f"Enriched doe_data for {len(schools)} schools in {path}")
    return schools


# ── School Quality Report Performance/Impact scores (issue #290) ───────────


def download_sqr_results_workbook(url=SQR_RESULTS_XLSX_URL):
    r = requests.get(url, headers=HEADERS, timeout=60)
    r.raise_for_status()
    return r.content


def parse_sqr_results_rows(xlsx_bytes, sheet_name=SQR_RESULTS_SHEET_NAME):
    """Returns {dbn: {column_name: raw_value}} from the Summary sheet. The
    sheet has title/blank rows before the real header, so this scans for the
    first row containing a "DBN" cell rather than assuming a fixed offset."""
    wb = openpyxl.load_workbook(io.BytesIO(xlsx_bytes), read_only=True, data_only=True)
    ws = wb[sheet_name]
    header = None
    by_dbn = {}
    for values in ws.iter_rows(values_only=True):
        cleaned = [str(v).strip() if v is not None else "" for v in values]
        if header is None:
            if "DBN" in cleaned:
                header = cleaned
            continue
        record = dict(zip(header, values))
        dbn = clean_text(record.get("DBN"))
        if dbn:
            by_dbn[dbn] = record
    return by_dbn


def sqr_number(value):
    """Numeric SQR score/percentile -- '.', blank, and non-numeric mean
    absent, never 0 (same convention as percent_to_fraction above)."""
    if value is None:
        return None
    if isinstance(value, str) and value.strip() in ABSENT_MARKERS:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def compute_percentile(value, all_values):
    """Percentile rank of `value` among every numeric value in `all_values`
    (all high schools in the SQR results file, not only ours, per issue
    #290): the percentage of schools scoring at or below it, 0-100, rounded
    to the nearest integer. None (never 0) when either input is absent."""
    if value is None:
        return None
    valid = [v for v in all_values if v is not None]
    if not valid:
        return None
    at_or_below = sum(1 for v in valid if v <= value)
    return round(100 * at_or_below / len(valid))


def build_sqr_scores(sqr_results_by_dbn, source_url=SQR_RESULTS_XLSX_URL, year=SQR_RESULTS_YEAR):
    """Maps the Summary sheet onto each school's `sqr` object: performance
    and impact scores/percentiles and the Instruction and Performance rating.
    Percentiles are computed against every high school in the file. A school
    with no numeric score and no rating gets no `sqr` key at all (issue #290:
    "missing or non-numeric means the key is absent, never 0")."""
    performance_values = [sqr_number(row.get("Performance Score")) for row in sqr_results_by_dbn.values()]
    impact_values = [sqr_number(row.get("Impact Score")) for row in sqr_results_by_dbn.values()]

    by_dbn = {}
    for dbn, row in sqr_results_by_dbn.items():
        performance = sqr_number(row.get("Performance Score"))
        impact = sqr_number(row.get("Impact Score"))
        rating = clean_text(row.get("Instruction and Performance - Rating"))

        sqr = {}
        if performance is not None:
            sqr["performance_score"] = performance
            pctl = compute_percentile(performance, performance_values)
            if pctl is not None:
                sqr["performance_pctl"] = pctl
        if impact is not None:
            sqr["impact_score"] = impact
            pctl = compute_percentile(impact, impact_values)
            if pctl is not None:
                sqr["impact_pctl"] = pctl
        if rating:
            sqr["rating"] = rating

        if sqr:
            sqr["year"] = year
            sqr["source_url"] = source_url
            by_dbn[dbn] = sqr

    return by_dbn


def fetch_sqr_scores():
    return build_sqr_scores(parse_sqr_results_rows(download_sqr_results_workbook()))


def main():
    enrich_schools_json(os.environ.get("ADMITDAY_SCHOOLS_PATH", "schools.json"))


if __name__ == "__main__":
    main()
