import { IsUUID, IsString, IsNumber, IsEnum, IsOptional, IsObject, Min, Max, MinLength } from 'class-validator';

export class CreateMLFeedbackDto {
  @IsString()
  @MinLength(3)
  description: string;

  @IsUUID()
  @IsOptional()
  expenseId?: string;

  @IsUUID()
  @IsOptional()
  suggestedCategoryId?: string;

  @IsUUID()
  correctCategoryId: string;

  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  originalConfidence?: number;

  @IsEnum(['correct', 'incorrect', 'partial'])
  @IsOptional()
  feedbackType?: 'correct' | 'incorrect' | 'partial';

  @IsString()
  @IsOptional()
  notes?: string;

  @IsObject()
  @IsOptional()
  metadata?: {
    source?: 'import' | 'manual' | 'ai_suggestion';
    establishmentHint?: string;
    timeToCorrect?: number;
    correctionReason?: string;
  };
}

export class GetMLFeedbackStatsDto {
  totalFeedback: number;
  correctCount: number;
  incorrectCount: number;
  partialCount: number;
  accuracyRate: number;
  mostCorrectedCategories: Array<{
    categoryId: string;
    categoryName: string;
    correctionCount: number;
    percentage: number;
  }>;
  recentFeedback: Array<{
    id: string;
    description: string;
    suggestedCategory: string;
    correctCategory: string;
    feedbackType: string;
    createdAt: Date;
  }>;
}

export class MLPredictionDto {
  categoryId: string;
  categoryName: string;
  confidence: number;
  reasons: string[];
  alternativeSuggestions: Array<{
    categoryId: string;
    categoryName: string;
    confidence: number;
  }>;
}
