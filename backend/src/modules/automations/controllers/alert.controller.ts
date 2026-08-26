import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Query,
  UseGuards,
  Post,
  Body,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { User } from '../../users/entities/user.entity';
import { AlertService } from '../services/alert.service';
import {
  AlertDto,
  ListAlertsDto,
  UpdateAlertDto,
  UpdateNotificationPreferencesDto,
} from '../dtos/alert.dto';
import { AlertType, AlertSeverity } from '../entities/alert.entity';

/**
 * Controller para gerenciamento de alertas
 * Endpoints para listar, ler, deletar e gerenciar preferências
 */
@Controller('alerts')
@UseGuards(JwtAuthGuard)
export class AlertController {
  constructor(private alertService: AlertService) {}

  /**
   * GET /alerts
   * Listar alertas do usuário com filtros
   */
  @Get()
  async listAlerts(
    @CurrentUser() user: User,
    @Query('type') type?: string,
    @Query('severity') severity?: string,
    @Query('isRead') isRead?: string,
    @Query('limit') limit: number = 50,
    @Query('offset') offset: number = 0,
  ): Promise<ListAlertsDto> {
    return this.alertService.listAlerts(user.id, {
      type: type as AlertType,
      severity: severity as AlertSeverity,
      isRead: isRead === 'true' ? true : isRead === 'false' ? false : undefined,
      limit: Math.min(limit, 100),
      offset,
    });
  }

  /**
   * GET /alerts/:alertId
   * Obter alerta específico
   */
  @Get(':alertId')
  async getAlert(
    @CurrentUser() user: User,
    @Param('alertId') alertId: string,
  ): Promise<AlertDto> {
    return this.alertService.getAlert(user.id, alertId);
  }

  /**
   * PATCH /alerts/:alertId/read
   * Marcar alerta como lido
   */
  @Patch(':alertId/read')
  async markAsRead(
    @CurrentUser() user: User,
    @Param('alertId') alertId: string,
  ): Promise<AlertDto> {
    return this.alertService.markAsRead(user.id, alertId);
  }

  /**
   * POST /alerts/read-all
   * Marcar todos os alertas como lidos
   */
  @Post('read-all')
  async markAllAsRead(@CurrentUser() user: User): Promise<{ message: string }> {
    await this.alertService.markAllAsRead(user.id);
    return { message: 'Todos os alertas foram marcados como lidos' };
  }

  /**
   * DELETE /alerts/:alertId
   * Deletar alerta
   */
  @Delete(':alertId')
  async deleteAlert(
    @CurrentUser() user: User,
    @Param('alertId') alertId: string,
  ): Promise<{ message: string }> {
    await this.alertService.deleteAlert(user.id, alertId);
    return { message: 'Alerta deletado com sucesso' };
  }

  /**
   * GET /alerts/preferences
   * Obter preferências de notificação (placeholder)
   */
  @Get('preferences')
  async getNotificationPreferences(@CurrentUser() user: User): Promise<any> {
    // TODO: Implementar preferências de notificação
    return {
      userId: user.id,
      emailNotifications: true,
      smsNotifications: false,
      inAppNotifications: true,
      alertTypes: {
        accountDue: true,
        creditCard: true,
        lowBalance: true,
        anomaly: true,
        goal: true,
      },
      daysBeforeDue: 3,
    };
  }

  /**
   * PUT /alerts/preferences
   * Atualizar preferências de notificação
   */
  @Patch('preferences')
  async updateNotificationPreferences(
    @CurrentUser() user: User,
    @Body() dto: UpdateNotificationPreferencesDto,
  ): Promise<any> {
    // TODO: Implementar atualização de preferências
    return {
      message: 'Preferências de notificação atualizadas',
      ...dto,
    };
  }
}
