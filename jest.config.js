module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/packages', '<rootDir>/services'],
  moduleNameMapper: {
    '^@dynamic-assessment/assessment-core$': '<rootDir>/packages/assessment-core/src/index.ts',
    '^expo-sqlite$': '<rootDir>/src/test/mocks/expoSqliteMock.ts',
    '^expo-secure-store$': '<rootDir>/src/test/mocks/expoSecureStoreMock.ts',
  },
};
