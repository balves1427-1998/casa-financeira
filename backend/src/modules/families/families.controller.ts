import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { FamiliesService } from './families.service';
import {
  CreateFamilyDto,
  UpdateFamilyDto,
  AddFamilyMemberDto,
  FamilyDto,
  FamilyMemberDto,
} from './dtos/family.dto';

/**
 * Controller de gestão de famílias.
 *
 * Antes deste módulo, associar um usuário a uma família só era possível via SQL
 * direto no banco — e sem família nenhum endpoint de inteligência financeira
 * funciona (responde 403).
 *
 * A rota estática `/families/me` vem antes de `/families/:familyId` para não
 * ser capturada pelo parâmetro dinâmico.
 */
@Controller('families')
@UseGuards(JwtAuthGuard)
export class FamiliesController {
  constructor(private familiesService: FamiliesService) {}

  /**
   * POST /families
   * Cria uma família e associa o usuário autenticado a ela.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: User,
    @Body() dto: CreateFamilyDto,
  ): Promise<FamilyDto> {
    return this.familiesService.create(user.id, dto);
  }

  /**
   * GET /families/me
   * Retorna a família do usuário autenticado, com os membros.
   */
  @Get('me')
  async getMyFamily(@CurrentUser() user: User): Promise<FamilyDto> {
    return this.familiesService.getMyFamily(user.id);
  }

  /**
   * POST /families/join
   *
   * O usuário autenticado entra na família de outra pessoa, informando o e-mail
   * dela. É o caminho que faltava: sem ele, dois usuários cadastrados
   * separadamente — cada um sozinho na própria família automática — nunca
   * conseguiam formar uma casa só.
   *
   * Rota estática: precisa vir antes de `:familyId`.
   */
  @Post('join')
  @HttpCode(HttpStatus.OK)
  async join(
    @CurrentUser() user: User,
    @Body() dto: AddFamilyMemberDto,
  ): Promise<FamilyDto> {
    return this.familiesService.joinFamilyOf(user.id, dto.email);
  }

  /**
   * GET /families/:familyId
   */
  @Get(':familyId')
  async getById(
    @CurrentUser() user: User,
    @Param('familyId') familyId: string,
  ): Promise<FamilyDto> {
    return this.familiesService.getById(familyId, user.id);
  }

  /**
   * PATCH /families/:familyId
   */
  @Patch(':familyId')
  async update(
    @CurrentUser() user: User,
    @Param('familyId') familyId: string,
    @Body() dto: UpdateFamilyDto,
  ): Promise<FamilyDto> {
    return this.familiesService.update(familyId, user.id, dto);
  }

  /**
   * GET /families/:familyId/members
   */
  @Get(':familyId/members')
  async listMembers(
    @CurrentUser() user: User,
    @Param('familyId') familyId: string,
  ): Promise<FamilyMemberDto[]> {
    return this.familiesService.listMembers(familyId, user.id);
  }

  /**
   * POST /families/:familyId/members
   * Adiciona um usuário já cadastrado à família, pelo e-mail.
   */
  @Post(':familyId/members')
  @HttpCode(HttpStatus.CREATED)
  async addMember(
    @CurrentUser() user: User,
    @Param('familyId') familyId: string,
    @Body() dto: AddFamilyMemberDto,
  ): Promise<FamilyMemberDto> {
    return this.familiesService.addMember(familyId, user.id, dto.email);
  }

  /**
   * DELETE /families/:familyId/members/:memberId
   */
  @Delete(':familyId/members/:memberId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMember(
    @CurrentUser() user: User,
    @Param('familyId') familyId: string,
    @Param('memberId') memberId: string,
  ): Promise<void> {
    return this.familiesService.removeMember(familyId, user.id, memberId);
  }
}
