"""
AdmitDay LLM-as-a-Judge Eval Script
=====================================
Sends each golden dataset test case to Claude for automated scoring,
then compares against manual human scores.

Usage:
    ANTHROPIC_API_KEY="sk-ant-..." python listready_eval.py

Output:
    - Per-case comparison table (human score vs judge score)
    - Overall agreement rate
    - Disagreement details with judge reasoning
"""

import json
import os
import anthropic

# ---------------------------------------------------------------------------
# Golden dataset: 12 test cases from manual eval (April 21, 2026)
# Each entry has: filter inputs, school name, AI description, human score
# ---------------------------------------------------------------------------
GOLDEN_DATASET = [
    {
        "id": 1,
        "filters": {
            "eval_type": "SHSAT",
            "borough": "All",
            "interests": "None",
            "sports": "None",
            "shsat": "Yes",
            "auditions": "Yes",
            "academic_level": "Exceptional",
            "gened_iep": "GenEd",
            "school_size": "Large"
        },
        "school": "Stuyvesant",
        "ai_title": "Elite STEM, highly competitive",
        "ai_rationale": "Rigorous STEM-focused curriculum for top academic performers with strong humanities offerings. Offers 7 languages including Japanese and Latin. 190+ student-run clubs, 42 PSAL sports teams, and multiple student publications spanning all interests.",
        "human_score": 3
    },
    {
        "id": 2,
        "filters": {
            "eval_type": "Audition",
            "borough": "Manhattan",
            "interests": "Arts",
            "sports": "None",
            "shsat": "Yes",
            "auditions": "Yes",
            "academic_level": "Exceptional",
            "gened_iep": "GenEd",
            "school_size": "Large"
        },
        "school": "Special Music School",
        "ai_title": "Elite music conservatory, audition-only",
        "ai_rationale": "Combines rigorous academics with intensive music instruction through partnership with Kaufman Music Center. Features monthly performance classes, juries, SMS Onstage Concert Series, and Cabaret and Concerto Competitions. Student-led clubs include GSA and National Honor Society with weekly advisory focusing on community building.",
        "human_score": 3
    },
    {
        "id": 3,
        "filters": {
            "eval_type": "Screened",
            "borough": "All",
            "interests": "None",
            "sports": "None",
            "shsat": "No",
            "auditions": "No",
            "academic_level": "Exceptional",
            "gened_iep": "GenEd",
            "school_size": "Large"
        },
        "school": "Townsend Harris",
        "ai_title": "Nationally recognized academic model school",
        "ai_rationale": "Academically selective program emphasizing rigorous curriculum for high-achieving students. Offers 5 languages including Greek, Japanese, and Latin. 30+ activities including Mock Trial, Model UN, Science Olympiad, and unique programs like Brain Bee and Science & Humanities Symposium.",
        "human_score": 3
    },
    {
        "id": 4,
        "filters": {
            "eval_type": "Screened",
            "borough": "All",
            "interests": "None",
            "sports": "None",
            "shsat": "No",
            "auditions": "No",
            "academic_level": "Exceptional",
            "gened_iep": "GenEd",
            "school_size": "Large"
        },
        "school": "Scholars Academy",
        "ai_title": "Accelerated academics, arts integration",
        "ai_rationale": "Academically accelerated curriculum preparing students for 21st century careers with strong college focus. Offers 35+ extracurriculars including Carnegie Hall Program, LEGO Robotics, Shakespeare, and comprehensive arts offerings from dance to sculpture. Features unique programs like Stock Market Game and peer mentoring alongside traditional academic clubs.",
        "human_score": 2
    },
    {
        "id": 5,
        "filters": {
            "eval_type": "Screened",
            "borough": "All",
            "interests": "None",
            "sports": "Basketball",
            "shsat": "No",
            "auditions": "No",
            "academic_level": "Exceptional",
            "gened_iep": "GenEd",
            "school_size": "Large"
        },
        "school": "Baccalaureate School for Global Education",
        "ai_title": "IB Diploma Programme, global focus",
        "ai_rationale": "Authorized International Baccalaureate school offering rigorous college preparatory curriculum for highly motivated students. Offers 3 languages including Mandarin and French. 20+ activities spanning robotics, debate, musical theater, and creative writing with fitness and tutoring support.",
        "human_score": 3
    },
    {
        "id": 6,
        "filters": {
            "eval_type": "Ed Opt (optional)",
            "borough": "All",
            "interests": "None",
            "sports": "None",
            "shsat": "No",
            "auditions": "No",
            "academic_level": "All",
            "gened_iep": "GenEd",
            "school_size": "Large"
        },
        "school": "Academy of Finance and Enterprise",
        "ai_title": "Business-focused, project-based learning",
        "ai_rationale": "Specialized finance and enterprise curriculum with challenging, project-based approach to global business education. Offers Spanish language instruction and 20+ extracurriculars including Entrepreneurship, Guitar, and Filipino American Human Services Inc.",
        "human_score": 3
    },
    {
        "id": 7,
        "filters": {
            "eval_type": "Lottery",
            "borough": "All",
            "interests": "None",
            "sports": "None",
            "shsat": "No",
            "auditions": "No",
            "academic_level": "All",
            "gened_iep": "GenEd",
            "school_size": "Large"
        },
        "school": "CSI High School for International Studies",
        "ai_title": "Global themes, strong college prep",
        "ai_rationale": "Challenging college-preparatory curriculum with global themes infused throughout all subjects and exceptionally high conduct standards. Offers 3 languages including Japanese and Mandarin. 15+ diverse activities spanning Dragon Dance, Taiko Drumming, Digital Photography, and SAT Prep.",
        "human_score": 2
    },
    {
        "id": 8,
        "filters": {
            "eval_type": "Lottery",
            "borough": "All",
            "interests": "STEM",
            "sports": "Soccer",
            "shsat": "No",
            "auditions": "No",
            "academic_level": "Exceptional",
            "gened_iep": "GenEd",
            "school_size": "Large"
        },
        "school": "Bronx Latin",
        "ai_title": "College prep, leadership focus",
        "ai_rationale": "Rigorous college preparatory curriculum emphasizing scholarship and independent thought for grades 6-12. Offers 2 languages and 17+ extracurriculars including specialized leadership groups like Brotherhood and SHINE, plus West Point Leadership Corps. Strong community focus with peer tutoring and mediation programs.",
        "human_score": 2
    },
    {
        "id": 9,
        "filters": {
            "eval_type": "Lottery",
            "borough": "All",
            "interests": "STEM",
            "sports": "Soccer",
            "shsat": "No",
            "auditions": "No",
            "academic_level": "Exceptional",
            "gened_iep": "GenEd",
            "school_size": "Large"
        },
        "school": "Augustin Martin",
        "ai_title": "Aviation-themed interdisciplinary learning",
        "ai_rationale": "Features inquiry-based learning with authentic interdisciplinary curriculum focused on college and career readiness. Offers aviation club alongside unique programs like peer mediation and restorative justice. 15+ activities including leadership programs, culinary arts, and traditional sports like football and volleyball.",
        "human_score": 2
    },
    {
        "id": 10,
        "filters": {
            "eval_type": "Lottery",
            "borough": "All",
            "interests": "STEM",
            "sports": "Soccer",
            "shsat": "No",
            "auditions": "No",
            "academic_level": "Exceptional",
            "gened_iep": "GenEd",
            "school_size": "Large"
        },
        "school": "EBC High School for Public Service",
        "ai_title": "Match summary unavailable.",
        "ai_rationale": "",
        "human_score": 1
    },
    {
        "id": 11,
        "filters": {
            "eval_type": "Lottery",
            "borough": "All",
            "interests": "STEM",
            "sports": "Soccer",
            "shsat": "No",
            "auditions": "No",
            "academic_level": "Exceptional",
            "gened_iep": "GenEd",
            "school_size": "Large"
        },
        "school": "Epic High School - South",
        "ai_title": "Personalized college prep, culturally relevant",
        "ai_rationale": "Rigorous, culturally relevant curriculum with personalized instruction and early college preparation starting in ninth grade. Features 15+ clubs including Entrepreneurship, Debate Team, and Podcast Club, plus comprehensive support through SAT prep and community partnerships.",
        "human_score": 2
    },
    {
        "id": 12,
        "filters": {
            "eval_type": "Lottery",
            "borough": "Manhattan",
            "interests": "None",
            "sports": "None",
            "shsat": "No",
            "auditions": "No",
            "academic_level": "Exceptional, Strong",
            "gened_iep": "GenEd",
            "school_size": "Small"
        },
        "school": "Washington Heights Expeditionary Learning School",
        "ai_title": "Expeditionary learning with social justice focus",
        "ai_rationale": "Project-based expeditionary learning model emphasizing real-world connections and social justice. Features unique programs like Critical Race Theory club with international travel and Parsons Design Partnership. 12 clubs include camping trips, film production, and jazz ensemble.",
        "human_score": 2
    },
]


