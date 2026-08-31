import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  DefaultValuePipe,
  ParseIntPipe,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetCurrentUser } from '../../common/decorators/get-current-user.decorator';
import { User } from '../users/entities/user.entity';
import { IncomeService } from './income.service';
import {
  CreateIncomeDto,
  SetIncomeRecurrenceDto,
  UpdateIncomeDto,
} from './dtos/income.dto';

/**
 * Controller de Receitas (item 3 do escopo do projeto).
 *
 * O módulo existia apenas como entidade — não havia nenhuma forma de cadastrar
 * uma receita pela API, o que inviabilizava saldo, sobra do mês e rateio
 * proporcional à renda.
 *
 * ORDEM DAS ROTAS: as estáticas (`recurring`, `type-breakdown`, …) vêm ANTES de
 * `@Get(':id')`, senão o parâmetro dinâmico as captura e elas nunca executam.
 */
@Controller('incomes')
@UseGuards(JwtAuthGuard)
export class IncomeController {
  constructor(private incomeService: IncomeService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@GetCurrentUser() user: User, @Body() dto: CreateIncomeDto) {
    return this.incomeService.create(user, dto);
  }

  @Get()
  async findAll(@GetCurrentUser() user: User) {
    return this.incomeService.findAll(user);
  }

  /** Receitas recorrentes (salário, aluguel recebido…). */
  @Get('recurring')
  async findRecurring(@GetCurrentUser() user: User) {
    return this.incomeService.findRecurring(user);
  }

  /**
   * Renda mensal recorrente por responsável.
   * Base do rateio proporcional à renda entre Bruno e Giovanna.
   */
  @Get('recurring/monthly')
  async getRecurringMonthlyIncome(@GetCurrentUser() user: User) {
    return this.incomeService.getRecurringMonthlyIncome(user);
  }

  /** Composição da renda por origem. */
  @Get('type-breakdown')
  async getTypeBreakdown(@GetCurrentUser() user: User) {
    return this.incomeService.getTypeBreakdown(user);
  }

  @Get('by-type/:type')
  async findByType(
    @GetCurrentUser() user: User,
    @Param('type') type: string,
  ) {
    return this.incomeService.findByType(user, type);
  }

  @Get('by-responsible/:responsible')
  async findByResponsible(
    @GetCurrentUser() user: User,
    @Param('responsible') responsible: string,
  ) {
    return this.incomeService.findByResponsible(user, responsible);
  }

  @Get('by-date-range')
  async findByDateRange(
    @GetCurrentUser() user: User,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    const inicio = new Date(startDate);
    const fim = new Date(endDate);

    if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())) {
      throw new BadRequestException(
        'Informe startDate e endDate em formato de data válido (YYYY-MM-DD).',
      );
    }

    return this.incomeService.findByDateRange(user, inicio, fim);
  }

  /**
   * Total recebido no mês.
   *
   * `DefaultValuePipe` + `ParseIntPipe`: com `transform: true` no
   * ValidationPipe global, um parâmetro numérico ausente viraria `NaN`.
   */
  @Get('monthly/:month/:year')
  async getMonthlyTotal(
    @GetCurrentUser() user: User,
    @Param('month', ParseIntPipe) month: number,
    @Param('year', ParseIntPipe) year: number,
  ) {
    const total = await this.incomeService.getMonthlyTotal(user, month, year);
    return { month, year, total };
  }

  @Get('total-by-responsible/:responsible')
  async getTotalByResponsible(
    @GetCurrentUser() user: User,
    @Param('responsible') responsible: string,
  ) {
    const total = await this.incomeService.getTotalByResponsible(
      user,
      responsible,
    );
    return { responsible, total };
  }

  /** Rota dinâmica por último, para não capturar as estáticas acima. */
  @Get(':id')
  async findOne(@GetCurrentUser() user: User, @Param('id') id: string) {
    return this.incomeService.findOne(id, user);
  }

  @Put(':id')
  async update(
    @GetCurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateIncomeDto,
  ) {
    return this.incomeService.update(id, user, dto);
  }

  /**
   * Encerra ou retoma a recorrência da receita.
   *
   * Cancelar não apaga a receita: ela é dinheiro que entrou. O que termina é a
   * projeção dos meses seguintes no Planejado.
   */
  @Patch(':id/recurrence')
  @HttpCode(HttpStatus.OK)
  async setRecurrence(
    @Param('id') id: string,
    @GetCurrentUser() user: User,
    @Body() dto: SetIncomeRecurrenceDto,
  ) {
    return this.incomeService.setRecurrenceActive(id, user, dto.active);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@GetCurrentUser() user: User, @Param('id') id: string) {
    return this.incomeService.remove(id, user);
  }
}
