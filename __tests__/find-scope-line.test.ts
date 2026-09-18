import * as fs from 'fs'
import * as path from 'path'

// Schools with no programs in this cycle's MySchools admissions are left out
// (#255), so /find says what the list covers (wording approved 2026-09-18).
describe('/find scope line', () => {
  it('states the list covers schools admitting 9th graders this year', () => {
    const src = fs.readFileSync(path.join(__dirname, '../app/find/FindClient.tsx'), 'utf8')
    expect(src).toContain('Schools admitting 9th graders through this year&rsquo;s NYC high school admissions.')
  })
})
