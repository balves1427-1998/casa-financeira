import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EmailService } from '../services/email.service';
import { EmailLog, EmailStatus, EmailType } from '../entities/email-log.entity';

/**
 * Entrega de e-mail.
 *
 * O QUE ESTES TESTES PROTEGEM
 * ---------------------------
 * O plano gratuito do Render bloqueia as portas de SMTP (25, 465, 587). Foi
 * assim que o primeiro envio real morreu: dois minutos pendurado e
 * "Connection timeout". Por isso o envio passou a ter DOIS caminhos, e a
 * escolha entre eles é o que estes testes fixam:
 *
 *  - havendo `BREVO_API_KEY`, vai por HTTPS (porta 443, que passa);
 *  - sem ela, cai no SMTP, que é o caminho de desenvolvimento;
 *  - sem nenhum dos dois, o log fica FAILED com o motivo — NUNCA "enviado".
 *
 * Esse último ponto é o mais importante do arquivo: um lembrete que o sistema
 * jura ter mandado é pior do que um lembrete que não saiu, porque tira do
 * usuário a chance de perceber.
 */
describe('EmailService — escolha do canal e entrega', () => {
  let service: EmailService;
  let salvos: EmailLog[];

  const ambienteOriginal = { ...process.env };

  const mockRepo: any = {
    create: jest.fn((d: any) => ({ ...d })),
    save: jest.fn(async (d: any) => {
      salvos.push(d);
      return { id: 'log-1', ...d };
    }),
    find: jest.fn(async () => []),
    findOne: jest.fn(async () => null),
  };

  const log = (): EmailLog =>
    ({
      id: 'log-1',
      recipient: 'giovanna@casa.com',
      subject: 'Internet vence em 3 dias',
      htmlContent: '<p>Olá</p>',
      type: EmailType.ALERT,
      status: EmailStatus.PENDING,
    }) as EmailLog;

  /** `entregar` é privado de propósito: só o serviço decide como entregar. */
  const entregar = (l: EmailLog) => (service as any).entregar(l);

  beforeEach(async () => {
    jest.clearAllMocks();
    salvos = [];

    delete process.env.BREVO_API_KEY;
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASSWORD;
    process.env.EMAIL_FROM = 'Controle Financeiro da Casa <casa@exemplo.com>';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailService,
        { provide: getRepositoryToken(EmailLog), useValue: mockRepo },
      ],
    }).compile();

    service = module.get<EmailService>(EmailService);
  });

  afterAll(() => {
    process.env = ambienteOriginal;
  });

  describe('qual canal é escolhido', () => {
    it('sem configuração nenhuma, não há canal', () => {
      expect(service.canalDeEnvio).toBeNull();
      expect(service.smtpConfigurado).toBe(false);
    });

    it('só com SMTP, usa SMTP', () => {
      process.env.SMTP_HOST = 'smtp.exemplo.com';
      process.env.SMTP_USER = 'casa@exemplo.com';
      process.env.SMTP_PASSWORD = 'segredo';

      expect(service.canalDeEnvio).toBe('smtp');
    });

    it('a API tem PRECEDÊNCIA sobre o SMTP', () => {
      process.env.SMTP_HOST = 'smtp.exemplo.com';
      process.env.SMTP_USER = 'casa@exemplo.com';
      process.env.SMTP_PASSWORD = 'segredo';
      process.env.BREVO_API_KEY = 'chave';

      // Onde o sistema roda, o SMTP está bloqueado. Ter as duas configuradas
      // não pode significar tentar a que não funciona.
      expect(service.canalDeEnvio).toBe('api');
    });
  });

  describe('entrega pela API', () => {
    beforeEach(() => {
      process.env.BREVO_API_KEY = 'chave-de-teste';
    });

    it('envia e grava o messageId devolvido', async () => {
      const fetchFalso = jest.fn(async () => ({
        ok: true,
        status: 201,
        text: async () => JSON.stringify({ messageId: '<abc@brevo>' }),
      }));
      (global as any).fetch = fetchFalso;

      const l = log();
      await entregar(l);

      expect(l.status).toBe(EmailStatus.SENT);
      expect(l.messageId).toBe('<abc@brevo>');

      const [url, opcoes] = fetchFalso.mock.calls[0] as any[];
      expect(url).toBe('https://api.brevo.com/v3/smtp/email');
      expect(opcoes.headers['api-key']).toBe('chave-de-teste');

      const corpo = JSON.parse(opcoes.body);
      expect(corpo.to).toEqual([{ email: 'giovanna@casa.com' }]);
      expect(corpo.subject).toContain('Internet');
      // "Nome <email>" precisa virar os dois campos separados que a API espera.
      expect(corpo.sender).toEqual({
        name: 'Controle Financeiro da Casa',
        email: 'casa@exemplo.com',
      });
    });

    it('aceita EMAIL_FROM sem nome', async () => {
      process.env.EMAIL_FROM = 'casa@exemplo.com';
      (global as any).fetch = jest.fn(async () => ({
        ok: true,
        status: 201,
        text: async () => '{}',
      }));

      await entregar(log());

      const corpo = JSON.parse(
        ((global as any).fetch as jest.Mock).mock.calls[0][1].body,
      );
      expect(corpo.sender.email).toBe('casa@exemplo.com');
      expect(corpo.sender.name).toBeTruthy();
    });

    it('registra o motivo quando a API RECUSA', async () => {
      (global as any).fetch = jest.fn(async () => ({
        ok: false,
        status: 401,
        text: async () => '{"message":"Key not found"}',
      }));

      const l = log();
      await expect(entregar(l)).rejects.toThrow(/401/);

      // O motivo tem que sobreviver no histórico: é o que responde
      // "por que o lembrete não chegou?" sem abrir log de servidor.
      expect(l.status).toBe(EmailStatus.FAILED);
      expect(l.errorMessage).toContain('Key not found');
      expect(salvos.at(-1)?.status).toBe(EmailStatus.FAILED);
    });

    it('DESISTE quando a API não responde, em vez de ficar pendurado', async () => {
      // Foi exatamente uma espera sem limite que derrubou o primeiro disparo
      // real: dois minutos pendurado no SMTP bloqueado, e quem chamou estourou
      // o próprio timeout sem nunca saber o motivo.
      process.env.EMAIL_HTTP_TIMEOUT_MS = '50';

      (global as any).fetch = jest.fn(
        (_url: string, opcoes: any) =>
          new Promise((_resolve, reject) => {
            opcoes.signal.addEventListener('abort', () => {
              const erro = new Error('aborted');
              erro.name = 'AbortError';
              reject(erro);
            });
          }),
      );

      const l = log();
      await expect(entregar(l)).rejects.toThrow(/não respondeu/);

      expect(l.status).toBe(EmailStatus.FAILED);
      delete process.env.EMAIL_HTTP_TIMEOUT_MS;
    });
  });

  describe('sem canal configurado', () => {
    it('marca FALHA com instrução — e nunca como enviado', async () => {
      const l = log();

      await expect(entregar(l)).rejects.toThrow();

      expect(l.status).toBe(EmailStatus.FAILED);
      expect(l.status).not.toBe(EmailStatus.SENT);
      expect(l.errorMessage).toContain('BREVO_API_KEY');
      expect(l.sentAt).toBeUndefined();
    });
  });
});
