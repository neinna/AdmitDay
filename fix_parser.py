import requests
import json
import time
from bs4 import BeautifulSoup

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; HSNavigator/1.0; research tool)"}

def classify_admissions(text):
    text = text.lower().strip()
    if "shsat" in text or "specialized" in text:
        return "SHSAT"
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

def fetch_school_detail(dbn, sift_url):
    try:
        r = requests.get(sift_url, headers=HEADERS, timeout=15)
        r.raise_for_status()
        soup = BeautifulSoup(r.text, "html.parser")

        admissions_types = set()
        programs = []

        # Structure: <div class="NYCSF_twocolumn">
        #   <div><strong>Method:</strong></div>
        #   <div><a ...>Ed. Opt.</a></div>
        # </div>
        for col_div in soup.find_all("div", class_="NYCSF_twocolumn"):
            children = [c for c in col_div.children if getattr(c, 'name', None) == 'div']
            if len(children) < 2:
                continue
            label = children[0].get_text(strip=True)
            if label == "Method:":
                value = children[1].get_text(strip=True)
                method = classify_admissions(value)
                if method:
                    admissions_types.add(method)
                    programs.append({
                        "admissions_type": method,
                        "raw_method": value,
                    })

        return list(admissions_types), programs
    except Exception as e:
        print(f"  ERROR {dbn}: {e}")
        return [], []

# Test on 4 schools
test_schools = [
    ("01M292", "https://nycsift.com/school-hs.phtml?id=01M292"),  # Ed Opt
    ("02M374", "https://nycsift.com/school-hs.phtml?id=02M374"),  # LaGuardia - Audition
    ("02M600", "https://nycsift.com/school-hs.phtml?id=02M600"),  # Stuyvesant - SHSAT
    ("14K454", "https://nycsift.com/school-hs.phtml?id=14K454"),  # Screened
]

print("Testing fixed parser...\n")
for dbn, url in test_schools:
    types, progs = fetch_school_detail(dbn, url)
    print(f"{dbn}: {types}")
    for p in progs:
        print(f"  raw: '{p['raw_method']}'")
    time.sleep(0.5)
