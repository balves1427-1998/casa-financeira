import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Query,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { CurrentFamily } from '../../../common/decorators/current-family.decorator';
import { User } from '../../users/entities/user.entity';
import { AiAssistantService } from '../services/ai-assistant.service';
import {
  SendChatMessageDto,
  ChatMessageResponseDto,
  ListChatHistoryDto,
  ChatSuggestionsDto,
} from '../dtos/ai-assistant.dto';

/**
 * Controller para o AI Assistant (Chat)
 * Endpoints para conversa com IA sobre finanças
 *
 * Funcionalidades:
 * - Chat interativo com IA
 * - Histórico de mensagens
 * - Sugestões de perguntas
 */
@Controller('ai/chat')
@UseGuards(JwtAuthGuard)
export class AiAssistantController {
  constructor(private aiAssistantService: AiAssistantService) {}

  /**
   * POST /ai/chat
   * Enviar mensagem para o AI Assistant
   *
   * Exemplo:
   * POST /api/v1/families/123/ai/chat
   * {
   *   "question": "Quanto gastei com alimentação este mês?"
   * }
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  async sendMessage(
    @CurrentUser() user: User,
    @CurrentFamily() familyId: string,
    @Body() dto: SendChatMessageDto,
  ): Promise<ChatMessageResponseDto> {
    return this.aiAssistantService.processUserQuestion(
      user.id,
      familyId,
      dto,
    );
  }

  /**
   * GET /ai/chat/history
   * Obter histórico de mensagens
   *
   * Query params:
   * - limit: número de mensagens (default: 50, max: 100)
   * - offset: paginação (default: 0)
   */
  @Get('history')
  async getChatHistory(
    @CurrentUser() user: User,
    @CurrentFamily() familyId: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ): Promise<ListChatHistoryDto> {
    return this.aiAssistantService.getChatHistory(user.id, familyId, {
      limit: Math.min(limit, 100),
      offset,
    });
  }

  /**
   * GET /ai/chat/suggestions
   * Obter sugestões de perguntas baseadas no contexto atual
   */
  @Get('suggestions')
  async getSuggestions(
    @CurrentUser() user: User,
    @CurrentFamily() familyId: string,
  ): Promise<ChatSuggestionsDto> {
    return this.aiAssistantService.getSuggestions(user.id, familyId);
  }

  /**
   * DELETE /ai/chat/history/:messageId
   * Deletar uma mensagem do histórico
   */
  @Delete('history/:messageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteMessage(
    @CurrentUser() user: User,
    @CurrentFamily() familyId: string,
    @Param('messageId') messageId: string,
  ): Promise<void> {
    return this.aiAssistantService.deleteMessage(
      user.id,
      familyId,
      messageId,
    );
  }

  /**
   * POST /ai/chat/clear-history
   * Limpar todo o histórico de chat
   */
  @Post('clear-history')
  @HttpCode(HttpStatus.NO_CONTENT)
  async clearHistory(
    @CurrentUser() user: User,
    @CurrentFamily() familyId: string,
  ): Promise<void> {
    return this.aiAssistantService.clearChatHistory(user.id, familyId);
  }
}
