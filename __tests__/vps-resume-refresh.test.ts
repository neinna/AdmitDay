/** @jest-environment node */
import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

const ROOT = path.resolve(__dirname, "..");
const SCRIPT = path.join(ROOT, "scripts/vps-resume-refresh.sh");
const CRON_LINES = fs
  .readFileSync(path.join(ROOT, "scripts/vps-data-cron.txt"), "utf-8")
  .split("\n")
  .filter((l) => l.trim() && !l.trim().startsWith("#"));

let dir: string;

function write(name: string, body: string) {
  const p = path.join(dir, name);
  fs.writeFileSync(p, body, { mode: 0o755 });
  return p;
}

function setup(opts: { refreshFails?: boolean; pr?: boolean; crontab?: string }) {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "resume-"));
  const store = path.join(dir, "crontab.txt");
  const calls = path.join(dir, "calls.log");
  if (opts.crontab !== undefined) fs.writeFileSync(store, opts.crontab);
  fs.writeFileSync(calls, "");
  write(
    "refresh.sh",
    `#!/bin/sh\necho "$1" >> "${calls}"\n${opts.refreshFails ? "exit 1" : "exit 0"}\n`,
  );
  write(
    "crontab",
    `#!/bin/sh\nif [ "$1" = "-l" ]; then [ -f "${store}" ] && cat "${store}"; exit 0; fi\ncat > "${store}"\n`,
  );
  fs.mkdirSync(path.join(dir, "bin"));
  fs.writeFileSync(
    path.join(dir, "bin/gh"),
    `#!/bin/sh\nif [ "$2" = "view" ]; then exit ${opts.pr === false ? 1 : 0}; fi\nexit 0\n`,
    { mode: 0o755 },
  );
  return { store, calls };
}

function run() {
  return spawnSync("bash", [SCRIPT], {
    cwd: ROOT,
    encoding: "utf-8",
    env: {
      ...process.env,
      PATH: `${path.join(dir, "bin")}:${process.env.PATH}`,
      REFRESH_SCRIPT: path.join(dir, "refresh.sh"),
      CRONTAB_BIN: path.join(dir, "crontab"),
    },
  });
}

afterEach(() => {
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
  dir = "";
});

describe("vps-resume-refresh.sh", () => {
  it("is executable", () => {
    expect(() => fs.accessSync(SCRIPT, fs.constants.X_OK)).not.toThrow();
  });

  it("leaves the crontab untouched when refresh fails", () => {
    const { store, calls } = setup({ refreshFails: true, crontab: "0 1 * * * keep\n" });
    expect(run().status).not.toBe(0);
    expect(fs.readFileSync(store, "utf-8")).toBe("0 1 * * * keep\n");
    expect(fs.readFileSync(calls, "utf-8")).toBe("pr\n");
  });

  it("installs every cron line once, drops old refresh lines, keeps others", () => {
    const { store } = setup({
      crontab: "0 1 * * * unrelated\n5 5 * * * /x/vps-data-refresh.sh pr\n",
    });
    expect(run().status).toBe(0);
    const lines = fs.readFileSync(store, "utf-8").split("\n").filter(Boolean);
    for (const l of CRON_LINES) expect(lines.filter((x) => x === l)).toHaveLength(1);
    expect(lines).toContain("0 1 * * * unrelated");
    expect(lines).not.toContain("5 5 * * * /x/vps-data-refresh.sh pr");
  });

  it("gives byte-identical crontabs when run twice", () => {
    const { store } = setup({ crontab: "0 1 * * * unrelated\n" });
    run();
    const first = fs.readFileSync(store, "utf-8");
    expect(run().status).toBe(0);
    expect(fs.readFileSync(store, "utf-8")).toBe(first);
  });

  it("skips merge but still installs cron when there is no PR", () => {
    const { store, calls } = setup({ pr: false });
    const res = run();
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("No data PR to merge.");
    expect(fs.readFileSync(calls, "utf-8")).toBe("pr\n");
    expect(fs.readFileSync(store, "utf-8")).toContain(CRON_LINES[0]);
  });

  it("merges when a PR exists", () => {
    const { calls } = setup({});
    expect(run().status).toBe(0);
    expect(fs.readFileSync(calls, "utf-8")).toBe("pr\nmerge\n");
  });
});

