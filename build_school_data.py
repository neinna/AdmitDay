#!/usr/bin/env python3
"""
AdmitDay - School Data Builder
Pulls all NYC public high schools from NYC-SIFT, the DOE HS Directory, and
current per-program admissions data from MySchools.
Run this on your VPS: python3 build_school_data.py
Outputs: schools.json (used directly by the app)

Sources:
  - NYC-SIFT: https://nycsift.com (aggregates DOE data, public domain)
  - DOE HS Directory: Fall 2025 InfoHub HS directory + School Quality Reports
    2024-25 (NYC Open Data `dnpx-dfnc`) -- see scripts/enrich_doe_directory.py.
    Previously NYC Open Data `uq7m-95z8`, the 2019 DOE High School Directory,
    replaced under issue #289 because it had gone six admissions cycles stale.
  - MySchools: https://www.myschools.nyc (current public program pages)

Both are public domain / open data. Safe to use with attribution.
"""

import requests
import json
import os
import time
import re
from bs4 import BeautifulSoup
from datetime import datetime, timezone
from pathlib import Path

from scripts.scrape_myschools import (
    MySchoolsError,
    MySchoolsNotAdmittingError,
    scrape_school_programs,
    scrape_school_location,
)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; AdmitDay/1.0; research tool)"
}
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

def fetch_nycsift_schools():
    print("Fetching school list from NYC-SIFT...")
    url = "https://nycsift.com/data-all.phtml?type=s"
    r = requests.get(url, headers=HEADERS, timeout=30)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "html.parser")

    schools = []
    rows = soup.select("table tr")
    for row in rows:
        cells = row.find_all("td")
        if len(cells) < 4:
            continue
        link = cells[0].find("a")
        if not link:
            continue

        name = link.get_text(strip=True)
        href = link.get("href", "")
        dbn_match = re.search(r'id=(\w+)', href)
        dbn = dbn_match.group(1) if dbn_match else ""

        location_text = cells[0].get_text(" ", strip=True)
        borough = extract_borough(location_text)

        try:
            total_students = cells[1].get_text(strip=True).replace(",", "")
            total_students = int(total_students) if total_students.isdigit() else None
        except:
            total_students = None

        try:
            aps_text = cells[2].get_text(strip=True)
            aps_match = re.search(r'([\d.]+)\s*aps', aps_text)
            applicants_per_seat = float(aps_match.group(1)) if aps_match else None
        except:
            applicants_per_seat = None

        try:
            academic_score = cells[3].get_text(strip=True).replace("%", "")
            academic_score = float(academic_score) if academic_score else None
        except:
            academic_score = None

        school = {
            "dbn": dbn,
            "name": name,
            "borough": borough,
            "total_students": total_students,
            "applicants_per_seat": applicants_per_seat,
            "academic_score_pct": academic_score,
            "sift_url": f"https://nycsift.com/{href}",
        }
        schools.append(school)

    print(f"  Found {len(schools)} schools from NYC-SIFT")
    return schools


def extract_borough(text):
    text = text.lower()
    if "manhattan" in text: return "Manhattan"
    if "brooklyn" in text: return "Brooklyn"
    if "queens" in text: return "Queens"
    if "bronx" in text: return "Bronx"
    if "staten island" in text: return "Staten Island"
    return "Unknown"


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


def fetch_myschools_location(dbn):
    """{"lat", "lng"} from the same MySchools record fetch_myschools_program_detail
    just fetched (issue #295) -- cached by fetch_school, so this is not an
    extra network call. None on any MySchools error; a school missing its
    location must not abort the refresh."""
    try:
        return scrape_school_location(dbn, cache_dir=MYSCHOOLS_CACHE_DIR)
    except MySchoolsError:
        return None


def fetch_school_detail(dbn, sift_url):
    """
    NYC-SIFT uses div.NYCSF_twocolumn pairs for program data.
    Each pair has two child divs: first is the label (e.g. Method:),
    second is the value (e.g. Ed. Opt.).
    """
    try:
        r = requests.get(sift_url, headers=HEADERS, timeout=15)
        r.raise_for_status()
        soup = BeautifulSoup(r.text, "html.parser")

        admissions_types = set()
        programs = []
        seen_program_keys = set()
        fetched_at = datetime.now(timezone.utc).isoformat()

        for col_div in soup.find_all("div", class_="NYCSF_twocolumn"):
            children = [c for c in col_div.children if getattr(c, "name", None) == "div"]
            if len(children) < 2:
                continue
            label = children[0].get_text(strip=True)
            if label == "Method:":
                value = children[1].get_text(strip=True)
                method = classify_admissions(value)
                if method:
                    admissions_types.add(method)
                    # NYC-SIFT fallback rows have no program name, only a
                    # method -- de-dupe on (method, raw value) so a school
                    # listing the same method twice doesn't produce two
                    # identical, unnamed program rows (issue #252).
                    program_key = (method, value)
                    if program_key in seen_program_keys:
                        continue
                    seen_program_keys.add(program_key)
                    programs.append({
                        "program_name": value,
                        "admissions_type": method,
                        "raw_method": value,
                        "provenance": {
                            "source": "NYC-SIFT",
                            "url": sift_url,
                            "fetched_at": fetched_at,
                        },
                    })

        return list(admissions_types), programs
    except Exception as e:
        return [], []


def build_school_json(sift_schools, doe_by_dbn):
    print("Merging data sources and fetching school details...")
    final = []
    excluded_dbns = []

    for i, school in enumerate(sift_schools):
        dbn = school["dbn"]
        doe = doe_by_dbn.get(dbn, {})

        students = school.get("total_students")
        if students:
            if students < 400: size = "small"
            elif students < 1200: size = "medium"
            else: size = "large"
        else:
            size = "medium"

        print(f"  [{i+1}/{len(sift_schools)}] {school['name'][:50]}")
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
        location = fetch_myschools_location(dbn)
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
            "location": location,
            "sift_url": school["sift_url"],
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
    print("Sources: NYC-SIFT + NYC Open Data (DOE)")
    print("Both are public domain / open data. Safe to use with attribution.")
    print()

    sift_schools = fetch_nycsift_schools()
    doe_by_dbn = fetch_doe_directory()
    schools, excluded_dbns = build_school_json(sift_schools, doe_by_dbn)
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
