import * as fs from 'fs'
import * as path from 'path'

describe('next.config.js agent pipeline marker', () => {
  const configPath = path.join(__dirname, '..', 'next.config.js')
  const marker = '// deployed via AdmitDay agent pipeline'

  it('has the marker comment as the last line', () => {
    const contents = fs.readFileSync(configPath, 'utf8')
    const lines = contents.split('\n').filter((line) => line.trim() !== '')
    expect(lines[lines.length - 1]).toBe(marker)
  })

  it('remains a loadable config module', () => {
    const config = require(configPath)
    expect(config).toBeDefined()
  })
})
