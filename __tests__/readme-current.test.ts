import fs from 'fs'
import path from 'path'

const readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8')

describe('README.md matches main', () => {
  it('no longer presents NYC-SIFT as a live source', () => {
    expect(readme).not.toMatch(/uq7m-95z8/)
    expect(readme).not.toMatch(/NYC-SIFT provides/)
    expect(readme).not.toMatch(/myschools_status/)
  })
  it('does not say saved data is absent', () => {
    expect(readme).not.toMatch(/no saved data is attached/)
  })
  it('names the current directory dataset and the per-IP daily limit', () => {
    expect(readme).toMatch(/dnpx-dfnc/)
    expect(readme).toMatch(/20 LLM calls per IP per day/)
  })
})
