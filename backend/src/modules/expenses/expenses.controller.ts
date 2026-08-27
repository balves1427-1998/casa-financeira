import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Query,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetCurrentUser } from '../../common/decorators/get-current-user.decorator';
import { User } from '../users/entities/user.entity';
import { ExpensesService } from './expenses.service';
import {
  CreateExpenseDto,
  SetExpensePaidDto,
  UpdateExpenseDto,
} from './dtos/create-expense.dto';

@Controller('expenses')
@UseGuards(JwtAuthGuard)
export class ExpensesController {
  constructor(private expensesService: ExpensesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @GetCurrentUser() user: User,
    @Body() createExpenseDto: CreateExpenseDto,
  ) {
    return this.expensesService.create(user, createExpenseDto);
  }

  @Get()
  async findAll(@GetCurrentUser() user: User) {
    return this.expensesService.findAll(user);
  }

  @Get('by-category/:category')
  async findByCategory(
    @GetCurrentUser() user: User,
    @Param('category') category: string,
  ) {
    return this.expensesService.findByCategory(user, category);
  }

  @Get('by-responsible/:responsible')
  async findByResponsible(
    @GetCurrentUser() user: User,
    @Param('responsible') responsible: string,
  ) {
    return this.expensesService.findByResponsible(user, responsible);
  }

  @Get('by-date-range')
  async findByDateRange(
    @GetCurrentUser() user: User,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.expensesService.findByDateRange(
      user,
      new Date(startDate),
      new Date(endDate),
    );
  }

  @Get('monthly/:month/:year')
  async getMonthlyTotal(
    @GetCurrentUser() user: User,
    @Param('month') month: string,
    @Param('year') year: string,
  ) {
    const total = await this.expensesService.getMonthlyTotal(
      user,
      parseInt(month),
      parseInt(year),
    );
    return { total };
  }

  @Get('category-breakdown')
  async getCategoryBreakdown(@GetCurrentUser() user: User) {
    return this.expensesService.getCategoryBreakdown(user);
  }

  @Get('recurring')
  async findRecurring(@GetCurrentUser() user: User) {
    return this.expensesService.findRecurring(user);
  }

  @Get('installments')
  async findInstallments(
    @GetCurrentUser() user: User,
    @Query('installmentNumber') installmentNumber?: string,
  ) {
    return this.expensesService.findInstallments(
      user,
      installmentNumber ? parseInt(installmentNumber) : undefined,
    );
  }

  @Get('daily-average')
  async getDailyAverage(
    @GetCurrentUser() user: User,
    @Query('days') days?: string,
  ) {
    const average = await this.expensesService.getDailyAverage(
      user,
      days ? parseInt(days) : 30,
    );
    return { average };
  }

  @Get('total-by-category/:category')
  async getTotalByCategory(
    @GetCurrentUser() user: User,
    @Param('category') category: string,
  ) {
    const total = await this.expensesService.getTotalByCategory(user, category);
    return { category, total };
  }

  @Get('total-by-responsible/:responsible')
  async getTotalByResponsible(
    @GetCurrentUser() user: User,
    @Param('responsible') responsible: string,
  ) {
    const total = await this.expensesService.getTotalByResponsible(
      user,
      responsible,
    );
    return { responsible, total };
  }

  /**
   * Quantas contas a casa pagou no mês, e quanto somaram.
   *
   * Rota estática: precisa ser declarada ANTES de `:id`, senão o Nest casa
   * "paid-summary" como um id de despesa.
   *
   * `DefaultValuePipe` é obrigatório porque o ValidationPipe global transforma
   * o parâmetro ausente em `NaN` antes de o controller ver.
   */
  @Get('paid-summary')
  async getPaidSummary(
    @GetCurrentUser() user: User,
    @Query('month', new DefaultValuePipe(new Date().getMonth() + 1), ParseIntPipe)
    month: number,
    @Query('year', new DefaultValuePipe(new Date().getFullYear()), ParseIntPipe)
    year: number,
  ) {
    return this.expensesService.getPaidSummary(user, month, year);
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @GetCurrentUser() user: User,
  ) {
    return this.expensesService.findOne(id, user);
  }

  @Put(':id')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id') id: string,
    @GetCurrentUser() user: User,
    @Body() updateData: UpdateExpenseDto,
  ) {
    return this.expensesService.update(id, user, updateData);
  }

  /** Marca ou desmarca a despesa como paga (o ícone da lista de lançamentos). */
  @Patch(':id/pay')
  @HttpCode(HttpStatus.OK)
  async setPaid(
    @Param('id') id: string,
    @GetCurrentUser() user: User,
    @Body() dto: SetExpensePaidDto,
  ) {
    return this.expensesService.setPaid(id, user, dto.isPaid);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('id') id: string,
    @GetCurrentUser() user: User,
  ) {
    await this.expensesService.delete(id, user);
  }
}
