module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1'
  },
  // tsconfig.json sets jsx: "preserve" for Next's own compiler. Test files
  // that import a .tsx component directly (rather than reading it as source
  // text) need ts-jest to actually compile the JSX to run under plain Node.
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { jsx: 'react-jsx' } }]
  }
}
