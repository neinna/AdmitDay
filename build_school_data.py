#!/usr/bin/env python3
"""
AdmitDay - School Data Builder
Pulls all NYC public high schools and their current per-program admissions
data from MySchools, plus the DOE HS Directory.
Run this on your VPS: python3 build_school_data.py
Outputs: schools.json (used directly by the app)

Sources:
  - DOE HS Directory: Fall 2025 InfoHub HS directory + School Quality Reports
    2024-25 (NYC Open Data `dnpx-dfnc`) -- see scripts/enrich_doe_directory.py.
    Previously NYC Open Data `uq7m-95z8`, the 2019 DOE High School Directory,
    replaced under issue #289 because it had gone six admissions cycles stale.
    Supplies the school list (name, borough, enrollment) and doe_data.
  - MySchools: https://www.myschools.nyc (current public program pages).
    Supplies per-program admissions data.

Both are public domain / open data. Safe to use with attribution.

NYC-SIFT (https://nycsift.com) was dropped as a source (issue #336): its
terms of use, updated 2026-08-28, forbid scraping the site and using its
data in an AI application. NYC-SIFT was the only source of
applicants_per_seat and academic_score_pct; neither the DOE directory nor
MySchools supplies a replacement, so both fields are now always None. A
replacement source (e.g. a MySchools-derived demand ratio or a DOE School
Quality Report score) is a separate, not-yet-scoped follow-up -- see the
"Missing applicants/seat data" line in this script's own validation report.
"""

import json
import os
import time
from pathlib import Path

from scripts.scrape_myschools import MySchoolsError, MySchoolsNotAdmittingError, scrape_school_programs

MYSCHOOLS_CACHE_DIR = Path("scripts") / ".myschools_cache"

# MySchools no longer lists every school that's still in the high-school
# admissions process (id 1) -- a handful come back "Response is missing
# school.dbn" (see issue #189), or an empty program list for a school that
# isn't admitting this cycle (transfer schools, closing/phasing-out schools --
# see issue #255). A small, bounded number of those misses must not abort the
# whole refresh: exclude that one school from schools.json and keep going.
# The overall run still fails loudly if too many schools are missing --
# that check lives in lib/validate-school-data.ts (coverage threshold and drop
# check), not here. Set ADMITDAY_ALLOW_MYSCHOOLS_FALLBACK=0 to force strict
# mode (abort on the first MySchools miss) for local debugging.
ALLOW_MYSCHOOLS_FALLBACK = os.environ.get("ADMITDAY_ALLOW_MYSCHOOLS_FALLBACK", "1") != "0"

# Minimum SHSAT score that received a specialized high school offer, by DBN
# and admissions-offer year. Source: NYC DOE "Specialized High School Offers"
# press releases. Cross-checked 2026-09-16 against kennytan.nyc, SHSATlab,
# and SHS Prep cutoff tables -- confirm a given year's number against the
# matching DOE press release before treating it as final.
# Mirrors lib/shsat-cutoffs.ts -- update both together each year after the
# DOE publishes new offer data (typically March).
SHSAT_CUTOFFS: dict[str, dict[str, int]] = {
    "02M475": {"2024": 561, "2025": 556, "2026": 561},  # Stuyvesant High School
    "05M692": {"2024": 542, "2025": 526, "2026": 539},  # HS for Math, Science and Engineering at City College
    "10X445": {"2024": 526, "2025": 518, "2026": 525},  # Bronx High School of Science
    "10X696": {"2024": 514, "2025": 504, "2026": 507},  # High School of American Studies at Lehman College
    "13K430": {"2024": 507, "2025": 505, "2026": 506},  # Brooklyn Technical High School
    "14K449": {"2024": 492, "2025": 496, "2026": 495},  # Brooklyn Latin School
    "28Q687": {"2024": 524, "2025": 518, "2026": 531},  # Queens High School for the Sciences at York College
    "31R605": {"2024": 519, "2025": 527, "2026": 517},  # Staten Island Technical High School
}
# Latest offer year with published cutoff data across all specialized schools.
SHSAT_CUTOFFS_YEAR = "2026"

BORO_CODE_TO_NAME = {
    "M": "Manhattan",
    "K": "Brooklyn",
    "Q": "Queens",
    "X": "Bronx",
    "R": "Staten Island",
}


def _clean_directory_school_name(name, dbn):
    """The Fall 2025 HS Directory's school_name column carries the dbn as a
    trailing parenthetical, e.g. "Brooklyn Technical High School (13K430)" --
    strip it so the app displays the plain school name."""
    name = (name or "").strip()
    suffix = f"({dbn})"
    if name.endswith(suffix):
        name = name[: -len(suffix)].strip()
    return name


