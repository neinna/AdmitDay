import fs from 'fs'
import path from 'path'

describe('proxy.ts (Next 16 rename of middleware.ts)', () => {
  const root = path.join(__dirname, '..')

  it('proxy.ts exists and middleware.ts does not', () => {
    expect(fs.existsSync(path.join(root, 'proxy.ts'))).toBe(true)
    expect(fs.existsSync(path.join(root, 'middleware.ts'))).toBe(false)
  })
})
