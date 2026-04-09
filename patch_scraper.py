# Reads build_school_data.py and replaces the fetch_school_detail function

with open('build_school_data.py', 'r') as f:
    content = f.read()

old_func = '''def fetch_school_detail(dbn, sift_url):
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
        return [], []'''

new_func = '''def fetch_school_detail(dbn, sift_url):
    """Fetch individual school page to get admissions type and program details.
    NYC-SIFT uses div.NYCSF_twocolumn with two child divs: label and value.
    Method: label is followed by the admissions type as a link or text.
    """
    try:
        r = requests.get(sift_url, headers=HEADERS, timeout=15)
        r.raise_for_status()
        soup = BeautifulSoup(r.text, "html.parser")

        admissions_types = set()
        programs = []

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
                    programs.append({
                        "admissions_type": method,
                        "raw_method": value,
                    })

        return list(admissions_types), programs
    except Exception as e:
        return [], []'''

if old_func in content:
    content = content.replace(old_func, new_func)
    with open('build_school_data.py', 'w') as f:
        f.write(content)
    print("Patched successfully.")
else:
    print("ERROR: could not find the old function. Patch manually.")
