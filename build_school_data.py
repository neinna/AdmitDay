#!/usr/bin/env python3
"""
HS Navigator - School Data Builder
Pulls all NYC public high schools from NYC-SIFT and the DOE HS Directory.
Run this on your VPS: python3 build_school_data.py
Outputs: schools.json (used directly by the app)

Sources:
  - NYC-SIFT: https://nycsift.com (aggregates DOE data, public domain)
  - DOE HS Directory: https://data.cityofnewyork.us (NYC Open Data, public domain)

Both are public domain / open data. Safe to use with attribution.
"""

import requests
import json
import time
import re
from bs4 import BeautifulSoup

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; HSNavigator/1.0; research tool)"
}

# ── STEP 1: Pull school list from NYC-SIFT ──────────────────────────────────

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

        # Parse location text (contains grades and borough)
        location_text = cells[0].get_text(" ", strip=True)
        borough = extract_borough(location_text)

        # Stats columns
        try:
            total_students = cells[1].get_text(strip=True).replace(",", "")
            total_students = int(total_students) if total_students.isdigit() else None
        except:
            total_students = None

        try:
            aps_text = cells[2].get_text(strip=True)  # "X,XXX / YY (Z.ZZ aps)"
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


# ── STEP 2: Enrich with DOE Open Data (admissions type, program details) ────

def fetch_doe_directory():
    """
    NYC Open Data - DOE High School Directory
    Dataset: https://data.cityofnewyork.us/Education/DOE-High-School-Directory/uq7m-95z8
    Direct API endpoint - no key required for public datasets.
    """
    print("Fetching DOE High School Directory from NYC Open Data...")
    url = "https://data.cityofnewyork.us/resource/uq7m-95z8.json"
    params = {"$limit": 1000}
    r = requests.get(url, params=params, headers=HEADERS, timeout=30)
    r.raise_for_status()
    data = r.json()
    print(f"  Found {len(data)} records from DOE Open Data")

    # Key by DBN for easy lookup
    by_dbn = {}
    for record in data:
        dbn = record.get("dbn", "").strip()
        if dbn:
            by_dbn[dbn] = record
    return by_dbn


# ── STEP 3: Fetch per-school detail from NYC-SIFT ───────────────────────────

def fetch_school_detail(dbn, sift_url):
    """Fetch individual school page to get admissions type and program details."""
    try:
        r = requests.get(sift_url, headers=HEADERS, timeout=15)
        r.raise_for_status()
        soup = BeautifulSoup(r.text, "html.parser")

        programs = []
        admissions_types = set()

        # NYC-SIFT program tables contain admissions method
        for row in soup.select("table tr"):
            cells = row.find_all("td")
            if len(cells) >= 3:
                program_name = cells[0].get_text(strip=True)
                admissions_text = cells[1].get_text(strip=True).lower()

                method = classify_admissions(admissions_text)
                if method:
                    admissions_types.add(method)
                    programs.append({
                        "program": program_name,
                        "admissions_type": method,
                    })

        return list(admissions_types), programs
    except Exception as e:
        return [], []


def classify_admissions(text):
    if "shsat" in text or "specialized" in text:
        return "SHSAT"
    if "audition" in text or "laguardia" in text:
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


# ── STEP 4: Merge and clean ──────────────────────────────────────────────────

def build_school_json(sift_schools, doe_by_dbn):
    print("Merging data sources and fetching school details...")
    final = []

    for i, school in enumerate(sift_schools):
        dbn = school["dbn"]
        doe = doe_by_dbn.get(dbn, {})

        # Get school size bucket
        students = school.get("total_students")
        if students:
            if students < 400: size = "small"
            elif students < 1200: size = "medium"
            else: size = "large"
        else:
            size = "medium"

        # Get admissions types from SIFT detail page
        print(f"  [{i+1}/{len(sift_schools)}] {school['name'][:50]}")
        admissions_types, programs = fetch_school_detail(dbn, school["sift_url"])
        time.sleep(0.3)  # be polite to NYC-SIFT

        # Derive flags
        has_shsat = "SHSAT" in admissions_types
        has_audition = "Audition" in admissions_types
        has_screened = any(t in admissions_types for t in ["Screened", "Screened with Assessment"])
        has_open = any(t in admissions_types for t in ["Open", "Educational Option", "Zoned"])

        # Borough priority (zoned schools have borough priority)
        borough = school.get("borough", "Unknown")
        has_borough_priority = borough != "Manhattan"  # zoned schools not in Manhattan

        # Hidden gem flag: good academic score + low applicants per seat
        aps = school.get("applicants_per_seat")
        acad = school.get("academic_score_pct")
        is_hidden_gem = (
            aps is not None and aps < 5.0 and
            acad is not None and acad > 60.0
        )

        merged = {
            "dbn": dbn,
            "name": school["name"],
            "borough": borough,
            "size": size,
            "total_students": school.get("total_students"),
            "applicants_per_seat": aps,
            "academic_score_pct": acad,
            "survey_score_pct": None,  # add if needed from SIFT
            "admissions_types": admissions_types,
            "programs": programs,
            "flags": {
                "has_shsat": has_shsat,
                "has_audition": has_audition,
                "has_screened": has_screened,
                "has_open": has_open,
                "has_borough_priority": has_borough_priority,
                "is_hidden_gem": is_hidden_gem,
            },
            "doe_data": {
                "overview": doe.get("overview1", ""),
                "language": doe.get("language_classes", ""),
                "extracurriculars": doe.get("extracurricular_activities", ""),
                "website": doe.get("website", ""),
                "phone": doe.get("phone_number", ""),
                "address": doe.get("primary_address_line_1", ""),
                "zip": doe.get("zip", ""),
            },
            "sift_url": school["sift_url"],
            "last_verified": "2025-2026",
        }
        final.append(merged)

    return final


# ── STEP 5: Validate output ──────────────────────────────────────────────────

def validate(schools):
    print("\n── Validation Report ─────────────────────────────")
    print(f"Total schools:          {len(schools)}")
    print(f"With admissions types:  {sum(1 for s in schools if s['admissions_types'])}")
    print(f"SHSAT schools:          {sum(1 for s in schools if s['flags']['has_shsat'])}")
    print(f"Audition schools:       {sum(1 for s in schools if s['flags']['has_audition'])}")
    print(f"Screened schools:       {sum(1 for s in schools if s['flags']['has_screened'])}")
    print(f"Open/EdOpt/Zoned:       {sum(1 for s in schools if s['flags']['has_open'])}")
    print(f"Hidden gems:            {sum(1 for s in schools if s['flags']['is_hidden_gem'])}")
    print(f"Missing admissions:     {sum(1 for s in schools if not s['admissions_types'])}")
    print()

    by_borough = {}
    for s in schools:
        b = s["borough"]
        by_borough[b] = by_borough.get(b, 0) + 1
    print("By borough:")
    for b, count in sorted(by_borough.items()):
        print(f"  {b}: {count}")
    print("──────────────────────────────────────────────────")


# ── MAIN ─────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("HS Navigator - School Data Builder")
    print("Sources: NYC-SIFT + NYC Open Data (DOE)")
    print("Both are public domain / open data. Safe to use with attribution.")
    print()

    sift_schools = fetch_nycsift_schools()
    doe_by_dbn = fetch_doe_directory()
    schools = build_school_json(sift_schools, doe_by_dbn)
    validate(schools)

    output_path = "schools.json"
    with open(output_path, "w") as f:
        json.dump(schools, f, indent=2)

    print(f"\nDone. Saved {len(schools)} schools to {output_path}")
    print("Copy schools.json into your app's data/ directory.")
