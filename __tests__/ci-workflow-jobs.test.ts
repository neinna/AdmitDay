import { readFileSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';

const raw = readFileSync(
  join(__dirname, '..', '.github', 'workflows', 'ci.yml'),
  'utf8',
);
const doc = yaml.load(raw) as any;

const commands: Record<string, string> = {
  test: 'npm test',
  typecheck: 'npx tsc --noEmit',
  lint: 'npm run lint',
  build: 'npm run build',
};

describe('ci workflow jobs', () => {
  it.each(Object.entries(commands))('job %s last step runs %s', (id, cmd) => {
    const steps = doc.jobs[id].steps;
    expect(steps[steps.length - 1].run).toBe(cmd);
  });

  it('build job disables telemetry', () => {
    expect(doc.jobs.build.env).toEqual({ NEXT_TELEMETRY_DISABLED: '1' });
  });

  it('references no secrets', () => {
    expect(raw).not.toContain('secrets.');
  });

  it('has no path filter on pull_request', () => {
    expect(doc.on).toHaveProperty('pull_request');
    expect(doc.on.pull_request ?? {}).not.toHaveProperty('paths');
  });
});
