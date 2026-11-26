import { readFileSync } from "fs";
import { join } from "path";

const script = readFileSync(join(__dirname, "..", "agent-coordinator.sh"), "utf8");

describe("coordinator escalation wording", () => {
  it("says the reviewer approved when held back for workflow files", () => {
    expect(script).toContain(
      'ESCALATION_REASON="approved it, but the diff changes CI workflow files under .github/workflows/, which always need a person"'
    );
    expect(script).not.toContain('ESCALATION_REASON="changes CI workflow files');
  });

  it("says the reviewer approved when held back for pipeline control files", () => {
    expect(script).toContain(
      'ESCALATION_REASON="approved it, but the diff changes pipeline control files, which always need a person: $('
    );
    expect(script).not.toContain('ESCALATION_REASON="changes pipeline control files');
  });
});
