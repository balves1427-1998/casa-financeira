import {
  IsString,
  IsNumber,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsUUID,
  IsArray,
  Min,
  Max,
  IsObject,
} from 'class-validator';
import {
  RecommendationType,
  RecommendationPriority,
  RecommendationPeriod,
} from '../entities/recommendation.entity';

// ==================== DTOs ====================

export class CreateRecommendationDto {
  @IsEnum(RecommendationType)
  type: RecommendationType;

  @IsString()
  title: string;

  @IsString()
  description: string;

  @IsOptional()
  @IsNumber()
  potentialSavings?: number;

  @IsOptional()
  @IsEnum(RecommendationPeriod)
  period?: RecommendationPeriod;

  @IsNumber()
  @Min(0)
  @Max(100)
  relevance: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  impact: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  ease: number;

  @IsOptional()
  @IsString()
  actionUrl?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class UpdateRecommendationDto {
  @IsOptional()
  @IsBoolean()
  isDismissed?: boolean;
}

export class RecommendationDto {
  @IsUUID()
  id: string;

  @IsUUID()
  userId: string;

  @IsUUID()
  familyId: string;

  @IsEnum(RecommendationType)
  type: RecommendationType;

  @IsString()
  title: string;

  @IsString()
  description: string;

  @IsOptional()
  @IsNumber()
  potentialSavings?: number;

  @IsEnum(RecommendationPeriod)
  period: RecommendationPeriod;

  @IsNumber()
  @Min(0)
  @Max(100)
  relevance: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  impact: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  ease: number;

  @IsEnum(RecommendationPriority)
  priority: RecommendationPriority;

  @IsOptional()
  @IsString()
  actionUrl?: string;

  @IsBoolean()
  isDismissed: boolean;

  @IsString()
  createdAt: Date;

  @IsString()
  updatedAt: Date;
}

export class ListRecommendationsDto {
  @IsArray()
  recommendations: RecommendationDto[];

  @IsNumber()
  total: number;

  @IsNumber()
  highPriorityCount: number;

  @IsNumber()
  mediumPriorityCount: number;

  @IsNumber()
  lowPriorityCount: number;
}

export class RecommendationImpactEstimateDto {
  @IsEnum(RecommendationType)
  type: RecommendationType;

  @IsNumber()
  totalPotentialSavings: number;

  @IsNumber()
  averageDifficulty: number;

  @IsNumber()
  percentageOfEasyActions: number;

  @IsArray()
  recommendations: RecommendationDto[];
}

export class ApplyRecommendationDto {
  @IsString()
  @IsOptional()
  notes?: string;
}

export class RecommendationActionResultDto {
  @IsBoolean()
  success: boolean;

  @IsString()
  message: string;

  @IsOptional()
  @IsString()
  redirectUrl?: string;
}
