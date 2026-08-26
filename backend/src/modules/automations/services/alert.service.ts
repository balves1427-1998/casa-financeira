import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { Alert, AlertType, AlertSeverity, AlertStatus } from '../entities/alert.entity';
import { CreateAlertDto, AlertDto, ListAlertsDto } from '../dtos/alert.dto';

/**
 * Serviço de gerenciamento de alertas
 * Detecta e notifica usuários sobre eventos críticos
 */
@Injectable()
export class AlertService {
  private readonly logger = new Logger(AlertService.name);

  constructor(
    @InjectRepository(Alert)
    private alertRepository: Repository<Alert>,
  ) {}

  /**
   * Criar novo alerta
   */
  async createAlert(dto: CreateAlertDto): Promise<AlertDto> {
    const alert = this.alertRepository.create({
      ...dto,
      severity: dto.severity || AlertSeverity.INFO,
      status: AlertStatus.UNREAD,
      isRead: false,
    });

    const saved = await this.alertRepository.save(alert);
    this.logger.log(
      `Alerta criado para usuário ${dto.userId}: ${dto.type} - ${dto.title}`,
    );

    return this.toDto(saved);
  }

  /**
   * Listar alertas do usuário com paginação e filtros
   */
  async listAlerts(
    userId: string,
    options?: {
      type?: AlertType;
      severity?: AlertSeverity;
      isRead?: boolean;
      limit?: number;
      offset?: number;
    },
  ): Promise<ListAlertsDto> {
    const query = this.alertRepository.createQueryBuilder('alert')
      .where('alert.userId = :userId', { userId });

    if (options?.type) {
      query.andWhere('alert.type = :type', { type: options.type });
    }

    if (options?.severity) {
      query.andWhere('alert.severity = :severity', { severity: options.severity });
    }

    if (options?.isRead !== undefined) {
      query.andWhere('alert.isRead = :isRead', { isRead: options.isRead });
    }

    const total = await query.getCount();
    const unreadCount = await query.clone()
      .andWhere('alert.isRead = :isRead', { isRead: false })
      .getCount();

    const criticalCount = await query.clone()
      .andWhere('alert.severity = :severity', { severity: AlertSeverity.CRITICAL })
      .getCount();

    const alerts = await query
      .orderBy('alert.severity', 'DESC')
      .addOrderBy('alert.createdAt', 'DESC')
      .limit(options?.limit || 50)
      .offset(options?.offset || 0)
      .getMany();

    return {
      alerts: alerts.map((a) => this.toDto(a)),
      total,
      unreadCount,
      criticalCount,
    };
  }

  /**
   * Obter alerta específico
   */
  async getAlert(userId: string, alertId: string): Promise<AlertDto> {
    const alert = await this.alertRepository.findOne({
      where: { id: alertId, userId },
    });

    if (!alert) {
      throw new Error('Alerta não encontrado');
    }

    return this.toDto(alert);
  }

  /**
   * Marcar alerta como lido
   */
  async markAsRead(userId: string, alertId: string): Promise<AlertDto> {
    const alert = await this.alertRepository.findOne({
      where: { id: alertId, userId },
    });

    if (!alert) {
      throw new Error('Alerta não encontrado');
    }

    alert.isRead = true;
    alert.readAt = new Date();
    alert.status = AlertStatus.READ;

    const updated = await this.alertRepository.save(alert);
    return this.toDto(updated);
  }

  /**
   * Marcar todos os alertas como lidos
   */
  async markAllAsRead(userId: string): Promise<void> {
    await this.alertRepository.update(
      { userId, isRead: false },
      { isRead: true, readAt: new Date(), status: AlertStatus.READ },
    );
  }

  /**
   * Deletar alerta
   */
  async deleteAlert(userId: string, alertId: string): Promise<void> {
    const alert = await this.alertRepository.findOne({
      where: { id: alertId, userId },
    });

    if (!alert) {
      throw new Error('Alerta não encontrado');
    }

    await this.alertRepository.softRemove(alert);
  }

