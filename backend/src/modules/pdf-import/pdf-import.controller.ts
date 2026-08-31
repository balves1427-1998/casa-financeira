import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  Req,
  Query,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PdfImportService } from './services/pdf-import.service';
import {
  UploadPdfDto,
  ReviewPdfImportDto,
  ImportConfirmationDto,
  PdfImportStatusDto,
} from './dtos/create-pdf-import.dto';

@Controller('pdf-import')
@UseGuards(JwtAuthGuard)
export class PdfImportController {
  constructor(private readonly pdfImportService: PdfImportService) {}

  @Post('upload')
  async uploadPdf(@Req() req: any, @Body() dto: UploadPdfDto) {
    // Convert base64 to buffer
    const fileBuffer = Buffer.from(dto.fileContent, 'base64');
    return this.pdfImportService.uploadPdf(
      req.user,
      dto.fileName,
      fileBuffer,
      dto.creditCardId,
    );
  }

  /**
   * O valor padrão do parâmetro (`= 20`) não funcionava: com `transform: true`
   * e `enableImplicitConversion`, o ValidationPipe converte o query param
   * ausente para `Number(undefined)` = NaN — que nunca é `undefined` e portanto
   * não aciona o default. O NaN chegava ao TypeORM como `skip`/`take` e
   * derrubava a listagem com 500.
   */
  @Get()
  async getAllImports(
    @Req() req: any,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    return this.pdfImportService.getAllImports(req.user, limit, offset);
  }

  @Get('stats')
  async getImportStats(@Req() req: any) {
    return this.pdfImportService.getImportStats(req.user);
  }

  @Get(':id')
  async getImportStatus(@Param('id') id: string, @Req() req: any) {
    return this.pdfImportService.getImportStatus(id, req.user);
  }

  @Put(':id/review')
  async reviewImport(
    @Param('id') id: string,
    @Req() req: any,
    @Body() dto: ReviewPdfImportDto,
  ) {
    return this.pdfImportService.reviewImport(id, req.user, dto);
  }

  @Put(':id/confirm')
  async confirmImport(
    @Param('id') id: string,
    @Req() req: any,
    @Body() dto: ImportConfirmationDto,
  ) {
    return this.pdfImportService.confirmImport(id, req.user, dto.selectedTransactionIds);
  }

  @Put(':id/reject')
  async rejectImport(
    @Param('id') id: string,
    @Req() req: any,
    @Body() body: { reason?: string },
  ) {
    return this.pdfImportService.rejectImport(id, req.user, body.reason);
  }

  @Delete(':id')
  async deleteImport(@Param('id') id: string, @Req() req: any) {
    await this.pdfImportService.deleteImport(id, req.user);
    return { success: true };
  }
}
