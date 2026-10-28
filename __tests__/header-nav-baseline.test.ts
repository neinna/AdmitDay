import { readFileSync } from "fs";
import { join } from "path";

const files = [
  "app/find/FindClient.tsx",
  "app/shortlist/ShortlistClient.tsx",
  "app/school/[dbn]/SiteHeader.tsx",
];

describe("header nav baseline alignment", () => {
  it.each(files)("%s aligns nav items on the text baseline", (file) => {
    const src = readFileSync(join(__dirname, "..", file), "utf8");
    const nav = src.match(/<nav className="([^"]*text-\[14\.5px\][^"]*)"/);
    expect(nav).not.toBeNull();
    const classes = nav![1].split(/\s+/);
    expect(classes).toContain("items-baseline");
    expect(classes).not.toContain("items-center");
  });
});
