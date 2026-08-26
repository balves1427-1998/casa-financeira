import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ReportSchedule, ReportFrequency } from '../entities/report-schedule.entity';
import {
  CreateReportScheduleDto,
  UpdateReportScheduleDto,
  ReportScheduleDto,
  ExecutionResultDto,
} from '../dtos/report-schedule.dto';

@Injectable()
export class ReportSchedulerService {
  private readonly logger = new Logger(ReportSchedulerService.name);

  constructor(
    @InjectRepository(ReportSchedule)
    private scheduleRepository: Repository<ReportSchedule>,
  ) {}

  /**
   * Criar novo agendamento de relatório
   */
  async createSchedule(
    userId: string,
    dto: CreateReportScheduleDto,
  ): Promise<ReportScheduleDto> {
    this.validateScheduleConfig(dto);

    const schedule = this.scheduleRepository.create({
      userId,
      ...dto,
      executionTime: dto.executionTime || '08:00',
      isActive: dto.isActive !== false,
      nextExecution: this.calculateNextExecution(
        dto.frequency,
        dto.dayOfMonth,
        dto.daysOfWeek,
        dto.executionTime,
      ),
    });

    const saved = await this.scheduleRepository.save(schedule);
    return this.toDto(saved);
  }

  /**
   * Obter agendamento por ID
   */
  async getSchedule(userId: string, scheduleId: string): Promise<ReportScheduleDto> {
    const schedule = await this.scheduleRepository.findOne({
      where: { id: scheduleId, userId },
    });

    if (!schedule) {
      throw new NotFoundException('Agendamento não encontrado');
    }

    return this.toDto(schedule);
  }

  /**
   * Listar agendamentos do usuário
   */
  async listSchedules(
    userId: string,
    options?: { isActive?: boolean; limit?: number; offset?: number },
  ): Promise<{ schedules: ReportScheduleDto[]; total: number }> {
    const query = this.scheduleRepository.createQueryBuilder('schedule')
      .where('schedule.userId = :userId', { userId });

    if (options?.isActive !== undefined) {
      query.andWhere('schedule.isActive = :isActive', { isActive: options.isActive });
    }

    const total = await query.getCount();
    const schedules = await query
      .orderBy('schedule.nextExecution', 'ASC')
      .limit(options?.limit || 50)
      .offset(options?.offset || 0)
      .getMany();

    return {
      schedules: schedules.map((s) => this.toDto(s)),
      total,
    };
  }

  /**
   * Atualizar agendamento
   */
  async updateSchedule(
    userId: string,
    scheduleId: string,
    dto: UpdateReportScheduleDto,
  ): Promise<ReportScheduleDto> {
    const schedule = await this.scheduleRepository.findOne({
      where: { id: scheduleId, userId },
    });

    if (!schedule) {
      throw new NotFoundException('Agendamento não encontrado');
    }

    // Validar se há mudanças na frequência
    if (dto.frequency || dto.dayOfMonth || dto.daysOfWeek || dto.executionTime) {
      this.validateScheduleConfig({
        ...schedule,
        ...dto,
      } as CreateReportScheduleDto);

      // Recalcular próxima execução
      schedule.nextExecution = this.calculateNextExecution(
        dto.frequency || schedule.frequency,
        dto.dayOfMonth ?? schedule.dayOfMonth,
        dto.daysOfWeek || schedule.daysOfWeek,
        dto.executionTime || schedule.executionTime,
      );
    }

    Object.assign(schedule, dto);
    const updated = await this.scheduleRepository.save(schedule);

    return this.toDto(updated);
  }

  /**
   * Deletar agendamento (soft delete)
   */
  async deleteSchedule(userId: string, scheduleId: string): Promise<void> {
    const schedule = await this.scheduleRepository.findOne({
      where: { id: scheduleId, userId },
    });

    if (!schedule) {
      throw new NotFoundException('Agendamento não encontrado');
    }

    await this.scheduleRepository.softRemove(schedule);
  }

  /**
   * Executar agendamento manualmente
   */
  async executeScheduleNow(
    userId: string,
    scheduleId: string,
  ): Promise<ExecutionResultDto> {
    const schedule = await this.scheduleRepository.findOne({
      where: { id: scheduleId, userId },
    });

    if (!schedule) {
      throw new NotFoundException('Agendamento não encontrado');
    }

    try {
      // Aqui seria integrado com ReportGeneratorService
      const reportId = this.generateMockReportId();
      const emailsSent = await this.sendScheduledReportEmails(schedule);

      schedule.lastExecution = new Date();
      schedule.executionCount++;
      schedule.lastStatus = 'success';
      schedule.nextExecution = this.calculateNextExecution(
        schedule.frequency,
        schedule.dayOfMonth,
        schedule.daysOfWeek,
        schedule.executionTime,
      );

      await this.scheduleRepository.save(schedule);

      return {
        success: true,
        scheduleId,
        executedAt: schedule.lastExecution,
        nextExecutionAt: schedule.nextExecution,
        reportId,
        emailsSent,
      };
    } catch (error) {
      schedule.lastStatus = 'failed';
      schedule.lastErrorMessage = error.message;
      await this.scheduleRepository.save(schedule);

      this.logger.error(
        `Erro ao executar agendamento ${scheduleId}`,
        error.stack,
      );

      return {
        success: false,
        scheduleId,
        executedAt: new Date(),
        errorMessage: error.message,
      };
    }
  }

