export default {
  rootDir: '../test/live',
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
  testMatch: ['**/*.live.ts'],
  testPathIgnorePatterns: ['/node_modules/'],
  globalSetup: '<rootDir>/setup/global-setup.ts',
  testTimeout: 30000,
  maxWorkers: 1,
}
