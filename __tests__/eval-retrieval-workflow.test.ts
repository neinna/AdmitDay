import { readFileSync } from 'fs';
import { join } from 'path';

const yml = readFileSync(
  join(__dirname, '..', '.github', 'workflows', 'eval-retrieval.yml'),
  'utf8',
);

describe('eval-retrieval workflow', () => {
  it('runs npm run eval:retrieval', () => {
    expect(yml).toMatch(/run:\s*npm run eval:retrieval/);
  });

  it('takes OPENAI_API_KEY from secrets.EVAL_OPENAI_API_KEY', () => {
    expect(yml).toMatch(
      /OPENAI_API_KEY:\s*\$\{\{\s*secrets\.EVAL_OPENAI_API_KEY\s*\}\}/,
    );
  });

  it('triggers on workflow_dispatch', () => {
    expect(yml).toMatch(/^\s*workflow_dispatch:/m);
  });

  it('triggers on pull requests touching the embedding script and data', () => {
    const paths = yml.split('pull_request:')[1] ?? '';
    expect(paths).toContain("'scripts/embed-schools.ts'");
    expect(paths).toContain("'data/school-embeddings.json'");
  });
});
