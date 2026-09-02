import {
  PlannedAccountStatus,
  rotuloDeStatus,
} from './planned-account';

/**
 * O status dito na língua certa.
 *
 * O relato do usuário: "quando é receita, ou seja entrada, fica somente a
 * opção de pagar; o correto seria receber". No banco entrada e saída
 * compartilham o mesmo `paid` — e a tela mostrava "Pago" em cima do salário.
 */
describe('rotuloDeStatus', () => {
  it('uma entrada é RECEBIDA, não paga', () => {
    expect(rotuloDeStatus(PlannedAccountStatus.PAID, 'income')).toBe('Recebido');
  });

  it('uma saída continua sendo paga', () => {
    expect(rotuloDeStatus(PlannedAccountStatus.PAID, 'expense')).toBe('Pago');
  });

  it('entrada vencida está ATRASADA — não "vencida"', () => {
    expect(rotuloDeStatus(PlannedAccountStatus.OVERDUE, 'income')).toBe('Atrasado');
    expect(rotuloDeStatus(PlannedAccountStatus.OVERDUE, 'expense')).toBe('Vencido');
  });

  it('os demais status são iguais nos dois lados', () => {
    for (const status of [
      PlannedAccountStatus.PENDING,
      PlannedAccountStatus.CONFIRMED,
      PlannedAccountStatus.CANCELLED,
    ]) {
      expect(rotuloDeStatus(status, 'income')).toBe(
        rotuloDeStatus(status, 'expense'),
      );
    }
  });

  it('sem tipo informado, trata como saída', () => {
    expect(rotuloDeStatus(PlannedAccountStatus.PAID)).toBe('Pago');
  });

  it('status desconhecido volta como veio, em vez de sumir', () => {
    expect(rotuloDeStatus('inexistente', 'income')).toBe('inexistente');
  });
});
