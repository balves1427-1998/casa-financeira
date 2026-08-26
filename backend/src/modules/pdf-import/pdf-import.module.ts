import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PdfImport } from './entities/pdf-import.entity';
import { Expense } from '../expenses/entities/expense.entity';
import { PdfImportService } from './services/pdf-import.service';
import { PdfParserService } from './services/pdf-parser.service';
import { DuplicateDetectorService } from './services/duplicate-detector.service';
import { PdfImportController } from './pdf-import.controller';
import { ClassificationRulesModule } from '../classification-rules/classification-rules.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PdfImport, Expense]),
    ClassificationRulesModule,
  ],
  providers: [PdfImportService, PdfParserService, DuplicateDetectorService],
  controllers: [PdfImportController],
  exports: [PdfImportService],
})
export class PdfImportModule {}
