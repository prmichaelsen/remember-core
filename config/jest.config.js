export default {
  rootDir: '..',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'commonjs',
          moduleResolution: 'node',
          esModuleInterop: true,
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
  coverageReporters: ['text', 'lcov', 'html'],
  testMatch: [
    '**/*.spec.ts',
    '**/*.e2e.ts'
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/examples/',
    'user\\.service\\.spec\\.ts',
  ],
}
