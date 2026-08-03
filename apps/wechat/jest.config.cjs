module.exports = {
  preset: '../../node_modules/ts-jest/presets/default/jest-preset.js',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  moduleNameMapper: {
    '^@dynamic-assessment/assessment-core$': '<rootDir>/../../packages/assessment-core/src/index.ts',
  },
};