  /**
   * Limpar alertas antigos (> 30 dias)
   */
  async cleanupOldAlerts(userId: string): Promise<number> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Query manual pois não funciona com operadores no delete
    const query = this.alertRepository.createQueryBuilder('alert')
      .where('alert.userId = :userId', { userId })
      .andWhere('alert.createdAt < :date', { date: thirtyDaysAgo });

    const oldAlerts = await query.getMany();
    await this.alertRepository.softRemove(oldAlerts);

    return oldAlerts.length;
  }

  /**
   * Cron job para detectar alertas de vencimento
   * Roda diariamente à 00:00
   */
  @Cron('0 0 * * *')
  async detectDueAccountAlerts(): Promise<void> {
    try {
      this.logger.log('Executando detecção de alertas de vencimento');
      // TODO: Integrar com módulo de contas planejadas
      // Verificar contas que vencem em 3 dias, 1 dia, hoje, e vencidas
    } catch (error) {
      this.logger.error('Erro ao detectar alertas de vencimento', error.stack);
    }
  }

  /**
   * Cron job para detectar alertas de saldo baixo
   * Roda a cada 4 horas
   */
  @Cron('0 */4 * * *')
  async detectLowBalanceAlerts(): Promise<void> {
    try {
      this.logger.log('Executando detecção de alertas de saldo baixo');
      // TODO: Integrar com módulo de contas
      // Verificar contas com saldo abaixo do mínimo configurado
    } catch (error) {
      this.logger.error('Erro ao detectar alertas de saldo baixo', error.stack);
    }
  }

  /**
   * Cron job para detectar alertas de cartão próximo do limite
   * Roda a cada 6 horas
   */
  @Cron('0 */6 * * *')
  async detectCreditCardAlerts(): Promise<void> {
    try {
      this.logger.log('Executando detecção de alertas de cartão de crédito');
      // TODO: Integrar com módulo de cartões
      // Verificar cartões com uso > 80% e > 90% do limite
    } catch (error) {
      this.logger.error('Erro ao detectar alertas de cartão', error.stack);
    }
  }

  /**
   * Cron job para detectar anomalias de gasto
   * Roda diariamente
   */
  @Cron('0 8 * * *')
  async detectAnomalyAlerts(): Promise<void> {
    try {
      this.logger.log('Executando detecção de anomalias de gasto');
      // TODO: Integrar com módulo de análises
      // Verificar categorias com gastos > X% acima da média
    } catch (error) {
      this.logger.error('Erro ao detectar anomalias', error.stack);
    }
  }

  /**
   * Cron job para detectar metas em atraso
   * Roda semanalmente
   */
  @Cron('0 9 * * 1')
  async detectGoalAlerts(): Promise<void> {
    try {
      this.logger.log('Executando detecção de alertas de metas');
      // TODO: Integrar com módulo de metas
      // Verificar metas com progresso abaixo do esperado
    } catch (error) {
      this.logger.error('Erro ao detectar alertas de metas', error.stack);
    }
  }

  /**
   * Cron job para limpar alertas antigos
   * Roda mensalmente
   */
  @Cron('0 2 1 * *')
  async cleanupAlerts(): Promise<void> {
    try {
      this.logger.log('Limpando alertas antigos');
      // TODO: Implementar limpeza de alertas antigos por usuário
    } catch (error) {
      this.logger.error('Erro ao limpar alertas', error.stack);
    }
  }

  /**
   * Converter entidade para DTO
   */
  private toDto(alert: Alert): AlertDto {
    return {
      id: alert.id,
      userId: alert.userId,
      type: alert.type,
      severity: alert.severity,
      status: alert.status,
      title: alert.title,
      message: alert.message,
      data: alert.data,
      isRead: alert.isRead,
      readAt: alert.readAt,
      notificationSent: alert.notificationSent,
      notificationChannel: alert.notificationChannel,
      relatedEntityId: alert.relatedEntityId,
      relatedEntityType: alert.relatedEntityType,
      isActive: alert.isActive,
      createdAt: alert.createdAt,
      updatedAt: alert.updatedAt,
    };
  }
}
