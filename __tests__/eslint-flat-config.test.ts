import fs from 'fs'
import path from 'path'

const root = path.join(__dirname, '..')

describe('eslint flat config', () => {
  it('uses a flat config and no legacy .eslintrc', () => {
    expect(fs.existsSync(path.join(root, 'eslint.config.mjs'))).toBe(true)
    expect(fs.existsSync(path.join(root, '.eslintrc.json'))).toBe(false)
  })

  it('pins eslint 9 and eslint-config-next 16', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
    expect(pkg.devDependencies.eslint).toBe('^9')
    expect(pkg.devDependencies['eslint-config-next']).toBe('16.4.3')
  })
})
