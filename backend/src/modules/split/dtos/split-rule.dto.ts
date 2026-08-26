import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { SplitMode } from '../entities/split-rule.entity';

/**
 * Corpo de `PUT /split/rule`.
 *
 * A soma dos percentuais do modo `CUSTOM` NÃO é validada aqui: um decorator não
 * consegue produzir a mensagem de erro em português que informa a soma
 * encontrada. Essa checagem fica no `SplitService.setRule`, que é também o
 * caminho usado pelos testes.
 */
export class SetSplitRuleDto {
  @IsEnum(SplitMode, {
    message:
      'Modo de rateio inválido. Use EQUAL, INCOME_PROPORTIONAL ou CUSTOM.',
  })
  mode: SplitMode;

  /**
   * Percentuais por responsável, obrigatórios no modo `CUSTOM`.
   * Exemplo: `{ "bruno": 70, "giovanna": 30 }`.
   */
  @IsOptional()
  @IsObject({
    message:
      'customPercentages deve ser um objeto no formato { "bruno": 70, "giovanna": 30 }.',
  })
  customPercentages?: Record<string, number>;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
