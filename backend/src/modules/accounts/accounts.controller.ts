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
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetCurrentUser } from '../../common/decorators/get-current-user.decorator';
import { User } from '../users/entities/user.entity';
import { AccountsService } from './accounts.service';
import { CreateAccountDto, UpdateAccountDto } from './dtos/create-account.dto';

@Controller('accounts')
@UseGuards(JwtAuthGuard)
export class AccountsController {
  constructor(private accountsService: AccountsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @GetCurrentUser() user: User,
    @Body() createAccountDto: CreateAccountDto,
  ) {
    return this.accountsService.create(user, createAccountDto);
  }

  @Get()
  async findAll(@GetCurrentUser() user: User) {
    return this.accountsService.findAll(user);
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @GetCurrentUser() user: User,
  ) {
    return this.accountsService.findOne(id, user);
  }

  @Put(':id')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id') id: string,
    @GetCurrentUser() user: User,
    @Body() updateData: UpdateAccountDto,
  ) {
    return this.accountsService.update(id, user, updateData);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('id') id: string,
    @GetCurrentUser() user: User,
  ) {
    await this.accountsService.delete(id, user);
  }

  @Get('balance/total')
  async getTotalBalance(@GetCurrentUser() user: User) {
    const detalhe = await this.accountsService.getBalanceBreakdown(user);

    return {
      totalBalance: detalhe.saldo,
      // Aberto para a tela poder explicar de onde veio o número — e denunciar
      // lançamentos sem conta definida, que entram no total mas em conta
      // nenhuma.
      saldoInicial: detalhe.saldoInicial,
      movimento: detalhe.movimento,
      semConta: detalhe.semConta,
    };
  }
}
