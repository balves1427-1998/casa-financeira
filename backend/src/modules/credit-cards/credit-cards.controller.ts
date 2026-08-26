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

@Controller('credit-cards')
@UseGuards(JwtAuthGuard)
export class CreditCardsController {
  constructor(private creditCardsService: CreditCardsService) {}

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
