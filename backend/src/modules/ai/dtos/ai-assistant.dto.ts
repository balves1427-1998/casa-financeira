import { IsString, IsUUID, IsOptional, IsEnum, IsNumber, IsArray, Min, Max } from 'class-validator';

// ==================== ENUMS ====================

export enum IntentType {
  COMPARISON = 'COMPARISON',
  QUERY = 'QUERY',
  RECOMMENDATION = 'RECOMMENDATION',
  PREDICTION = 'PREDICTION',
  ACTION = 'ACTION',
}

export enum ChatPeriod {
  THIS_MONTH = 'THIS_MONTH',
  LAST_MONTH = 'LAST_MONTH',
  LAST_3_MONTHS = 'LAST_3_MONTHS',
  LAST_6_MONTHS = 'LAST_6_MONTHS',
  LAST_12_MONTHS = 'LAST_12_MONTHS',
  THIS_YEAR = 'THIS_YEAR',
  CUSTOM = 'CUSTOM',
}

export enum ChatUser {
  BRUNO = 'bruno',
  GIOVANNA = 'giovanna',
  BOTH = 'both',
}

// ==================== DTOs ====================

export class ChatContextDto {
  @IsOptional()
  @IsEnum(ChatPeriod)
  period?: ChatPeriod;

  @IsOptional()
  @IsEnum(ChatUser)
  focusUser?: ChatUser;

  @IsOptional()
  @IsString()
  categoryId?: string;
}

export class SendChatMessageDto {
  @IsString()
  question: string;

  @IsOptional()
  context?: ChatContextDto;

  @IsOptional()
  @IsArray()
  sources?: string[];
}

export class ChatMessageResponseDto {
  /**
   * `true` quando a "resposta" é, na verdade, uma PERGUNTA de volta.
   *
   * Acontece quando os dados não bastam para concluir nada — pedir o melhor dia
   * para uma compra sem dizer o valor, por exemplo. A tela usa isto para
   * destacar que ainda falta informação, em vez de apresentar o texto como
   * conclusão.
   */
  needsClarification?: boolean;
  @IsString()
  answer: string;

  @IsEnum(IntentType)
  intent: IntentType;

  @IsArray()
  sources: string[];

  @IsNumber()
  @Min(0)
  @Max(1)
  confidence: number;

  @IsArray()
  followUpQuestions: string[];

  @IsString()
  timestamp: Date;
}

export class ChatHistoryDto {
  @IsString()
  id: string;

  @IsString()
  question: string;

  @IsString()
  answer: string;

  @IsEnum(IntentType)
  intent: IntentType;

  @IsString()
  createdAt: Date;
}

export class ListChatHistoryDto {
  @IsArray()
  messages: ChatHistoryDto[];

  @IsNumber()
  total: number;

  @IsNumber()
  limit: number;

  @IsNumber()
  offset: number;
}

export class ChatSuggestionsDto {
  @IsArray()
  suggestions: string[];
}

export class GetChatContextDto {
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsEnum(ChatPeriod)
  period?: ChatPeriod;

  @IsOptional()
  @IsEnum(ChatUser)
  focusUser?: ChatUser;
}

export class DeleteChatMessageDto {
  @IsUUID()
  messageId: string;
}
