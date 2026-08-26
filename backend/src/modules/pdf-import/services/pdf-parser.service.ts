import { Injectable, BadRequestException } from '@nestjs/common';
import * as path from 'path';

// O build `legacy` do pdfjs-dist é o CommonJS, compatível com o runtime do Nest.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');

// Fontes padrão embutidas no pacote. Sem apontar este caminho o pdfjs tenta
// buscá-las por HTTP e polui o log com avisos a cada PDF processado.
const STANDARD_FONT_DATA_URL =
  path.join(
    path.dirname(require.resolve('pdfjs-dist/package.json')),
    'standard_fonts',
  ) + path.sep;

interface ExtractedTransaction {
  date: string;
  description: string;
  establishment?: string;
  amount: number;
  type: 'debit' | 'credit';
  transactionId?: string;
  confidence: number;
}

@Injectable()
export class PdfParserService {
  /**
   * Lê o PDF e extrai os lançamentos.
   *
   * ATENÇÃO — correção central deste módulo: antes o parser fazia
   * `fileContent.toString('utf-8')` direto sobre os BYTES do PDF. O texto de um
   * PDF vive dentro de streams comprimidas (FlateDecode), então o resultado era
   * binário e nenhuma regex casava: todo upload gravava `transactionCount: 0`
   * e `extractedData: []` respondendo 201, ou seja, falhava em silêncio.
   *
   * Agora o texto é realmente extraído com o pdfjs-dist antes de qualquer
   * tentativa de casamento de padrões.
   */
  async parseTransactions(
    fileContent: Buffer,
    fileName: string,
  ): Promise<{
    type: 'bank_statement' | 'credit_card_invoice' | 'unknown';
    bankName?: string;
    cardName?: string;
    transactions: ExtractedTransaction[];
    confidence: number;
  }> {
    const text = await this.extractText(fileContent);

    const documentType = this.detectDocumentType(text, fileName);
    const transactions = this.extractTransactions(text);

    return {
      type: documentType.type,
      bankName: documentType.bankName,
      cardName: documentType.cardName,
      transactions,
      confidence: transactions.length > 0 ? 0.8 : 0.1,
    };
  }

