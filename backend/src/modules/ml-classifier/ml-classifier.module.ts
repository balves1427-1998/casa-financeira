import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MLClassifierService } from './services/ml-classifier.service';
import { MLClassifierController } from './controllers/ml-classifier.controller';
import { MLFeedback } from './entities/ml-feedback.entity';
import { MLPattern } from './entities/ml-pattern.entity';
import { ClassificationRulesModule } from '../classification-rules/classification-rules.module';
import { ExpensesModule } from '../expenses/expenses.module';
import { CategoriesModule } from '../categories/categories.module';
import { Expense } from '../expenses/entities/expense.entity';
import { Category } from '../categories/entities/category.entity';

@Module({
  imports: [
    // MLClassifierService injeta os repositórios de Expense e Category diretamente,
    // portanto essas entidades precisam estar registradas no escopo deste módulo.
    TypeOrmModule.forFeature([MLFeedback, MLPattern, Expense, Category]),
    ClassificationRulesModule,
    ExpensesModule,
    CategoriesModule,
  ],
  providers: [MLClassifierService],
  controllers: [MLClassifierController],
  exports: [MLClassifierService],
})
export class MLClassifierModule {}
