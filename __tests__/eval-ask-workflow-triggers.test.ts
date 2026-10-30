import { readFileSync } from 'fs';
import { join } from 'path';

const yml = readFileSync(
  join(__dirname, '..', '.github', 'workflows', 'eval-ask.yml'),
  'utf8',
);
const on = yml.split(/^jobs:/m)[0].split(/^on:/m)[1];

describe('eval-ask workflow triggers', () => {
  it('has no pull_request trigger', () => {
    expect(on).not.toMatch(/^\s*pull_request:/m);
  });

  it('keeps the weekly schedule and manual dispatch', () => {
    expect(on).toMatch(/^\s*schedule:/m);
    expect(on).toMatch(/^\s*workflow_dispatch:/m);
  });
});
