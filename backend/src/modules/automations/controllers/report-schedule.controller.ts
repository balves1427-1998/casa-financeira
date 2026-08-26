import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { User } from '../../users/entities/user.entity';
import { ReportSchedulerService } from '../services/report-scheduler.service';
import {
  CreateReportScheduleDto,
  UpdateReportScheduleDto,
  ReportScheduleDto,
  ExecutionResultDto,
} from '../dtos/report-schedule.dto';

/**
 * Controller para gerenciamento de agendamentos de relatórios
 * Endpoints para criar, listar, atualizar, deletar e executar agendamentos
 */
@Controller('reports/schedules')
@UseGuards(JwtAuthGuard)
export class ReportScheduleController {
  constructor(private reportSchedulerService: ReportSchedulerService) {}

  /**
   * POST /reports/schedules
   * Criar novo agendamento de relatório
   */
  @Post()
  async createSchedule(
    @CurrentUser() user: User,
    @Body() dto: CreateReportScheduleDto,
  ): Promise<ReportScheduleDto> {
    return this.reportSchedulerService.createSchedule(user.id, dto);
  }

  /**
   * GET /reports/schedules
   * Listar agendamentos do usuário
   */
  @Get()
  async listSchedules(
    @CurrentUser() user: User,
    @Query('isActive') isActive?: string,
    @Query('limit') limit: number = 50,
    @Query('offset') offset: number = 0,
  ): Promise<{ schedules: ReportScheduleDto[]; total: number }> {
    return this.reportSchedulerService.listSchedules(user.id, {
      isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
      limit: Math.min(limit, 100),
      offset,
    });
  }

  /**
   * GET /reports/schedules/:scheduleId
   * Obter agendamento específico
   */
  @Get(':scheduleId')
  async getSchedule(
    @CurrentUser() user: User,
    @Param('scheduleId') scheduleId: string,
  ): Promise<ReportScheduleDto> {
    return this.reportSchedulerService.getSchedule(user.id, scheduleId);
  }

  /**
   * PUT /reports/schedules/:scheduleId
   * Atualizar agendamento
   */
  @Put(':scheduleId')
  async updateSchedule(
    @CurrentUser() user: User,
    @Param('scheduleId') scheduleId: string,
    @Body() dto: UpdateReportScheduleDto,
  ): Promise<ReportScheduleDto> {
    return this.reportSchedulerService.updateSchedule(user.id, scheduleId, dto);
  }

  /**
   * DELETE /reports/schedules/:scheduleId
   * Deletar agendamento
   */
  @Delete(':scheduleId')
  async deleteSchedule(
    @CurrentUser() user: User,
    @Param('scheduleId') scheduleId: string,
  ): Promise<{ message: string }> {
    await this.reportSchedulerService.deleteSchedule(user.id, scheduleId);
    return { message: 'Agendamento deletado com sucesso' };
  }

  /**
   * POST /reports/schedules/:scheduleId/execute
   * Executar agendamento manualmente agora
   */
  @Post(':scheduleId/execute')
  async executeScheduleNow(
    @CurrentUser() user: User,
    @Param('scheduleId') scheduleId: string,
  ): Promise<ExecutionResultDto> {
    return this.reportSchedulerService.executeScheduleNow(user.id, scheduleId);
  }
}
