import * as fs from 'fs'
import * as path from 'path'

// The scope line under the match count was removed (#600).
describe('/find scope line', () => {
  it('no longer shows the scope line under the match count', () => {
    const src = fs.readFileSync(path.join(__dirname, '../app/find/FindClient.tsx'), 'utf8')
    expect(src).not.toContain('Schools admitting 9th graders')
  })
})
