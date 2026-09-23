#!/usr/bin/env python3
"""
AdmitDay - schema summary generator (issue #321)

schools.json is a 4 MB scrape output. Nothing about its shape needs a full
read: this script distills it into data/schema-summary.json (committed,
under ~50 KB) -- every field name on a school record, on `doe_data`, on
`open_house`, on `hours`, and on a program record, with its type, how many
records have it, and one short (truncated) example, plus school/program
counts and a truncated sample record.

Run directly to regenerate data/schema-summary.json from schools.json:
  python3 scripts/build_schema_summary.py

Or point it at a different input/output (used by
__tests__/build-schema-summary.test.ts against a small fixture):
  python3 scripts/build_schema_summary.py <schools_path> <output_path>
"""

import json
import statistics
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

MAX_EXAMPLE_STRING_LEN = 200


def truncate_strings(value):
    """Recursively truncate long strings so examples/sample records stay small."""
    if isinstance(value, str):
        if len(value) > MAX_EXAMPLE_STRING_LEN:
            return value[:MAX_EXAMPLE_STRING_LEN] + "…"
        return value
    if isinstance(value, list):
        return [truncate_strings(v) for v in value]
    if isinstance(value, dict):
        return {k: truncate_strings(v) for k, v in value.items()}
    return value


def value_type(value):
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, (int, float)):
        return "number"
    if isinstance(value, str):
        return "string"
    if isinstance(value, list):
        return "array"
    if isinstance(value, dict):
        return "object"
    return "unknown"


def describe_fields(records):
    """One entry per field name appearing on any record: its type(s), how
    many records carry a non-null value, and a truncated example value."""
    keys = set()
    for record in records:
        keys.update(record.keys())

    fields = []
    for key in sorted(keys):
        types = set()
        present = 0
        example = None
        for record in records:
            if key not in record:
                continue
            value = record[key]
            types.add(value_type(value))
            if value is not None:
                present += 1
                if example is None:
                    example = value

        non_null_types = sorted(t for t in types if t != "null")
        if non_null_types:
            type_str = "|".join(non_null_types)
            if "null" in types:
                type_str += "|null"
        else:
            type_str = "null"

        fields.append(
            {
                "name": key,
                "type": type_str,
                "present": present,
                "example": truncate_strings(example),
            }
        )
    return fields


def median_number(values):
    m = statistics.median(values)
    return int(m) if float(m).is_integer() else m


def build_summary(schools):
    doe_records = [s["doe_data"] for s in schools if isinstance(s.get("doe_data"), dict)]
    # open_house/hours (issue #346): nested objects like doe_data, so their
    # own sub-fields get the same per-field type/presence/example treatment
    # instead of collapsing to a single opaque "object" entry in school_fields.
    open_house_records = [s["open_house"] for s in schools if isinstance(s.get("open_house"), dict)]
    hours_records = [s["hours"] for s in schools if isinstance(s.get("hours"), dict)]

    programs = []
    for school in schools:
        programs.extend(p for p in school.get("programs", []) or [] if isinstance(p, dict))

    programs_per_school = [len(school.get("programs", []) or []) for school in schools]

    method_counts = Counter(
        p.get("admissions_method")
        for p in programs
        if isinstance(p.get("admissions_method"), str)
    )
    admissions_methods = [
        {"value": value, "count": count}
        for value, count in sorted(method_counts.items(), key=lambda kv: (-kv[1], kv[0]))
    ]

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "school_count": len(schools),
        "school_fields": describe_fields(schools),
        "doe_data_fields": describe_fields(doe_records),
        "open_house_fields": describe_fields(open_house_records),
        "hours_fields": describe_fields(hours_records),
        "program_fields": describe_fields(programs),
        "program_count": len(programs),
        "programs_per_school": {
            "min": min(programs_per_school) if programs_per_school else 0,
            "median": median_number(programs_per_school) if programs_per_school else 0,
            "max": max(programs_per_school) if programs_per_school else 0,
        },
        "admissions_methods": admissions_methods,
        "sample_school": truncate_strings(schools[0]) if schools else None,
    }


def main():
    args = sys.argv[1:]
    schools_path = Path(args[0]) if len(args) > 0 else Path("schools.json")
    output_path = Path(args[1]) if len(args) > 1 else Path("data/schema-summary.json")

    schools = json.loads(schools_path.read_text())
    if not isinstance(schools, list):
        raise SystemExit(f"{schools_path} is not a JSON array")

    summary = build_summary(schools)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(summary, indent=2) + "\n")
    print(f"Wrote {output_path} ({output_path.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
