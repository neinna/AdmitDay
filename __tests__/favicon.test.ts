/** @jest-environment node */
import fs from 'fs';
import path from 'path';

jest.mock('next/og', () => ({ ImageResponse: class {} }));

describe('favicon and apple touch icon', () => {
  it('app/icon.svg exists and uses the accent colour', () => {
    const svg = fs.readFileSync(path.join(__dirname, '..', 'app', 'icon.svg'), 'utf8');
    expect(svg).toContain('#1D4ED8');
  });

  it('app/apple-icon.tsx exports a 180x180 png', async () => {
    const mod = await import('../app/apple-icon');
    expect(mod.size.width).toBe(180);
    expect(mod.size.height).toBe(180);
    expect(mod.contentType).toBe('image/png');
  });
});
