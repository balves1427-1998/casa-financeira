import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ContasDoMes } from './ContasDoMes';

const markAsPaid = jest.fn();

let contas: any[] = [];
let planejadas: any[] = [];

jest.mock('@/hooks/useAccounts', () => ({
  useAccounts: () => ({ accounts: contas }),
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
    contas = [
      { id: 'c1', type: 'checking', balance: 1000 },
      // Cartão é dívida, não dinheiro disponível: não pode entrar no caixa.
      { id: 'c2', type: 'credit_card', balance: 5000 },
    ];
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

  it('mostra o saldo em caixa sem somar o cartão', () => {
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
});