# ---------------------------------------------------------------------------
# Judge prompt
# ---------------------------------------------------------------------------
JUDGE_SYSTEM_PROMPT = """You are an eval judge for a NYC high school recommendation app called ListReady.

You will receive:
- The user's filter selections (what they were looking for)
- The school name
- The AI-generated title and rationale for that school

Score the AI output on a scale of 1-3 based on these must-haves:

MUST-HAVES:
1. Title is 4-6 words. It should name a specific program, method, or focus area rather than only generic adjectives. 4 words is acceptable; do not penalize titles at the lower end of the 4-6 range. Examples of passing titles: "IB Diploma Programme, global focus", "Elite STEM, highly competitive", "Business-focused, project-based learning". A title fails only if it is missing, says "unavailable", or contains no specific program/method/focus reference at all.
2. First sentence of the rationale covers academic focus, curriculum, or culture specifically. Phrases like "rigorous academics" or "college preparatory curriculum" count as covering academic focus if they are paired with a specific descriptor (e.g., "STEM-focused", "IB", "music instruction", "finance and enterprise"). They only fail if the first sentence is entirely generic with no subject-specific anchor.
3. At least one concrete detail from language or extracurricular data with counts and examples (e.g., "7 languages including Japanese and Latin", "42 PSAL sports teams", "15+ clubs including Entrepreneurship, Debate Team")

SCORING:
- Score 3 (High): All three must-haves present. No vague filler phrases like "21st century careers" or "global themes" without specifics.
- Score 2 (Medium): Missing one must-have, OR has all three but one relies on vague phrasing without specifics.
- Score 1 (Low): Missing two or more must-haves.

Respond with ONLY a JSON object with exactly two fields:
- "score": integer (1, 2, or 3)
- "reason": string (one sentence explaining which must-haves passed or failed)

No markdown, no backticks, no extra text. Just the JSON object."""


