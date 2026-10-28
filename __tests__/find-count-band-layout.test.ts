import { readFileSync } from 'fs';
import { join } from 'path';

const source = readFileSync(join(__dirname, '..', 'app', 'find', 'FindClient.tsx'), 'utf8');

function classOf(marker: string): string {
  const match = source.match(new RegExp(`className="([^"]*${marker}[^"]*)"`));
  if (!match) throw new Error(`no element with class ${marker}`);
  return match[1];
}

describe('/find count band layout', () => {
  it('lets the band wrap with a gap between its halves', () => {
    const band = classOf('bg-surface-2 border-b border-rule');
    expect(band).toContain('flex-wrap');
    expect(band).toContain('gap-x-6');
  });

  it('keeps the Sort control on one line at full width', () => {
    const sort = classOf('text-\\[11.5px\\] tracking-\\[0.1em\\] uppercase');
    expect(sort).toContain('shrink-0');
    expect(sort).toContain('whitespace-nowrap');
  });
});