  /**
   * Converte o PDF em texto, preservando a quebra de linhas.
   *
   * O pdfjs devolve fragmentos soltos com a posição de cada um; a coordenada Y
   * (`transform[5]`) é usada para reagrupar os fragmentos em linhas, que é o
   * formato que o extrator de lançamentos espera.
   */
  private async extractText(fileContent: Buffer): Promise<string> {
    try {
      const doc = await pdfjs.getDocument({
        data: new Uint8Array(fileContent),
        standardFontDataUrl: STANDARD_FONT_DATA_URL,
        // Silencia os avisos do pdfjs para não poluir o log da API.
        verbosity: 0,
      }).promise;

      const pages: string[] = [];

      for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
        const page = await doc.getPage(pageNumber);
        const content = await page.getTextContent();

        const lines: string[] = [];
        let line = '';
        let lastY: number | null = null;

        for (const item of content.items as any[]) {
          const y = item.transform[5];

          // Mudou a altura => começou uma nova linha visual.
          if (lastY !== null && Math.abs(y - lastY) > 2) {
            lines.push(line);
            line = '';
          }

          line += item.str;
          lastY = y;
        }

        if (line) {
          lines.push(line);
        }

        pages.push(lines.join('\n'));
      }

      await doc.destroy();

      return pages.join('\n');
    } catch (error) {
      throw new BadRequestException(
        `Falha ao ler o PDF: ${error?.message ?? error}`,
      );
    }
  }

  /**
   * Detect document type from content
   */
  private detectDocumentType(
    content: string,
    fileName: string,
  ): {
    type: 'bank_statement' | 'credit_card_invoice' | 'unknown';
    bankName?: string;
    cardName?: string;
  } {
    const lowerContent = this.removeAccents(content).toLowerCase();
    const lowerFileName = this.removeAccents(fileName).toLowerCase();

    // A fatura é verificada primeiro: documentos de cartão costumam citar
    // "extrato" no corpo, o que classificava a fatura como extrato bancário.
    if (
      lowerContent.includes('fatura') ||
      lowerContent.includes('credit card') ||
      lowerContent.includes('cartao de credito') ||
      lowerFileName.includes('fatura')
    ) {
      return {
        type: 'credit_card_invoice',
        cardName: this.extractCardName(content),
      };
    }

    if (
      lowerContent.includes('extrato') ||
      lowerContent.includes('account statement') ||
      lowerFileName.includes('extrato')
    ) {
      return { type: 'bank_statement', bankName: this.extractBankName(content) };
    }

    return { type: 'unknown' };
  }

  /**
   * Extract bank name from content
   *
   * O padrão genérico anterior (`(?:banco\s+)?(\w+)`) casava com a primeira
   * palavra do arquivo e devolvia lixo (ex.: "PDF", vindo do cabeçalho
   * `%PDF-1.4` que era lido como se fosse texto).
   */
  private extractBankName(content: string): string | undefined {
    const normalized = this.removeAccents(content).toLowerCase();

    const knownBanks: Array<[string, string]> = [
      ['nubank', 'Nubank'],
      ['itau', 'Itaú'],
      ['bradesco', 'Bradesco'],
      ['santander', 'Santander'],
      ['banco do brasil', 'Banco do Brasil'],
      ['caixa', 'Caixa Econômica Federal'],
      ['banco inter', 'Banco Inter'],
      ['c6 bank', 'C6 Bank'],
      ['sicredi', 'Sicredi'],
    ];

    for (const [needle, label] of knownBanks) {
      if (normalized.includes(needle)) {
        return label;
      }
    }

    const explicit = content.match(/banco\s+([A-Za-zÀ-ÿ]{2,})/i);
    return explicit ? explicit[1] : undefined;
  }

  /**
   * Extract card name from content
   */
  private extractCardName(content: string): string | undefined {
    const normalized = this.removeAccents(content).toLowerCase();

    const knownCards: Array<[string, string]> = [
      ['nubank', 'Nubank'],
      ['itaucard', 'Itaucard'],
      ['bradesco', 'Bradesco'],
      ['santander', 'Santander'],
      ['mastercard', 'Mastercard'],
      ['visa', 'Visa'],
      ['elo', 'Elo'],
    ];

    for (const [needle, label] of knownCards) {
      if (normalized.includes(needle)) {
        return label;
      }
    }

    const explicit = content.match(/cart[aã]o\s+([A-Za-zÀ-ÿ]{2,})/i);
    return explicit ? explicit[1] : undefined;
  }

  /**
   * Extract transactions from PDF text.
   *
   * A versão anterior reutilizava duas regexes com flag `g` dentro de um laço
   * chamando `.test()`. Regexes globais guardam `lastIndex` entre chamadas, de
   * modo que linhas válidas eram puladas de forma alternada. Aqui cada linha é
   * analisada isoladamente por `parseTransactionLine`.
   */
  private extractTransactions(content: string): ExtractedTransaction[] {
    const transactions: ExtractedTransaction[] = [];
    let sequence = 0;

    for (const rawLine of content.split('\n')) {
      const line = rawLine.trim();
      if (!line) continue;

      const transaction = this.parseTransactionLine(line, sequence + 1);
      if (transaction) {
        sequence++;
        transactions.push(transaction);
      }
    }

    return transactions;
  }

  /**
   * Parse individual transaction line
   */
  private parseTransactionLine(
    line: string,
    sequence: number,
  ): ExtractedTransaction | null {
    const dateMatch = line.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (!dateMatch) return null;

    const [, day, month, rawYear] = dateMatch;
    const year = rawYear.length === 2 ? `20${rawYear}` : rawYear.padStart(4, '0');
    const date = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

    // O valor fica no fim da linha. Buscar a PRIMEIRA ocorrência numérica
    // (comportamento anterior) capturava o próprio dia da data — "05/08/2026"
    // virava R$ 5,00. Aqui a última ocorrência monetária é a escolhida.
    const amountPattern =
      /R\$\s*(-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+(?:[.,]\d{1,2})?)|(-?\d{1,3}(?:\.\d{3})*,\d{2})/g;

    const matches = [...line.matchAll(amountPattern)];
    if (matches.length === 0) return null;

    const chosen = matches[matches.length - 1];
    const amountStr = (chosen[1] ?? chosen[2] ?? '').trim();
    const amount = this.parseAmount(amountStr);

    if (amount === null || Number.isNaN(amount)) return null;

    // Descrição = o que está entre o fim da data e o início do valor.
    const descriptionStart = (dateMatch.index ?? 0) + dateMatch[0].length;
    const descriptionEnd = chosen.index ?? line.length;
    const description = line
      .slice(descriptionStart, descriptionEnd)
      .replace(/\s+/g, ' ')
      .trim();

    if (!description) return null;

    return {
      date,
      description: description.substring(0, 255),
      establishment: this.extractEstablishment(description),
      amount: Math.abs(amount),
      type: this.determineTransactionType(line, amount),
      transactionId: `extracted_${sequence}`,
      confidence: 0.7,
    };
  }

  /**
   * Estabelecimento = trecho inicial da descrição, sem códigos e numeração.
   */
  private extractEstablishment(description: string): string | undefined {
    const cleaned = description
      .replace(/\b(?:loja|lj|filial|cod|ref)\b.*$/i, '')
      .replace(/\s*\d[\d.\-\/]*\s*$/, '')
      .trim();

    return cleaned.length >= 3 ? cleaned.substring(0, 120) : undefined;
  }

  /**
   * Parse amount string to number
   * Handles formats like: 1.234,56 (BR) or 1,234.56 (US)
   */
  private parseAmount(amountStr: string): number | null {
    if (!amountStr) return null;

    // Formato brasileiro (1.234.567,89): o `.` é separador de milhar.
    // O código anterior usava `replace('.', '')`, que remove apenas o PRIMEIRO
    // ponto — "1.234.567,89" virava "1234.567.89" e o parse quebrava.
    if (amountStr.includes(',')) {
      const normalized = amountStr.replace(/\./g, '').replace(',', '.');
      const parsed = parseFloat(normalized);
      return Number.isNaN(parsed) ? null : parsed;
    }

    // Formato americano (1,234.56) ou número simples.
    const parsed = parseFloat(amountStr.replace(/,/g, ''));
    return Number.isNaN(parsed) ? null : parsed;
  }

  /**
   * Determine if transaction is debit or credit
   *
   * A comparação passou a ser feita sem acentos: extratos reais escrevem tanto
   * "DEPÓSITO" quanto "DEPOSITO", e só a forma acentuada era reconhecida.
   */
  private determineTransactionType(
    line: string,
    amount: number,
  ): 'debit' | 'credit' {
    const normalized = this.removeAccents(line).toLowerCase();

    const creditKeywords = [
      'deposito',
      'credito',
      'recebimento',
      'salario',
      'rendimento',
      'estorno',
      'reembolso',
      'transferencia recebida',
      'pix recebido',
    ];

    if (creditKeywords.some((keyword) => normalized.includes(keyword))) {
      return 'credit';
    }

    const debitKeywords = [
      'debito',
      'pagamento',
      'compra',
      'saque',
      'tarifa',
      'transferencia enviada',
      'pix enviado',
    ];

    if (debitKeywords.some((keyword) => normalized.includes(keyword))) {
      return 'debit';
    }

    // Valor negativo no extrato indica saída.
    return 'debit';
  }

  /**
   * Remove acentos para comparações de palavras-chave.
   */
  private removeAccents(value: string): string {
    return value.normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  /**
   * Validate extracted transactions
   */
  validateTransactions(transactions: ExtractedTransaction[]): {
    valid: ExtractedTransaction[];
    invalid: Array<{ transaction: ExtractedTransaction; reason: string }>;
  } {
    const valid: ExtractedTransaction[] = [];
    const invalid: Array<{ transaction: ExtractedTransaction; reason: string }> =
      [];

    for (const transaction of transactions) {
      const validation = this.validateTransaction(transaction);
      if (validation.isValid) {
        valid.push(transaction);
      } else {
        invalid.push({
          transaction,
          reason: validation.reason || 'Validation failed',
        });
      }
    }

    return { valid, invalid };
  }

  /**
   * Validate individual transaction
   */
  private validateTransaction(transaction: ExtractedTransaction): {
    isValid: boolean;
    reason?: string;
  } {
    // Check date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(transaction.date)) {
      return { isValid: false, reason: 'Invalid date format' };
    }

    // Check date is valid
    const dateObj = new Date(transaction.date);
    if (isNaN(dateObj.getTime())) {
      return { isValid: false, reason: 'Invalid date' };
    }

    // Check amount is positive
    if (transaction.amount <= 0) {
      return { isValid: false, reason: 'Amount must be positive' };
    }

    // Check description exists
    if (!transaction.description || transaction.description.trim().length === 0) {
      return { isValid: false, reason: 'Missing description' };
    }

    // Check amount is reasonable (not too large)
    if (transaction.amount > 999999999) {
      return { isValid: false, reason: 'Amount is unreasonably large' };
    }

    return { isValid: true };
  }
}
