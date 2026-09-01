// Traz os matchers de DOM (toBeInTheDocument etc.) e, junto, as declarações de
// tipo deles — sem este import o `tsc --noEmit` do CI reprova o arquivo.
import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { CardStatementPanel } from './CardStatementPanel';

/**
 * Painel de fatura do cartão.
 *
 * O QUE ESTE ARQUIVO PROTEGE
 * --------------------------
 * O painel junta quatro coisas independentes: fatura, melhor dia para comprar,
 * histórico e **importação da fatura em PDF**. Elas vinham sendo carregadas com
 * um `Promise.all` e renderizadas atrás de um `if (!statement) return null`.
 *
 * O resultado, em produção: enquanto a coluna `planned_accounts.type` esteve
 * faltando no banco, a chamada de "melhor dia" (que consulta o fluxo de caixa)
 * quebrava — e derrubava com ela o painel inteiro. A importação de PDF, que não
 * tem relação nenhuma com fluxo de caixa, simplesmente **sumia da tela**. O
 * usuário não via um erro no lugar dela; via a funcionalidade não existir.
 *
 * Por isso o teste central aqui não é "o painel mostra a fatura", e sim: o que
 * o usuário ainda consegue fazer quando parte do backend falha.
 */

jest.mock('@/lib/api', () => ({
  apiClient: {
    getCardStatement: jest.fn(),
    getCardHistory: jest.fn(),
    getCardBestDay: jest.fn(),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { apiClient } = require('@/lib/api');

const fatura = {
  cardId: 'card-1',
  cardName: 'Nubank',
  limit: 5000,
  usedLimit: 1200,
  availableLimit: 3800,
  utilizationPercentage: 24,
  closingDate: '2026-09-20T00:00:00.000Z',
  dueDate: '2026-09-27T00:00:00.000Z',
  daysUntilDue: 26,
  currentInvoice: { total: 800, count: 4, categories: [] },
  nextInvoice: { total: 400, count: 2, categories: [] },
};

/** O campo de arquivo é a importação de PDF. */
const campoDePdf = () =>
  document.querySelector('input[type="file"][accept="application/pdf"]');

describe('CardStatementPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('mostra a fatura quando tudo carrega', async () => {
    apiClient.getCardStatement.mockResolvedValue(fatura);
    apiClient.getCardHistory.mockResolvedValue([]);
    apiClient.getCardBestDay.mockResolvedValue(null);

    render(<CardStatementPanel cardId="card-1" />);

    expect(await screen.findByText('Fatura atual')).toBeInTheDocument();
    expect(campoDePdf()).toBeInTheDocument();
  });

  it('MANTÉM a importação de PDF quando o "melhor dia" falha', async () => {
    apiClient.getCardStatement.mockResolvedValue(fatura);
    apiClient.getCardHistory.mockResolvedValue([]);
    apiClient.getCardBestDay.mockRejectedValue(new Error('500'));

    render(<CardStatementPanel cardId="card-1" />);

    // Uma chamada acessória não pode derrubar o painel inteiro.
    expect(await screen.findByText('Fatura atual')).toBeInTheDocument();
    expect(campoDePdf()).toBeInTheDocument();
  });

  it('MANTÉM a importação de PDF mesmo quando a FATURA falha', async () => {
    const falha = new Error('column planned.type does not exist');
    apiClient.getCardStatement.mockRejectedValue(falha);
    apiClient.getCardHistory.mockRejectedValue(falha);
    apiClient.getCardBestDay.mockRejectedValue(falha);

    render(<CardStatementPanel cardId="card-1" />);

    // É por aqui que os lançamentos entram no cartão: se a importação some
    // junto com a fatura, o usuário fica sem caminho nenhum — inclusive num
    // cartão recém-cadastrado, que legitimamente ainda não tem fatura.
    await waitFor(() => expect(campoDePdf()).toBeInTheDocument());

    // E o motivo aparece, em vez de a tela ficar em branco sem explicação.
    expect(
      await screen.findByText(/column planned.type does not exist/i),
    ).toBeInTheDocument();
  });

  it('não esconde a importação atrás do carregamento inicial', async () => {
    apiClient.getCardStatement.mockResolvedValue(fatura);
    apiClient.getCardHistory.mockResolvedValue([]);
    apiClient.getCardBestDay.mockResolvedValue(null);

    render(<CardStatementPanel cardId="card-1" />);

    await waitFor(() => expect(campoDePdf()).toBeInTheDocument());
    expect(
      screen.getByText(/Nada é gravado antes de você confirmar/i),
    ).toBeInTheDocument();
  });
});
