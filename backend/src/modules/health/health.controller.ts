import { Controller, Get } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Health check da aplicação.
 *
 * Railway, Render, Fly e Kubernetes consultam um endpoint como este para decidir
 * se a instância está pronta para receber tráfego. Sem ele, a plataforma só
 * consegue verificar se a porta abriu — o que acontece antes de o banco estar
 * acessível, e faz um deploy quebrado passar por saudável.
 *
 * Rota pública de propósito: exigir autenticação aqui impediria a própria
 * plataforma de verificar o serviço.
 */
@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /**
   * GET /health
   * Liveness — o processo está de pé e respondendo.
   */
  @Get()
  liveness(): { status: string; timestamp: string; uptimeSeconds: number } {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
    };
  }

  /**
   * GET /health/ready
   * Readiness — o banco responde, então a aplicação consegue servir requisições.
   *
   * Devolve 200 com `status: 'degraded'` em vez de lançar exceção: uma falha
   * momentânea de conexão não deve derrubar a instância inteira, mas precisa
   * ficar visível no monitoramento.
   */
  @Get('ready')
  async readiness(): Promise<{
    status: string;
    database: string;
    timestamp: string;
  }> {
    let database = 'down';

    try {
      await this.dataSource.query('SELECT 1');
      database = 'up';
    } catch {
      database = 'down';
    }

    return {
      status: database === 'up' ? 'ok' : 'degraded',
      database,
      timestamp: new Date().toISOString(),
    };
  }
}
