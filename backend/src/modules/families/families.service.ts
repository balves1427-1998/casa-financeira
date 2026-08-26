import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Family } from './entities/family.entity';
import { User } from '../users/entities/user.entity';
import {
  CreateFamilyDto,
  UpdateFamilyDto,
  FamilyDto,
  FamilyMemberDto,
} from './dtos/family.dto';

/**
 * Service de gestão de famílias.
 *
 * A família é a unidade de escopo de todo o sistema financeiro: despesas e
 * receitas pertencem a usuários, e usuários pertencem a uma família. Todos os
 * agregados (dashboard, previsões, análises) somam os lançamentos de todos os
 * membros da mesma família.
 */
@Injectable()
export class FamiliesService {
  private readonly logger = new Logger(FamiliesService.name);

  constructor(
    @InjectRepository(Family)
    private familyRepository: Repository<Family>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  /**
   * Cria uma família e associa o usuário criador a ela.
   *
   * Um usuário pertence a no máximo uma família; se já pertencer a alguma,
   * precisa sair antes de criar outra.
   */
  async create(userId: string, dto: CreateFamilyDto): Promise<FamilyDto> {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    if (user.familyId) {
      throw new BadRequestException(
        'Você já pertence a uma família. Saia dela antes de criar outra.',
      );
    }

    const family = await this.familyRepository.save(
      this.familyRepository.create({
        name: dto.name,
        description: dto.description,
        isActive: true,
      }),
    );

    user.familyId = family.id;
    await this.userRepository.save(user);

    this.logger.log(`Família ${family.id} criada por ${userId}`);

    return this.toDto(family, [user]);
  }

  /**
   * Cria a família padrão de um usuário recém-registrado.
   *
   * Chamado pelo fluxo de cadastro para que ninguém fique sem escopo — sem
   * família, os endpoints de inteligência financeira respondem 403.
   */
  async createDefaultForUser(user: User): Promise<Family> {
    const family = await this.familyRepository.save(
      this.familyRepository.create({
        name: `Casa de ${user.name.split(' ')[0]}`,
        description: 'Família criada automaticamente no cadastro',
        isActive: true,
      }),
    );

    await this.userRepository.update(user.id, { familyId: family.id });

    this.logger.log(
      `Família padrão ${family.id} criada para o usuário ${user.id}`,
    );

    return family;
  }

  /**
   * Retorna a família do usuário autenticado, com os membros.
   */
  async getMyFamily(userId: string): Promise<FamilyDto> {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user?.familyId) {
      throw new NotFoundException(
        'Você ainda não pertence a nenhuma família. Crie uma para começar.',
      );
    }

    return this.getById(user.familyId, userId);
  }

  /**
   * Retorna uma família pelo id, garantindo que o solicitante é membro dela.
   */
  async getById(familyId: string, requesterId: string): Promise<FamilyDto> {
    const family = await this.familyRepository.findOne({
      where: { id: familyId },
    });

    if (!family) {
      throw new NotFoundException('Família não encontrada');
    }

    const members = await this.listMemberEntities(familyId);

    this.assertIsMember(members, requesterId);

    return this.toDto(family, members);
  }

  async update(
    familyId: string,
    requesterId: string,
    dto: UpdateFamilyDto,
  ): Promise<FamilyDto> {
    const family = await this.familyRepository.findOne({
      where: { id: familyId },
    });

    if (!family) {
      throw new NotFoundException('Família não encontrada');
    }

    const members = await this.listMemberEntities(familyId);
    this.assertIsMember(members, requesterId);

    Object.assign(family, dto);
    const saved = await this.familyRepository.save(family);

    return this.toDto(saved, members);
  }

  /**
   * Lista os membros da família.
   */
  async listMembers(
    familyId: string,
    requesterId: string,
  ): Promise<FamilyMemberDto[]> {
    const members = await this.listMemberEntities(familyId);
    this.assertIsMember(members, requesterId);

    return members.map((m) => this.toMemberDto(m));
  }

  /**
   * Adiciona um usuário já cadastrado à família, pelo e-mail.
   */
  async addMember(
    familyId: string,
    requesterId: string,
    email: string,
  ): Promise<FamilyMemberDto> {
    const members = await this.listMemberEntities(familyId);
    this.assertIsMember(members, requesterId);

    const invited = await this.userRepository.findOne({ where: { email } });

    if (!invited) {
      throw new NotFoundException(
        `Nenhum usuário cadastrado com o e-mail ${email}`,
      );
    }

    if (invited.familyId === familyId) {
      throw new BadRequestException('Esse usuário já é membro desta família');
    }

    if (invited.familyId) {
      throw new BadRequestException(
        'Esse usuário já pertence a outra família. Ele precisa sair dela antes.',
      );
    }

    invited.familyId = familyId;
    await this.userRepository.save(invited);

    this.logger.log(`Usuário ${invited.id} adicionado à família ${familyId}`);

    return this.toMemberDto(invited);
  }

  /**
   * Remove um membro da família.
   *
   * O último membro não pode sair: isso deixaria os lançamentos da família
   * órfãos, sem ninguém com permissão para consultá-los.
   */
  async removeMember(
    familyId: string,
    requesterId: string,
    memberId: string,
  ): Promise<void> {
    const members = await this.listMemberEntities(familyId);
    this.assertIsMember(members, requesterId);

    const target = members.find((m) => m.id === memberId);

    if (!target) {
      throw new NotFoundException('Esse usuário não é membro desta família');
    }

    if (members.length === 1) {
      throw new BadRequestException(
        'Não é possível remover o último membro da família.',
      );
    }

    target.familyId = undefined;
    await this.userRepository.save(target);

    this.logger.log(`Usuário ${memberId} removido da família ${familyId}`);
  }

  /**
   * Ids de todos os usuários da família.
   *
   * É o ponto de entrada usado pela camada de dados financeiros para agregar
   * despesas e receitas de todos os membros.
   */
  async getMemberIds(familyId: string): Promise<string[]> {
    const members = await this.listMemberEntities(familyId);
    return members.map((m) => m.id);
  }

  // ==================== helpers ====================

  private async listMemberEntities(familyId: string): Promise<User[]> {
    return this.userRepository.find({
      where: { familyId },
      order: { createdAt: 'ASC' },
    });
  }

  private assertIsMember(members: User[], requesterId: string): void {
    if (!members.some((m) => m.id === requesterId)) {
      throw new ForbiddenException('Você não é membro desta família');
    }
  }

  private toMemberDto(user: User): FamilyMemberDto {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };
  }

  private toDto(family: Family, members: User[]): FamilyDto {
    return {
      id: family.id,
      name: family.name,
      description: family.description,
      isActive: family.isActive,
      members: members.map((m) => this.toMemberDto(m)),
      memberCount: members.length,
      createdAt: family.createdAt,
    };
  }
}
