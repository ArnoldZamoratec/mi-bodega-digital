// Zona del negocio fija: las pruebas de reportes agrupan por día local (B-04 / D-26) y no deben
// depender de la zona de la máquina (CI corre en UTC). Se fija antes de cargar las pruebas.
process.env.TZ = 'America/Lima';

/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts', '!src/index.ts'],
  coverageThreshold: {
    global: { statements: 70, branches: 70, functions: 70, lines: 70 },
  },
};
