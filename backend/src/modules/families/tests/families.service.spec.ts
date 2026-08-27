import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FamiliesService } from '../families.service';
import { Family } from '../entities/family.entity';
import { User } from '../../users/entities/user.entity';

/**
 * Testes do FamiliesService — a fusão de duas contas criadas separadamente.
 *
 * O cenário que motivou estes testes: o cadastro cria uma família automática
 * para cada novo usuário, então um casal que se cadastrou em momentos
 * diferentes fica com cada um sozinho na própria família. As regras antigas se
 * travavam mutuamente — `addMember` recusava quem já tinha família, e
 * `removeMember` recusava a saída do último membro — de modo que formar uma
 * casa pela interface era impossível.
 *
 * A correção reconhece que uma família com um único membro não guarda nada:
 * despesas, receitas, metas e planejados pertencem ao `userId`. Estes testes
 * fixam esse comportamento e, ao mesmo tempo, garantem que uma casa com dois ou
 * mais membros continua protegida.
 */
describe('FamiliesService', () => {
  let service: FamiliesService;

  const FAMILIA_BRUNO = 'familia-bruno';
  const FAMILIA_GIOVANNA = 'familia-giovanna';

  const bruno = () =>
    ({
      id: 'user-bruno',
      name: 'Bruno',
      email: 'bruno@casa.com',
      role: 'user',
      familyId: FAMILIA_BRUNO,
    }) as User;

  const giovanna = () =>
    ({
      id: 'user-giovanna',
      name: 'Giovanna',
      email: 'giovanna@casa.com',
      role: 'user',
      familyId: FAMILIA_GIOVANNA,
    }) as User;

  const mockFamilyRepository = {
    findOne: jest.fn(),
    create: jest.fn((dados: any) => dados),
    save: jest.fn(async (dados: any) => ({ id: 'familia-nova', ...dados })),
    update: jest.fn(),
  };

  const mockUserRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(async (dados: any) => dados),
    update: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FamiliesService,
        { provide: getRepositoryToken(Family), useValue: mockFamilyRepository },
        { provide: getRepositoryToken(User), useValue: mockUserRepository },
      ],
    }).compile();

    service = module.get<FamiliesService>(FamiliesService);
  });

  describe('addMember — juntar duas casas de uma pessoa só', () => {
    it('aceita quem está sozinho na própria família e desativa a que esvaziou', async () => {
      const convidado = bruno();

      mockUserRepository.find
        // membros da família da Giovanna (quem convida)
        .mockResolvedValueOnce([giovanna()])
        // membros da família do Bruno (a que ele deixa) — só ele
        .mockResolvedValueOnce([convidado])
        // conferência final: a família do Bruno ficou vazia
        .mockResolvedValueOnce([]);

      mockUserRepository.findOne.mockResolvedValue(convidado);

      const membro = await service.addMember(
        FAMILIA_GIOVANNA,
        giovanna().id,
        convidado.email,
      );

      expect(membro.email).toBe(convidado.email);
      expect(convidado.familyId).toBe(FAMILIA_GIOVANNA);
      expect(mockFamilyRepository.update).toHaveBeenCalledWith(FAMILIA_BRUNO, {
        isActive: false,
      });
    });

    it('recusa quem já pertence a uma casa com outras pessoas', async () => {
      const convidado = bruno();

      mockUserRepository.find
        .mockResolvedValueOnce([giovanna()])
        // a família do Bruno tem mais gente: mudá-lo afetaria terceiros
        .mockResolvedValueOnce([convidado, { id: 'user-outro' } as User]);

      mockUserRepository.findOne.mockResolvedValue(convidado);

      await expect(
        service.addMember(FAMILIA_GIOVANNA, giovanna().id, convidado.email),
      ).rejects.toThrow(BadRequestException);

      expect(mockUserRepository.save).not.toHaveBeenCalled();
    });

    it('recusa e-mail sem cadastro', async () => {
      mockUserRepository.find.mockResolvedValueOnce([giovanna()]);
      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(
        service.addMember(FAMILIA_GIOVANNA, giovanna().id, 'ninguem@casa.com'),
      ).rejects.toThrow(NotFoundException);
    });

    it('recusa quem já é membro da mesma família', async () => {
      const jaMembro = { ...bruno(), familyId: FAMILIA_GIOVANNA } as User;

      mockUserRepository.find.mockResolvedValueOnce([giovanna(), jaMembro]);
      mockUserRepository.findOne.mockResolvedValue(jaMembro);

      await expect(
        service.addMember(FAMILIA_GIOVANNA, giovanna().id, jaMembro.email),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('removeMember — o último membro pode sair', () => {
    it('permite a saída do único membro e desativa a família', async () => {
      const sozinho = bruno();

      mockUserRepository.find
        .mockResolvedValueOnce([sozinho])
        .mockResolvedValueOnce([]);

      await service.removeMember(FAMILIA_BRUNO, sozinho.id, sozinho.id);

      expect(sozinho.familyId).toBeUndefined();
      expect(mockFamilyRepository.update).toHaveBeenCalledWith(FAMILIA_BRUNO, {
        isActive: false,
      });
    });

    it('não desativa a família quando ainda resta alguém', async () => {
      const sai = bruno();
      const fica = { ...giovanna(), familyId: FAMILIA_BRUNO } as User;

      mockUserRepository.find
        .mockResolvedValueOnce([sai, fica])
        .mockResolvedValueOnce([fica]);

      await service.removeMember(FAMILIA_BRUNO, fica.id, sai.id);

      expect(mockFamilyRepository.update).not.toHaveBeenCalled();
    });

    it('recusa remover quem não é membro', async () => {
      mockUserRepository.find.mockResolvedValueOnce([bruno()]);

      await expect(
        service.removeMember(FAMILIA_BRUNO, bruno().id, 'user-estranho'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('joinFamilyOf — entrar na casa da outra pessoa', () => {
    it('recusa o próprio e-mail', async () => {
      const eu = bruno();
      mockUserRepository.findOne
        .mockResolvedValueOnce(eu) // solicitante
        .mockResolvedValueOnce(eu); // "anfitrião" — o mesmo usuário

      await expect(service.joinFamilyOf(eu.id, eu.email)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('recusa quando o anfitrião ainda não tem família', async () => {
      const eu = bruno();
      const semFamilia = { ...giovanna(), familyId: undefined } as unknown as User;

      mockUserRepository.findOne
        .mockResolvedValueOnce(eu)
        .mockResolvedValueOnce(semFamilia);

      await expect(
        service.joinFamilyOf(eu.id, semFamilia.email),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
