import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CreditCard } from './entities/credit-card.entity';
import { CreditCardsService } from './credit-cards.service';
import { CreditCardsController } from './credit-cards.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CreditCard])],
  providers: [CreditCardsService],
  controllers: [CreditCardsController],
  exports: [CreditCardsService],
})
export class CreditCardsModule {}
