import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ImportConfirmationDto } from '../dtos/create-pdf-import.dto';

/**
 * Confirmação da importação de fatura.
 *
 * O DEFEITO QUE ISTO IMPEDE DE VOLTAR
 * -----------------------------------
 * Clicar em "Confirmar e gravar" não gravava nada e a tela não dizia nada. A
 * causa estava no contrato: o DTO exigia `importId` — que já vem na URL — e um
 * `action` declarado com `@IsEnum(['confirm', ...])`. `IsEnum` espera um objeto
 * enum, não um array; com array ele **nunca aceita valor nenhum**, e a
 * mensagem sai como "action must be one of the following values: ", com a
 * lista vazia.
 *
 * Resultado: todo POST de confirmação respondia 400 antes de chegar ao
 * serviço. A rota nunca funcionou desde que existe — e nenhum teste percorria
 * o corpo da requisição como o frontend realmente o envia.
 *
 * Por isso estes testes validam o DTO com os payloads REAIS do cliente.
 */
describe('ImportConfirmationDto', () => {
  /**
   * Achata TODAS as mensagens, inclusive as dos objetos aninhados.
   *
   * O erro de um `ajuste` inválido vive em `children`, não no primeiro nível —
   * ler só o topo faria o teste passar em silêncio diante de um payload que a
   * API recusaria.
   */
  const achatar = (erros: any[]): string[] =>
    erros.flatMap((e) => [
      ...Object.values<string>(e.constraints ?? {}),
      ...achatar(e.children ?? []),
    ]);

  const validar = async (payload: unknown) => {
    const dto = plainToInstance(ImportConfirmationDto, payload);
    return achatar(await validate(dto as object));
  };

  it('aceita corpo VAZIO — gravar tudo é o caso mais comum', async () => {
    // Era exatamente este payload que o frontend enviava, e que era recusado.
    expect(await validar({})).toEqual([]);
  });

  it('aceita ajustes de categoria feitos na conferência', async () => {
    const erros = await validar({
      ajustes: [
        { transactionId: 'extracted_1', category: 'Supermercado' },
        { transactionId: 'extracted_2', category: 'Saúde', responsible: 'giovanna' },
      ],
    });

    expect(erros).toEqual([]);
  });

  it('aceita seleção parcial de lançamentos', async () => {
    const erros = await validar({
      selectedTransactionIds: ['extracted_1', 'extracted_3'],
    });

    expect(erros).toEqual([]);
  });

  it('aceita um responsável para a fatura inteira', async () => {
    expect(await validar({ responsible: 'giovanna' })).toEqual([]);
  });

  it('recusa ajuste sem identificar o lançamento', async () => {
    const erros = await validar({ ajustes: [{ category: 'Lazer' }] });

    // Um ajuste sem transactionId não tem como ser aplicado a nada.
    expect(erros.join(' ')).toMatch(/transactionId/i);
  });

  it('recusa lista de ids que não sejam texto', async () => {
    const erros = await validar({ selectedTransactionIds: [1, 2] });
    expect(erros.length).toBeGreaterThan(0);
  });
});
