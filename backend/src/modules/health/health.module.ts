import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

/**
 * Módulo de health check.
 *
 * Não declara providers: o `DataSource` já é global, injetado pelo
 * `TypeOrmModule.forRootAsync` do AppModule.
 */
@Module({
  controllers: [HealthController],
})
export class HealthModule {}
