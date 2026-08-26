import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Family } from './entities/family.entity';
import { User } from '../users/entities/user.entity';
import { FamiliesService } from './families.service';
import { FamiliesController } from './families.controller';

/**
 * Módulo de famílias.
 *
 * Registra `User` no `forFeature` porque a associação usuário↔família mora na
 * coluna `users.family_id` — é o repositório de usuários que resolve os membros.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Family, User])],
  providers: [FamiliesService],
  controllers: [FamiliesController],
  exports: [FamiliesService, TypeOrmModule],
})
export class FamiliesModule {}
