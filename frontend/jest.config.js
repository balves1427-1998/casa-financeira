const nextJest = require('next/jest');

/**
 * Testes de componente.
 *
 * O primeiro caso que justificou este arquivo: a importação de fatura em PDF
 * sumia da tela quando qualquer chamada do painel de cartão falhava. Não dava
 * erro visível — a funcionalidade simplesmente deixava de existir para o
 * usuário. Tipo de defeito que tsc não pega e revisão de código deixa passar,
 * mas que um teste de renderização pega na hora.
 */
const createJestConfig = nextJest({ dir: './' });

module.exports = createJestConfig({
  testEnvironment: 'jest-environment-jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testMatch: ['<rootDir>/src/**/*.test.{ts,tsx}'],
});