def build_judge_message(test_case):
    """Build the user message for the judge from a test case."""
    filters = test_case["filters"]
    filter_summary = ", ".join(
        f"{k}: {v}" for k, v in filters.items() if v and v != "None"
    )

    return f"""USER FILTERS: {filter_summary}

SCHOOL: {test_case["school"]}

AI TITLE: {test_case["ai_title"]}

AI RATIONALE: {test_case["ai_rationale"]}"""


def load_api_key():
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if api_key:
        return api_key
    env_path = os.path.join(os.path.dirname(__file__), "../app/.env.local")
    env_path = os.path.abspath(env_path)
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line.startswith("ANTHROPIC_API_KEY="):
                    return line.split("=", 1)[1].strip()
    return None


def run_eval():
    """Run the LLM-as-a-judge eval and print comparison results."""
    api_key = load_api_key()
    if not api_key:
        print("ERROR: ANTHROPIC_API_KEY not found in environment or app/.env.local")
        return

    client = anthropic.Anthropic(api_key=api_key)

    results = []
    agreements = 0
    total = len(GOLDEN_DATASET)

    print(f"\nRunning eval on {total} test cases...\n")
    print(f"{'#':<4} {'School':<45} {'Human':<7} {'Judge':<7} {'Match':<7} Judge Reason")
    print("-" * 130)

    for case in GOLDEN_DATASET:
        message = build_judge_message(case)

        try:
            response = client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=200,
                system=JUDGE_SYSTEM_PROMPT,
                messages=[{"role": "user", "content": message}],
            )
            text = response.content[0].text.strip()

            # Clean up response
            import re
            text = re.sub(r"^```json\s*", "", text)
            text = re.sub(r"\s*```$", "", text)

            judge_result = json.loads(text)
            judge_score = judge_result.get("score", 0)
            judge_reason = judge_result.get("reason", "No reason given")

        except Exception as e:
            judge_score = 0
            judge_reason = f"ERROR: {e}"

        human_score = case["human_score"]
        match = "YES" if judge_score == human_score else "NO"
        if judge_score == human_score:
            agreements += 1

        results.append({
            "id": case["id"],
            "school": case["school"],
            "human_score": human_score,
            "judge_score": judge_score,
            "match": match,
            "reason": judge_reason,
        })

        print(f"{case['id']:<4} {case['school']:<45} {human_score:<7} {judge_score:<7} {match:<7} {judge_reason}")

    # Summary
    agreement_rate = (agreements / total) * 100
    print("-" * 130)
    print(f"\nAgreement rate: {agreements}/{total} ({agreement_rate:.0f}%)")

    # Show disagreements
    disagreements = [r for r in results if r["match"] == "NO"]
    if disagreements:
        print(f"\n--- DISAGREEMENTS ({len(disagreements)}) ---\n")
        for d in disagreements:
            direction = ""
            if d["judge_score"] > d["human_score"]:
                direction = "(judge scored HIGHER)"
            elif d["judge_score"] < d["human_score"]:
                direction = "(judge scored LOWER)"
            print(f"  #{d['id']} {d['school']}: Human={d['human_score']}, Judge={d['judge_score']} {direction}")
            print(f"     Reason: {d['reason']}\n")

    # Write results to JSON for later reference
    output = {
        "eval_date": "2026-05-08",
        "prompt_version": "v1_single_dimension",
        "total_cases": total,
        "agreements": agreements,
        "agreement_rate_pct": round(agreement_rate, 1),
        "results": results,
    }
    with open("listready_eval_results.json", "w") as f:
        json.dump(output, f, indent=2)
    print(f"\nFull results written to listready_eval_results.json")


if __name__ == "__main__":
    run_eval()
