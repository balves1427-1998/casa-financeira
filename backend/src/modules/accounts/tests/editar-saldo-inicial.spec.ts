import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdateAccountDto } from '../dtos/create-account.dto';

/**
 * Editar o saldo inicial de uma conta.
 *
 * Enquanto `accounts.balance` era só o número do cadastro, deixar editá-lo
 * seria deixar editar o saldo direto — e por isso o `UpdateAccountDto` não
 * declarava o campo. Com o saldo passando a ser DERIVADO dos lançamentos, a
 * situação se inverteu: o saldo inicial é a única parte que a pessoa informa,
 * e quem digitou ali o saldo de hoje (em vez do saldo anterior ao primeiro
 * lançamento) não tinha como consertar sem apagar e recadastrar a conta.
 */
describe('UpdateAccountDto — saldo inicial', () => {
  const erros = async (corpo: Record<string, unknown>) =>
    (await validate(plainToInstance(UpdateAccountDto, corpo), {
      whitelist: true,
      forbidNonWhitelisted: true,
    })).map((e) => e.property);

  it('aceita corrigir o saldo inicial', async () => {
    expect(await erros({ initialBalance: 1250.5 })).toEqual([]);
  });

  it('aceita zero e valores negativos — conta pode estar no vermelho', async () => {
    expect(await erros({ initialBalance: 0 })).toEqual([]);
    expect(await erros({ initialBalance: -320.75 })).toEqual([]);
  });

  it('recusa texto no lugar do número', async () => {
    expect(await erros({ initialBalance: 'mil reais' })).toContain(
      'initialBalance',
    );
  });

  it('continua sendo opcional', async () => {
    expect(await erros({ name: 'Corrente' })).toEqual([]);
  });

  it('NÃO aceita mexer no saldo direto — ele é derivado', async () => {
    // `balance` não é campo de entrada: se passasse, a pessoa poderia gravar um
    // saldo que não corresponde a nenhum lançamento.
    expect(await erros({ balance: 99999 })).toContain('balance');
  });
});
