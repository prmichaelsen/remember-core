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
  testMatch: ['**/*.e2e.ts'],
  testPathIgnorePatterns: ['/node_modules/'],
  testTimeout: 30000,
}
