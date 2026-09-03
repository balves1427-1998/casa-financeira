import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ContasDoMes } from './ContasDoMes';

const markAsPaid = jest.fn();
const setExpensePaid = jest.fn();

let saldoDoServidor = 0;
let planejadas: any[] = [];
let despesas: any[] = [];
let receitas: any[] = [];

jest.mock('@/hooks/useAccounts', () => ({
  useAccounts: () => ({ totalBalance: saldoDoServidor }),
}));

jest.mock('@/hooks/useExpenses', () => ({
  useExpenses: () => ({ expenses: despesas, setExpensePaid }),
}));

jest.mock('@/hooks/useIncome', () => ({
  useIncome: () => ({ incomes: receitas }),
}));

jest.mock('@/hooks/usePlannedAccounts', () => ({
  usePlannedAccounts: () => ({
    planned: planejadas,
    markAsPaid,
    isSaving: false,
  }),
}));

/**
 * O painel "A pagar no mês".
 *
 * O ponto destes testes é a DATA do pagamento. Marcar como paga gravava
 * sempre "hoje" — e como quase nunca se registra no mesmo dia, a saída caía na
 * competência errada; no virar do mês, no mês errado.
 */
describe('ContasDoMes', () => {
  const hoje = new Date();
  const noMes = (dia: number) =>
    new Date(hoje.getFullYear(), hoje.getMonth(), dia, 12).toISOString();

  beforeEach(() => {
    markAsPaid.mockClear().mockResolvedValue(undefined);
    setExpensePaid.mockClear().mockResolvedValue(undefined);
    despesas = [];
    receitas = [];
    // O saldo vem pronto do servidor — já sem cartão e já contando os
    // lançamentos que não apontam para conta nenhuma.
    saldoDoServidor = 1000;
    planejadas = [
      {
        id: 'p1',
        description: 'Aluguel',
        amount: 300,
        dueDate: noMes(10),
        status: 'pending',
        type: 'expense',
      },
    ];
  });

  it('mostra o saldo que o servidor calculou, sem refazer a conta', () => {
    // Somar `account.balance` aqui dava um numero diferente do da aba Contas:
    // na base real, R$ 24.881,14 contra R$ 21.929,51. Duas telas com dois
    // saldos e pior que qualquer um dos dois.
    render(<ContasDoMes />);
    expect(screen.getByText('R$ 1.000,00')).toBeInTheDocument();
  });

  it('pergunta a data antes de confirmar o pagamento', async () => {
    render(<ContasDoMes />);

    fireEvent.click(screen.getByRole('button', { name: 'Marcar paga' }));

    const campo = screen.getByLabelText('Data do pagamento');
    expect(campo).toBeInTheDocument();
    // Sem clicar em confirmar, nada foi gravado.
    expect(markAsPaid).not.toHaveBeenCalled();

    fireEvent.change(campo, { target: { value: '2026-08-28' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() =>
      expect(markAsPaid).toHaveBeenCalledWith('p1', '2026-08-28'),
    );
  });

  it('dá para desistir sem gravar nada', () => {
    render(<ContasDoMes />);

    fireEvent.click(screen.getByRole('button', { name: 'Marcar paga' }));
    fireEvent.click(screen.getByRole('button', { name: '✕' }));

    expect(screen.queryByLabelText('Data do pagamento')).not.toBeInTheDocument();
    expect(markAsPaid).not.toHaveBeenCalled();
  });

  it('a sobra desconta o que vence no mês', () => {
    render(<ContasDoMes />);
    // 1000 em caixa − 300 a pagar = 700.
    expect(screen.getByText('R$ 700,00')).toBeInTheDocument();
  });

  it('conta a DESPESA não paga que vence no mês', async () => {
    // O caso real: catorze contas cadastradas como despesas recorrentes, e
    // este painel dizendo "R$ 0,00 a pagar" porque só olhava o Planejado.
    planejadas = [];
    despesas = [
      {
        id: 'e1',
        description: 'Luz',
        amount: 415.94,
        date: noMes(28),
        dueDate: noMes(28),
        isPaid: false,
        paymentMethod: 'debit',
      },
    ];

    render(<ContasDoMes />);

    expect(screen.getByText('Luz')).toBeInTheDocument();
    // Duas vezes: no total do mês e na linha da conta.
    expect(screen.getAllByText('R$ 415,94')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Marcar paga' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    // Despesa é quitada pelo seu próprio caminho, não pelo do Planejado.
    await waitFor(() => expect(setExpensePaid).toHaveBeenCalledWith('e1', true));
    expect(markAsPaid).not.toHaveBeenCalled();
  });

  it('receita com data futura conta em "ainda a receber"', async () => {
    // Contrapartida do saldo passar a contar só o que já entrou: sem isto, o
    // salário do dia 20 sumiria das duas contas e o mês pareceria apertado.
    planejadas = [];
    const daquiA10Dias = new Date();
    daquiA10Dias.setDate(daquiA10Dias.getDate() + 10);

    receitas = [
      { id: 'r1', description: 'Salário', amount: 8500, date: daquiA10Dias.toISOString() },
      // Já entrou: está no saldo, não pode ser contada de novo aqui.
      { id: 'r2', description: 'Reembolso', amount: 300, date: noMes(1) },
    ];

    render(<ContasDoMes />);

    expect(screen.getByText('R$ 8.500,00')).toBeInTheDocument();
  });

  it('despesa já paga e compra no cartão ficam de fora', () => {
    planejadas = [];
    despesas = [
      {
        id: 'e1',
        description: 'Ja paga',
        amount: 100,
        date: noMes(10),
        isPaid: true,
        paymentMethod: 'debit',
      },
      {
        id: 'e2',
        description: 'No cartao',
        amount: 200,
        date: noMes(10),
        isPaid: false,
        paymentMethod: 'credit',
        creditCardId: 'card-1',
      },
    ];

    render(<ContasDoMes />);

    expect(screen.queryByText('Ja paga')).not.toBeInTheDocument();
    // A compra do cartão vence dentro da fatura, que entra pelo Planejado.
    expect(screen.queryByText('No cartao')).not.toBeInTheDocument();
    expect(screen.getByText('0 conta(s)')).toBeInTheDocument();
  });
});