def build_school_list_from_directory(doe_by_dbn):
    """The base school list -- dbn, name, borough, enrollment -- now comes
    from the DOE Fall 2025 HS Directory instead of NYC-SIFT (issue #336).

    `school_name`, `boro`, and `total_students` are real columns in that
    directory's `Data` sheet (confirmed 2026-09-23 by downloading the live
    workbook from DIRECTORY_XLSX_URL in scripts/enrich_doe_directory.py and
    inspecting its header row directly -- not guessed). `boro` is always
    present and always one of BORO_CODE_TO_NAME's five single-letter codes;
    `total_students` is blank ('.') for a small minority of rows, handled
    below the same way the rest of this file treats a blank directory cell."""
    schools = []
    for dbn, row in doe_by_dbn.items():
        total_students = row.get("total_students")
        try:
            total_students = int(total_students) if total_students not in (None, "") else None
        except (TypeError, ValueError):
            total_students = None

        schools.append({
            "dbn": dbn,
            "name": _clean_directory_school_name(row.get("school_name"), dbn),
            "borough": BORO_CODE_TO_NAME.get(row.get("boro"), "Unknown"),
            "total_students": total_students,
        })
    return schools


def fetch_doe_directory():
    print("Fetching the Fall 2025 HS Directory (InfoHub) and School Quality Reports 2024-25...")
    from scripts.enrich_doe_directory import (
        download_directory_workbook,
        parse_directory_rows,
        fetch_sqr_rows,
        percent_to_fraction,
        parsed_fraction,
        SQR_METRIC_GRADUATION,
        SQR_METRIC_ATTENDANCE,
    )

    directory_by_dbn = parse_directory_rows(download_directory_workbook())
    sqr_by_dbn = fetch_sqr_rows()
    print(f"  Found {len(directory_by_dbn)} records from the Fall 2025 HS Directory")

    def reconciled_rate(directory_value, sqr_value):
        fraction = percent_to_fraction(directory_value)
        if fraction is None:
            fraction = parsed_fraction(sqr_value)
        return "" if fraction is None else str(fraction)

    by_dbn = {}
    for dbn, row in directory_by_dbn.items():
        sqr_row = sqr_by_dbn.get(dbn, {})
        merged = dict(row)
        merged["graduation_rate"] = reconciled_rate(
            row.get("graduation_rate"), sqr_row.get(SQR_METRIC_GRADUATION)
        )
        merged["attendance_rate"] = reconciled_rate(
            row.get("attendance_rate"), sqr_row.get(SQR_METRIC_ATTENDANCE)
        )
        merged["college_career_rate"] = reconciled_rate(row.get("college_career_rate"), None)
        # The Fall 2025 directory numbers requirement columns
        # requirement_{req}_{program}; the merge below still reads the old
        # Open Data dataset's requirement{program}_{req} shape (issue #289).
        for prog in range(1, 5):
            for req in range(1, 4):
                merged[f"requirement{prog}_{req}"] = row.get(f"requirement_{req}_{prog}", "")
        by_dbn[dbn] = merged
    return by_dbn


def classify_admissions(text):
    text = text.lower().strip()
    if "shsat" in text or "specialized" in text or text == "test":
        return "SHSAT"
    if "d75" in text or "district 75" in text:
        return "District 75"
    if "asd" in text or "aces" in text:
        return "ASD / ACES"
    if "language criteria" in text:
        return "Language Program"
    if "audition" in text:
        return "Audition"
    if "screened" in text and "assess" in text:
        return "Screened with Assessment"
    if "screened" in text:
        return "Screened"
    if "ed. opt" in text or "educational option" in text or "ed opt" in text:
        return "Educational Option"
    if "zoned" in text:
        return "Zoned"
    if "open" in text or "unscreened" in text or "lottery" in text:
        return "Open"
    return None


def normalize_myschools_admissions_method(text):
    if not text:
        return None

    lower = text.lower().strip()
    if "transfer" in lower:
        return None

    normalized = classify_admissions(text)
    if normalized:
        return normalized

    if "screened with assessment" in lower or "screened with assessments" in lower:
        return "Screened with Assessment"
    if "screened" in lower:
        return "Screened"
    if "audition" in lower:
        return "Audition"
    if "open" in lower or "unscreened" in lower:
        return "Open"
    return text.strip()


def fetch_myschools_program_detail(dbn):
    programs = [p.to_dict() for p in scrape_school_programs(dbn, cache_dir=MYSCHOOLS_CACHE_DIR)]
    enriched = []
    admissions_types = []

    for program in programs:
        raw_method = program.get("admissions_method")
        if raw_method and "transfer" in raw_method.lower():
            continue

        method = normalize_myschools_admissions_method(raw_method)
        if method and method not in admissions_types:
            admissions_types.append(method)

        # Compatibility fields for UI/utilities that still read the old
        # NYC-SIFT-shaped rows while carrying the richer MySchools payload.
        if "program" not in program:
            program["program"] = program.get("program_name")
        if method:
            program["admissions_type"] = method
        if raw_method and "raw_method" not in program:
            program["raw_method"] = raw_method

        enriched.append(program)

    if len(enriched) == 0:
        raise MySchoolsNotAdmittingError(f"{dbn} returned no MySchools programs")

    return admissions_types, enriched


