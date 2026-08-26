import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  JoinColumn,
} from 'typeorm';
import { Family } from '../../families/entities/family.entity';

export enum ForecastType {
  TOTAL = 'TOTAL',
  BY_CATEGORY = 'BY_CATEGORY',
  BY_USER = 'BY_USER',
  BALANCE = 'BALANCE',
}

export enum ForecastPeriod {
  NEXT_30_DAYS = '30_DAYS',
  NEXT_90_DAYS = '90_DAYS',
  NEXT_180_DAYS = '180_DAYS',
  NEXT_365_DAYS = '365_DAYS',
}

export enum ForecastModel {
  PROPHET = 'PROPHET',
  ARIMA = 'ARIMA',
  LINEAR = 'LINEAR',
  ENSEMBLE = 'ENSEMBLE',
}

@Entity('ai_forecasts')
@Index('idx_ai_forecasts_family_type_period', ['family', 'forecastType', 'period'])
@Index('idx_ai_forecasts_model', ['modelUsed'])
@Index('idx_ai_forecasts_created', ['createdAt'])
export class Forecast {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'family_id', type: 'uuid' })
  familyId: string;

  @ManyToOne(() => Family, (family) => family.id)
  @JoinColumn({ name: 'family_id' })
  family: Family;

  @Column({ name: 'forecast_type', type: 'varchar', length: 50 })
  forecastType: ForecastType;

  @Column('varchar', { length: 50 })
  period: ForecastPeriod;

  /**
   * Se forecast é por categoria
   */
  @Column({ name: 'category_id', type: 'uuid', nullable: true })
  categoryId: string | null;

  /**
   * Se forecast é por usuário
   */
  @Column({ name: 'target_user_id', type: 'uuid', nullable: true })
  targetUserId: string | null;

  /**
   * Predições com intervalo de confiança
   * [{
   *   date: Date,
   *   predictedValue: number,
   *   lowerBound: number,
   *   upperBound: number,
   *   confidence: number
   * }]
   */
  @Column('jsonb')
  predictions: any[];

  /**
   * Resumo das predições
   * {
   *   averagePredicted: number,
   *   minPredicted: number,
   *   maxPredicted: number,
   *   trend: 'UP' | 'DOWN' | 'STABLE',
   *   accuracy: number
   * }
   */
  @Column('jsonb')
  summary: Record<string, any>;

  /**
   * Cenários (best, expected, worst)
   * {
   *   bestCase: number,
   *   expectedCase: number,
   *   worstCase: number
   * }
   */
  @Column('jsonb', { nullable: true })
  scenarios: Record<string, number> | null;

  /**
   * Modelo utilizado para a previsão
   */
  @Column({ name: 'model_used', type: 'varchar', length: 50 })
  modelUsed: ForecastModel;

  /**
   * Acurácia do modelo (0-100)
   */
  @Column('decimal', { precision: 5, scale: 2, nullable: true })
  accuracy: number | null;

  /**
   * Metadados adicionais (parâmetros do modelo, etc)
   */
  @Column('jsonb', { default: '{}' })
  metadata: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
