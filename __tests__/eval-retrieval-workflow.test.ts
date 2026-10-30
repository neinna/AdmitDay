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

  it('runs the ask eval with the Anthropic eval key and shell: bash', () => {
    const step = yml.split("- name: Run ask eval")[1].split('- name:')[0];
    expect(step).toMatch(/shell:\s*bash/);
    expect(step).toMatch(/npm run eval:retrieval:ask/);
    expect(step).toMatch(
      /ANTHROPIC_API_KEY:\s*\$\{\{\s*secrets\.EVAL_ANTHROPIC_API_KEY\s*\}\}/,
    );
  });

  it('runs the ask eval only on dispatch or when lib/ask.ts changed', () => {
    const step = yml.split('- name: Run ask eval')[1].split('- name:')[0];
    expect(step).toMatch(/if:.*workflow_dispatch.*steps\.changed\.outputs\.ask/);
  });

  it('detects a lib/ask.ts change against the PR base', () => {
    const step = yml.split('- name: Detect chunk builder change')[1].split('- name:')[0];
    expect(step).toMatch(/git diff --quiet[^\n]*-- lib\/ask\.ts[^\n]*ask=true/);
  });

  it('declares an ask_model input and passes it to the ask step as ASK_MODEL', () => {
    expect(yml).toMatch(/inputs:[\s\S]*\n\s*ask_model:/);
    const step = yml.split('- name: Run ask eval')[1].split('- name:')[0];
    expect(step).toMatch(/ASK_MODEL:\s*\$\{\{\s*github\.event\.inputs\.ask_model\s*\}\}/);
    expect(step).toContain('GITHUB_STEP_SUMMARY');
  });

  it('uploads ask results too', () => {
    expect(yml).toContain('evals/results/ask-*.json');
  });
});
