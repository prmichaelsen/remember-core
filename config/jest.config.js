export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          module: 'ES2022',
          moduleResolution: 'node'
        }
      }
    ]
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.spec.ts',
    '!src/**/*.e2e.ts',
    '!src/testing/**'
  ],
  coverageThresholds: {
    global: {
      branches:   80,
      functions:  80,
      lines:      80,
      statements: 80
    },
    // Service layer is the core of the pattern — hold it to a higher bar
    './src/services/': {
      branches:   90,
      functions:  90,
      lines:      90,
      statements: 90
    }
  },
  coverageReporters: ['text', 'lcov', 'html'],
  testMatch: [
    '**/*.spec.ts',
    '**/*.e2e.ts'
  ]
}
