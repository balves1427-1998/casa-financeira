import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ForecastingController } from './controllers/forecasting.controller';
import { ForecastingService } from './services/forecasting.service';
import { Forecast } from './entities/forecast.entity';
import { Expense } from '../expenses/entities/expense.entity';
import { Income } from '../income/entities/income.entity';
import { PlannedAccount } from '../planned-accounts/entities/planned-account.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Forecast,
      Expense,
      Income,
      PlannedAccount,
    ]),
  ],
  controllers: [ForecastingController],
  providers: [ForecastingService],
  exports: [ForecastingService],
})
export class ForecastingModule {}