  /**
   * Cron job para executar agendamentos diários
   * Roda a cada 5 minutos para verificar agendamentos pendentes
   */
  @Cron('*/5 * * * *')
  async processScheduledReports(): Promise<void> {
    try {
      const now = new Date();

      // Query manual pois não funciona com operadores no find
      const query = this.scheduleRepository.createQueryBuilder('schedule')
        .where('schedule.isActive = :isActive', { isActive: true })
        .andWhere('schedule.nextExecution <= :now', { now });

      const pendingSchedules = await query.getMany();

      this.logger.log(`Processando ${pendingSchedules.length} agendamentos`);

      for (const schedule of pendingSchedules) {
        await this.executeScheduleNow(schedule.userId, schedule.id);
      }
    } catch (error) {
      this.logger.error('Erro no processamento de agendamentos', error.stack);
    }
  }

  /**
   * Validar configuração do agendamento
   */
  private validateScheduleConfig(dto: CreateReportScheduleDto): void {
    // Validar frequência
    if (!Object.values(ReportFrequency).includes(dto.frequency)) {
      throw new BadRequestException('Frequência inválida');
    }

    // Para monthly/quarterly/annual, dayOfMonth é obrigatório
    if (
      [ReportFrequency.MONTHLY, ReportFrequency.QUARTERLY, ReportFrequency.ANNUAL].includes(
        dto.frequency,
      ) &&
      (!dto.dayOfMonth || dto.dayOfMonth < 1 || dto.dayOfMonth > 31)
    ) {
      throw new BadRequestException('Dia do mês inválido para essa frequência');
    }

    // Para weekly, daysOfWeek é obrigatório
    if (
      dto.frequency === ReportFrequency.WEEKLY &&
      (!dto.daysOfWeek || dto.daysOfWeek.length === 0)
    ) {
      throw new BadRequestException('Dias da semana obrigatórios para frequência semanal');
    }

    // Validar hora
    if (dto.executionTime && !this.isValidTimeFormat(dto.executionTime)) {
      throw new BadRequestException('Formato de hora inválido (use HH:mm)');
    }
  }

  /**
   * Calcular próxima execução
   */
  private calculateNextExecution(
    frequency: ReportFrequency,
    dayOfMonth?: number,
    daysOfWeek?: string[],
    executionTime: string = '08:00',
  ): Date {
    const [hours, minutes] = executionTime.split(':').map(Number);
    const next = new Date();
    next.setHours(hours, minutes, 0, 0);

    switch (frequency) {
      case ReportFrequency.DAILY:
        if (next < new Date()) {
          next.setDate(next.getDate() + 1);
        }
        break;

      case ReportFrequency.WEEKLY:
        const targetDays = daysOfWeek || ['monday'];
        const dayMap = {
          sunday: 0,
          monday: 1,
          tuesday: 2,
          wednesday: 3,
          thursday: 4,
          friday: 5,
          saturday: 6,
        };

        let found = false;
        for (let i = 0; i < 7; i++) {
          const checkDate = new Date(next);
          checkDate.setDate(checkDate.getDate() + i);
          const dayName = Object.keys(dayMap).find(
            (key) => dayMap[key as keyof typeof dayMap] === checkDate.getDay(),
          );

          if (dayName && targetDays.includes(dayName) && checkDate >= new Date()) {
            return checkDate;
          }
        }
        break;

      case ReportFrequency.MONTHLY:
        next.setDate(dayOfMonth || 1);
        if (next < new Date()) {
          next.setMonth(next.getMonth() + 1);
        }
        break;

      case ReportFrequency.QUARTERLY:
        next.setDate(dayOfMonth || 1);
        next.setMonth(Math.floor(next.getMonth() / 3) * 3);
        if (next < new Date()) {
          next.setMonth(next.getMonth() + 3);
        }
        break;

      case ReportFrequency.ANNUAL:
        next.setDate(dayOfMonth || 1);
        next.setMonth(0);
        if (next < new Date()) {
          next.setFullYear(next.getFullYear() + 1);
        }
        break;
    }

    return next;
  }

  /**
   * Validar formato de hora
   */
  private isValidTimeFormat(time: string): boolean {
    const regex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    return regex.test(time);
  }

  /**
   * Enviar relatórios por email
   */
  private async sendScheduledReportEmails(schedule: ReportSchedule): Promise<number> {
    if (!schedule.recipientEmails || schedule.recipientEmails.length === 0) {
      return 0;
    }

    // Aqui seria integrado com EmailService
    this.logger.log(
      `Enviando relatório ${schedule.name} para ${schedule.recipientEmails.join(', ')}`,
    );

    // Mock: simular envio
    return schedule.recipientEmails.length;
  }

  /**
   * Gerar ID mock para relatório
   */
  private generateMockReportId(): string {
    return `report-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Converter entidade para DTO
   */
  private toDto(schedule: ReportSchedule): ReportScheduleDto {
    return {
      id: schedule.id,
      userId: schedule.userId,
      name: schedule.name,
      reportType: schedule.reportType,
      frequency: schedule.frequency,
      config: schedule.config,
      recipientEmails: schedule.recipientEmails || [],
      dayOfMonth: schedule.dayOfMonth,
      daysOfWeek: schedule.daysOfWeek,
      executionTime: schedule.executionTime,
      isActive: schedule.isActive,
      lastExecution: schedule.lastExecution,
      nextExecution: schedule.nextExecution,
      executionCount: schedule.executionCount,
      lastStatus: schedule.lastStatus,
      lastErrorMessage: schedule.lastErrorMessage,
      metadata: schedule.metadata,
      createdAt: schedule.createdAt,
      updatedAt: schedule.updatedAt,
    };
  }
}
