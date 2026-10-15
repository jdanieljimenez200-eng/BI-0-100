/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // NOTE: runInBand is a CLI-only flag, not a valid config option. Setting it here
  // produced a "Unknown option" validation warning on every run. Serial execution is
  // requested from the command line instead (see the test scripts in package.json).
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  setupFiles: ['<rootDir>/src/__tests__/helpers/entornoTests.ts'],
  // Los beforeAll de integración crean usuarios con bcrypt (12 rondas): con la
  // suite en paralelo superaban los 5 s por defecto y fallaban sin motivo real.
  testTimeout: 30_000,
  // La prueba de paridad (__tests__/contratos/gemelosFrontend.test.ts) importa los
  // gemelos de frontend/lib, que usan el alias de Next `@/` → raíz del frontend.
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/../frontend/$1',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      // isolatedModules moved out of the ts-jest option namespace (deprecated, removed in
      // v30) and into these inline compilerOptions. Kept inline rather than in
      // backend/tsconfig.json so the transpile-only behaviour applies to tests only and
      // does not add isolatedModules constraints to the production `tsc` build.
      tsconfig: {
        strict: false,
        skipLibCheck: true,
        isolatedModules: true,
      },
    }],
  },
  collectCoverageFrom: [
    'src/services/**/*.ts',
    '!src/services/**/*.d.ts',
  ],
  coverageThreshold: {
    global: {
      lines: 20,
    },
  },
};