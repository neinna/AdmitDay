import fs from "fs";
import path from "path";

const lock = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "package-lock.json"), "utf8")
);

describe("package-lock.json", () => {
  it("resolves @sentry/nextjs to a version inside the package.json range", () => {
    const [major, minor] = lock.packages["node_modules/@sentry/nextjs"].version
      .split(".")
      .map(Number);
    expect(major).toBe(10);
    expect(minor).toBeGreaterThanOrEqual(76);
  });

  it("keeps next on the 14.x line", () => {
    expect(lock.packages["node_modules/next"].version).toMatch(/^14\./);
  });
});
