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
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetCurrentUser } from '../../common/decorators/get-current-user.decorator';
import { User } from '../users/entities/user.entity';
import { CreditCardsService } from './credit-cards.service';
import { CreateCreditCardDto, UpdateCreditCardDto } from './dtos/create-credit-card.dto';
import { CardStatementService } from './services/card-statement.service';
import { DefaultValuePipe, ParseIntPipe, Query, NotFoundException } from '@nestjs/common';

@Controller('credit-cards')
@UseGuards(JwtAuthGuard)
export class CreditCardsController {
  constructor(
    private creditCardsService: CreditCardsService,
    private cardStatementService: CardStatementService,
  ) {}

  /**
   * Fatura aberta, próxima, limite e categorias — tudo derivado dos
   * lançamentos do cartão.
   *
   * Rota declarada ANTES de `@Get(':id')` não é necessária aqui porque o
   * caminho tem um segmento a mais, mas a ordem é mantida por clareza.
   */
  @Get(':id/statement')
  async getStatement(
    @Param('id') id: string,
    @GetCurrentUser() user: User,
  ) {
    const statement = await this.cardStatementService.getStatement(id, user);

    if (!statement) {
      throw new NotFoundException('Cartão não encontrado');
    }

    return statement;
  }

  /** Evolução do gasto mês a mês. */
  @Get(':id/history')
  async getHistory(
    @Param('id') id: string,
    @GetCurrentUser() user: User,
    @Query('months', new DefaultValuePipe(12), ParseIntPipe) months: number,
  ) {
    return this.cardStatementService.getHistory(id, user, months);
  }

  /** Melhor dia para comprar, pelo ciclo da fatura. */
  @Get(':id/best-day')
  async getBestDay(@Param('id') id: string, @GetCurrentUser() user: User) {
    const recomendacao = await this.cardStatementService.getBestDayToBuy(
      id,
      user,
    );

    if (!recomendacao) {
      throw new NotFoundException('Cartão não encontrado');
    }

    return recomendacao;
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @GetCurrentUser() user: User,
    @Body() createCreditCardDto: CreateCreditCardDto,
  ) {
    return this.creditCardsService.create(user, createCreditCardDto);
  }

  @Get()
  async findAll(@GetCurrentUser() user: User) {
    return this.creditCardsService.findAll(user);
  }

  @Get('utilization/total')
  async getTotalUtilization(@GetCurrentUser() user: User) {
    return this.creditCardsService.getTotalUtilization(user);
  }

  @Get('due-dates')
  async getUpcomingDueDates(@GetCurrentUser() user: User) {
    return this.creditCardsService.getUpcomingDueDates(user);
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @GetCurrentUser() user: User,
  ) {
    return this.creditCardsService.findOne(id, user);
  }

  @Get(':id/utilization')
  async getCardUtilization(
    @Param('id') id: string,
    @GetCurrentUser() user: User,
  ) {
    return this.creditCardsService.getCardUtilization(id, user);
  }

  @Put(':id')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id') id: string,
    @GetCurrentUser() user: User,
    @Body() updateCreditCardDto: UpdateCreditCardDto,
  ) {
    return this.creditCardsService.update(id, user, updateCreditCardDto);
  }

  @Patch(':id/balance')
  @HttpCode(HttpStatus.OK)
  async updateBalance(
    @Param('id') id: string,
    @GetCurrentUser() user: User,
    @Body() { balance }: { balance: number },
  ) {
    return this.creditCardsService.updateBalance(id, user, balance);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('id') id: string,
    @GetCurrentUser() user: User,
  ) {
    await this.creditCardsService.delete(id, user);
  }
}
