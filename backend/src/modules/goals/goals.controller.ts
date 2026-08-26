import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetCurrentUser } from '../../common/decorators/get-current-user.decorator';
import { User } from '../users/entities/user.entity';
import { GoalsService } from './goals.service';
import { GoalStatus } from './entities/goal.entity';
import {
  CreateGoalDto,
  UpdateGoalDto,
  AddContributionDto,
} from './dtos/goal.dto';

/**
 * Controller de Metas Financeiras (item 19 do escopo do projeto).
 *
 * Toda resposta de meta já vem com o bloco `progress` calculado — percentual,
 * valor restante, meses até o prazo, aporte mensal necessário e projeção de
 * conclusão —, que é o que a tela precisa para desenhar a barra de progresso
 * sem refazer contas no front.
 *
 * ORDEM DAS ROTAS: `summary` vem ANTES de `@Get(':id')`. Se a dinâmica viesse
 * primeiro, ela capturaria "summary" como um id e a rota estática nunca
 * executaria.
 */
@Controller('goals')
@UseGuards(JwtAuthGuard)
export class GoalsController {
  constructor(private goalsService: GoalsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@GetCurrentUser() user: User, @Body() dto: CreateGoalDto) {
    return this.goalsService.create(user, dto);
  }

  /** Lista as metas da família, opcionalmente filtradas por status. */
  @Get()
  async findAll(
    @GetCurrentUser() user: User,
    @Query('status') status?: string,
  ) {
    if (status && !Object.values(GoalStatus).includes(status as GoalStatus)) {
      throw new BadRequestException(
        'Status inválido. Use: ACTIVE, COMPLETED ou CANCELLED.',
      );
    }

    return this.goalsService.findAll(user, status as GoalStatus | undefined);
  }

  /** Rota estática — precisa vir antes de `@Get(':id')`. */
  @Get('summary')
  async getSummary(@GetCurrentUser() user: User) {
    return this.goalsService.getSummary(user);
  }

  /** Rota dinâmica por último, para não capturar as estáticas acima. */
  @Get(':id')
  async findOne(@GetCurrentUser() user: User, @Param('id') id: string) {
    return this.goalsService.findOne(id, user);
  }

  @Put(':id')
  async update(
    @GetCurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateGoalDto,
  ) {
    return this.goalsService.update(id, user, dto);
  }

  /** Registra um aporte na meta e devolve o progresso recalculado. */
  @Post(':id/contributions')
  @HttpCode(HttpStatus.CREATED)
  async addContribution(
    @GetCurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: AddContributionDto,
  ) {
    return this.goalsService.addContribution(id, user, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@GetCurrentUser() user: User, @Param('id') id: string) {
    return this.goalsService.remove(id, user);
  }
}