def build_school_json(school_list, doe_by_dbn):
    print("Merging data sources and fetching school details...")
    final = []
    excluded_dbns = []

    for i, school in enumerate(school_list):
        dbn = school["dbn"]
        doe = doe_by_dbn.get(dbn, {})

        students = school.get("total_students")
        if students:
            if students < 400: size = "small"
            elif students < 1200: size = "medium"
            else: size = "large"
        else:
            size = "medium"

        print(f"  [{i+1}/{len(school_list)}] {school['name'][:50]}")
        try:
            admissions_types, programs = fetch_myschools_program_detail(dbn)
        except MySchoolsNotAdmittingError as e:
            # Only an empty MySchools listing excludes a school. A network
            # failure or shape change (any other MySchoolsError) propagates and
            # aborts the refresh, so a flaky night can never quietly drop
            # schools that the seed cron would then delete from production.
            if not ALLOW_MYSCHOOLS_FALLBACK:
                raise
            print(f"    {dbn} has no programs in this cycle's MySchools admissions -- excluding: {e}")
            excluded_dbns.append(dbn)
            continue
        time.sleep(0.3)

        has_shsat = "SHSAT" in admissions_types
        has_audition = "Audition" in admissions_types
        has_screened = any(t in admissions_types for t in ["Screened", "Screened with Assessment"])
        has_open = any(t in admissions_types for t in ["Open", "Educational Option", "Zoned"])

        borough = school.get("borough", "Unknown")
        has_borough_priority = borough != "Manhattan"

        aps = school.get("applicants_per_seat")
        acad = school.get("academic_score_pct")
        is_hidden_gem = (
            aps is not None and aps < 5.0 and
            acad is not None and acad > 60.0
        )

        CONSORTIUM_DBNS = {
            "01M696", "02M520", "02M542", "03M505", "04M610", "06M348",
            "07X268", "09X327", "10X325", "13K430", "14K454", "15K448",
            "17K572", "19K583", "21K540", "22K462", "24Q460", "25Q525",
            "27Q309", "28Q680", "31R080", "75K571", "79M655", "79X655",
            "84M725", "84X695",
        }
        has_consortium = dbn in CONSORTIUM_DBNS

        overview_text = doe.get("overview_paragraph", "")
        name_text = school["name"]
        has_ib = (
            "International Baccalaureate" in name_text or
            "International Baccalaureate" in overview_text or
            " IB " in name_text or
            " IB " in overview_text
        )

        academic_opps = " ".join(filter(None, [
            doe.get("academicopportunities1", ""),
            doe.get("academicopportunities2", ""),
            doe.get("academicopportunities3", ""),
            doe.get("academicopportunities4", ""),
            doe.get("academicopportunities5", ""),
        ]))

        prgdesc = " ".join(filter(None, [
            doe.get("prgdesc1", ""),
            doe.get("prgdesc2", ""),
            doe.get("prgdesc3", ""),
        ]))

        requirements = {
            f"requirement{i}_{j}": doe.get(f"requirement{i}_{j}", "")
            for i in range(1, 5)
            for j in range(1, 4)
            if doe.get(f"requirement{i}_{j}", "")
        }

        audition_information = [v for v in [
            doe.get("auditioninformation1", ""),
            doe.get("auditioninformation2", ""),
            doe.get("auditioninformation3", ""),
        ] if v]

        interests = list(dict.fromkeys(v for v in [
            doe.get("interest1", ""),
            doe.get("interest2", ""),
            doe.get("interest3", ""),
        ] if v))

        def safe_float(val):
            try:
                return float(val) if val else None
            except (ValueError, TypeError):
                return None

        merged = {
            "dbn": dbn,
            "name": school["name"],
            "borough": borough,
            "size": size,
            "total_students": school.get("total_students"),
            "applicants_per_seat": aps,
            "academic_score_pct": acad,
            "survey_score_pct": None,
            "admissions_types": admissions_types,
            "programs": programs,
            "flags": {
                "has_shsat": has_shsat,
                "has_audition": has_audition,
                "has_screened": has_screened,
                "has_open": has_open,
                "has_borough_priority": has_borough_priority,
                "is_hidden_gem": is_hidden_gem,
                "has_consortium": has_consortium,
                "has_ib": has_ib,
            },
            "doe_data": {
                "overview": doe.get("overview_paragraph", ""),
                "language": doe.get("language_classes", ""),
                "extracurriculars": doe.get("extracurricular_activities", ""),
                "website": doe.get("website", ""),
                "phone": doe.get("phone_number", ""),
                "address": doe.get("primary_address_line_1", ""),
                "zip": doe.get("zip", ""),
                "academic_opportunities": academic_opps,
                "prgdesc": prgdesc,
                "requirements": requirements,
                "audition_information": audition_information,
                "interests": interests,
                "graduation_rate": safe_float(doe.get("graduation_rate")),
                "attendance_rate": safe_float(doe.get("attendance_rate")),
                "college_career_rate": safe_float(doe.get("college_career_rate")),
                "subway": doe.get("subway", ""),
                "bus": doe.get("bus", ""),
                "psal_sports_boys": doe.get("psal_sports_boys", ""),
                "psal_sports_girls": doe.get("psal_sports_girls", ""),
                "psal_sports_coed": doe.get("psal_sports_coed", ""),
                "advancedplacement_courses": doe.get("advancedplacement_courses", ""),
                "diplomaendorsements": doe.get("diplomaendorsements", ""),
                "neighborhood": doe.get("neighborhood", ""),
                "addtl_info": doe.get("addtl_info1", ""),
            },
            "last_verified": "2025-2026",
            "shsat_cutoff_score": SHSAT_CUTOFFS.get(dbn, {}).get(SHSAT_CUTOFFS_YEAR) if has_shsat else None,
            "shsat_cutoff_year": SHSAT_CUTOFFS_YEAR if has_shsat and SHSAT_CUTOFFS.get(dbn, {}).get(SHSAT_CUTOFFS_YEAR) else None,
        }
        final.append(merged)

    return final, excluded_dbns


