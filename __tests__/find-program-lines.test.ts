import { programLines } from "@/lib/school-list-utils";
import { School } from "@/types";

function school(
  dbn: string,
  programs: Record<string, string | undefined>[],
): School {
  return { dbn, programs } as unknown as School;
}

describe("programLines", () => {
  it("lists programs with method term and slug", () => {
    const r = programLines(
      school("28Q687", [
        {
          program_code: "Q60A",
          program_name: "Aerospace Engineering Technology",
          admissions_type: "Screened",
        },
        {
          program_code: "Q60Q",
          program_name: "Aviation Maintenance Engineering Technology",
          admissions_type: "Screened",
        },
      ]),
    );
    expect(r.lines).toHaveLength(2);
    expect(
      r.lines.every((l) => l.term === "Screened" && l.slug === "screened"),
    ).toBe(true);
    expect(r.more).toBe(0);
  });

  it("limits to 3 and counts the rest", () => {
    const programs = Array.from({ length: 7 }, (_, i) => ({
      program_code: `P${i}`,
      program_name: `Program ${i}`,
      admissions_type: "Screened",
    }));
    const r = programLines(school("28Q687", programs));
    expect(r.lines).toHaveLength(3);
    expect(r.more).toBe(4);
  });

  it("counts duplicate program codes once", () => {
    const r = programLines(
      school("28Q687", [
        {
          program_code: "A1",
          program_name: "One",
          admissions_type: "Screened",
        },
        {
          program_code: "A1",
          program_name: "One again",
          admissions_type: "Screened",
        },
      ]),
    );
    expect(r.lines).toHaveLength(1);
    expect(r.more).toBe(0);
  });

  it("gives null term and slug without admissions_type", () => {
    const r = programLines(
      school("28Q687", [{ program_code: "A1", program_name: "One" }]),
    );
    expect(r.lines[0].term).toBeNull();
    expect(r.lines[0].slug).toBeNull();
  });

  it("adds the SHSAT cutoff", () => {
    const r = programLines(
      school("02M475", [
        { program_code: "M1", program_name: "Math", admissions_type: "SHSAT" },
      ]),
    );
    expect(r.lines[0].cutoff).toMatch(/^Lowest score offered in \d{4}: \d+$/);
  });
});
