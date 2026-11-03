import fs from 'fs'
import path from 'path'

const readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8')

describe('README.md matches main', () => {
  it('describes the shortlist as saved programs ranked within SHSAT and Main List sections', () => {
    expect(readme).toContain('/api/saved-programs')
    expect(readme).toContain('SHSAT and Main List sections')
    expect(readme).not.toContain('/api/saved-schools')
  })

  it('names the current stack', () => {
    expect(readme).toContain('Next.js 16')
    expect(readme).toContain('@neondatabase/serverless')
    expect(readme).not.toContain('Vercel Postgres')
    expect(readme).not.toContain('Next.js 14')
  })
})
