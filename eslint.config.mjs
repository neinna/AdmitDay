import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'

export default defineConfig([
  ...nextVitals,
  globalIgnores(['.next/**', 'out/**', 'build/**', 'coverage/**', 'next-env.d.ts']),
  {
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  {
    files: ['__tests__/**'],
    rules: {
      'react/display-name': 'off',
    },
  },
])
