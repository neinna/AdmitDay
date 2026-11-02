import { readFileSync } from 'fs';
import { join } from 'path';

const yml = readFileSync(
  join(__dirname, '..', '.github', 'workflows', 'eval-ask.yml'),
  'utf8',
);
const on = yml.split(/^jobs:/m)[0].split(/^on:/m)[1];

describe('eval-ask workflow triggers', () => {
  it('triggers on pull requests touching the ask path', () => {
    expect(on).toMatch(/^\s*pull_request:/m);
    const paths = on.split(/^\s*pull_request:/m)[1];
    for (const p of [
      'lib/ask.ts',
      'evals/ask-seed.json',
      'evals/run-ask-eval.ts',
      'evals/scorers.ts',
      'evals/retrieval-scorers.ts',
    ]) {
      expect(paths).toContain(`'${p}'`);
    }
    expect(paths.match(/^\s*- '/gm)).toHaveLength(5);
  });

  it('skips fork pull requests', () => {
    expect(yml).toContain(
      "if: github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name == github.repository",
    );
  });

  it('keeps the weekly schedule and manual dispatch', () => {
    expect(on).toMatch(/^\s*schedule:/m);
    expect(on).toMatch(/^\s*workflow_dispatch:/m);
  });
});
