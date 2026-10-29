import * as fs from 'fs'
import * as path from 'path'

// Next 15+ re-fetches dynamic pages on every client navigation unless
// staleTimes.dynamic is set. /find is dynamic and carries all schools, so
// menu clicks got slow after the Next 16 upgrade (#556).
describe('next.config.js client router cache', () => {
  const src = fs.readFileSync(path.join(__dirname, '../next.config.js'), 'utf8')

  it('keeps dynamic pages in the client router cache for 30 seconds', () => {
    expect(src).toMatch(/staleTimes:\s*\{\s*dynamic:\s*30\s*\}/)
  })
})
