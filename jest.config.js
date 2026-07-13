module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  moduleNameMapper: {
    '^expo-sqlite$': '<rootDir>/src/test/mocks/expoSqliteMock.ts',
    '^expo-secure-store$': '<rootDir>/src/test/mocks/expoSecureStoreMock.ts',
  },
};
