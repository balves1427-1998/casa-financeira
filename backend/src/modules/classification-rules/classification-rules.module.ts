import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClassificationRule } from './entities/classification-rule.entity';
import { ClassificationRulesService } from './classification-rules.service';
import { ClassificationRulesController } from './classification-rules.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ClassificationRule])],
  providers: [ClassificationRulesService],
  controllers: [ClassificationRulesController],
  exports: [ClassificationRulesService],
})
export class ClassificationRulesModule {}
