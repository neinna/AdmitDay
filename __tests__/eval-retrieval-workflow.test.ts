import { readFileSync } from 'fs';
import { join } from 'path';

const yml = readFileSync(
  join(__dirname, '..', '.github', 'workflows', 'eval-retrieval.yml'),
  'utf8',
);

describe('eval-retrieval workflow', () => {
  it('runs npm run eval:retrieval', () => {
    expect(yml).toMatch(/npm run eval:retrieval/);
  });

  it('declares a reembed workflow_dispatch input', () => {
    expect(yml).toMatch(/inputs:\s*\n\s*reembed:/);
  });

  it('rebuilds embeddings with the eval key', () => {
    const step = yml.split('- name: Rebuild embeddings')[1].split('- name:')[0];
    expect(step).toContain('scripts/embed-schools.ts');
    expect(step).toMatch(/secrets\.EVAL_OPENAI_API_KEY/);
  });

  it('rebuilds when the input or the changed output says so', () => {
    const step = yml.split('- name: Rebuild embeddings')[1].split('- name:')[0];
    expect(step).toMatch(/if:.*inputs\.reembed.*steps\.changed\.outputs\.embed/);
  });

  it('checks out full history', () => {
    expect(yml).toMatch(/fetch-depth:\s*0/);
  });

  it('runs the eval step with shell: bash', () => {
    const step = yml.split('- name: Run retrieval eval')[1].split('- name:')[0];
    expect(step).toMatch(/shell:\s*bash/);
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
