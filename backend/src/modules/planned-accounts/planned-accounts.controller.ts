import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Patch,
  Query,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetCurrentUser } from '../../common/decorators/get-current-user.decorator';
import { User } from '../users/entities/user.entity';
import { PlannedAccountsService } from './planned-accounts.service';
import {
  CreatePlannedAccountDto,
  UpdatePlannedAccountDto,
} from './dtos/create-planned-account.dto';

@Controller('planned-accounts')
@UseGuards(JwtAuthGuard)
export class PlannedAccountsController {
  constructor(private plannedAccountsService: PlannedAccountsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @GetCurrentUser() user: User,
    @Body() createPlannedAccountDto: CreatePlannedAccountDto,
  ) {
    return this.plannedAccountsService.create(user, createPlannedAccountDto);
  }

  @Get()
  async findAll(@GetCurrentUser() user: User) {
    return this.plannedAccountsService.findAll(user);
  }

  @Get('upcoming')
  async findUpcoming(
    @GetCurrentUser() user: User,
    @Query('days') days?: string,
  ) {
    return this.plannedAccountsService.findUpcoming(
      user,
      days ? parseInt(days) : 30,
    );
  }

  @Get('overdue')
  async findOverdue(@GetCurrentUser() user: User) {
    return this.plannedAccountsService.findOverdue(user);
  }

  @Get('alerts')
  async getUpcomingAlerts(@GetCurrentUser() user: User) {
    return this.plannedAccountsService.getUpcomingAlerts(user);
  }

  /**
   * Planejado x Realizado da competência.
   *
   * Rota ESTÁTICA declarada antes de `:id` — o Nest casa na ordem, e "summary"
   * cairia na rota de id, respondendo 404.
   */
  @Get('summary/:month/:year')
  async getPlanejadoRealizado(
    @GetCurrentUser() user: User,
    @Param('month') month: string,
    @Param('year') year: string,
  ) {
    return this.plannedAccountsService.getPlanejadoRealizado(
      user,
      parseInt(month, 10),
      parseInt(year, 10),
    );
  }

  @Get('monthly/:month/:year')
  async getMonthlyPlan(
    @GetCurrentUser() user: User,
    @Param('month') month: string,
    @Param('year') year: string,
  ) {
    return this.plannedAccountsService.getMonthlyPlan(
      user,
      parseInt(month),
      parseInt(year),
    );
  }

  @Get('total-by-responsible/:responsible')
  async getTotalByResponsible(
    @GetCurrentUser() user: User,
    @Param('responsible') responsible: string,
    @Query('status') status?: string,
  ) {
    const total = await this.plannedAccountsService.getTotalByResponsible(
      user,
      responsible,
      status,
    );
    return { responsible, total, status };
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @GetCurrentUser() user: User,
  ) {
    return this.plannedAccountsService.findOne(id, user);
  }

  @Put(':id')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id') id: string,
    @GetCurrentUser() user: User,
    @Body() updatePlannedAccountDto: UpdatePlannedAccountDto,
  ) {
    return this.plannedAccountsService.update(id, user, updatePlannedAccountDto);
  }

  @Patch(':id/mark-as-paid')
  @HttpCode(HttpStatus.OK)
  async markAsPaid(
    @Param('id') id: string,
    @GetCurrentUser() user: User,
  ) {
    return this.plannedAccountsService.markAsPaid(id, user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('id') id: string,
    @GetCurrentUser() user: User,
  ) {
    await this.plannedAccountsService.delete(id, user);
  }
}