def validate(schools, excluded_dbns=None):
    excluded_dbns = excluded_dbns or []
    print("\n── Validation Report ─────────────────────────────")
    print(f"Total schools:          {len(schools)}")
    print(f"With admissions types:  {sum(1 for s in schools if s['admissions_types'])}")
    print(f"SHSAT schools:          {sum(1 for s in schools if s['flags']['has_shsat'])}")
    print(f"Audition schools:       {sum(1 for s in schools if s['flags']['has_audition'])}")
    print(f"Screened schools:       {sum(1 for s in schools if s['flags']['has_screened'])}")
    print(f"Open/EdOpt/Zoned:       {sum(1 for s in schools if s['flags']['has_open'])}")
    print(f"Hidden gems:            {sum(1 for s in schools if s['flags']['is_hidden_gem'])}")
    print(f"Consortium schools:     {sum(1 for s in schools if s['flags']['has_consortium'])}")
    print(f"IB schools:             {sum(1 for s in schools if s['flags']['has_ib'])}")
    print(f"Missing admissions:     {sum(1 for s in schools if not s['admissions_types'])}")
    # Neither field has a source since NYC-SIFT was dropped (issue #336) --
    # surfaced here so a refresh never silently ships data with a field that
    # quietly went from populated to always-empty.
    print(f"Missing applicants/seat data:   {sum(1 for s in schools if s['applicants_per_seat'] is None)}")
    print(f"Missing academic score data:    {sum(1 for s in schools if s['academic_score_pct'] is None)}")
    print(f"Excluded (no programs in this cycle's MySchools admissions): {len(excluded_dbns)}")
    if excluded_dbns:
        print(f"  {', '.join(excluded_dbns)}")
    print()
    by_borough = {}
    for s in schools:
        b = s["borough"]
        by_borough[b] = by_borough.get(b, 0) + 1
    print("By borough:")
    for b, count in sorted(by_borough.items()):
        print(f"  {b}: {count}")
    print("──────────────────────────────────────────────────")


if __name__ == "__main__":
    print("AdmitDay - School Data Builder")
    print("Sources: MySchools + NYC Open Data (DOE)")
    print("Both are public domain / open data. Safe to use with attribution.")
    print()

    doe_by_dbn = fetch_doe_directory()
    school_list = build_school_list_from_directory(doe_by_dbn)
    schools, excluded_dbns = build_school_json(school_list, doe_by_dbn)
    validate(schools, excluded_dbns)

    output_path = os.environ.get("ADMITDAY_SCHOOLS_OUTPUT", "schools.json")
    with open(output_path, "w") as f:
        json.dump(schools, f, indent=2)

    # Sidecar file next to the output, read by scripts/refresh-data.ts so the
    # refresh summary can show excluded DBNs separately from removed ones.
    excluded_output_path = str(Path(output_path).with_name(Path(output_path).stem + ".excluded.json"))
    with open(excluded_output_path, "w") as f:
        json.dump(excluded_dbns, f)

    print(f"\nDone. Saved {len(schools)} schools to {output_path}")
    print("Copy schools.json into your app's data/ directory.")
