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
  /** Preenchidos quando a linha traz "Parcela 2/3". */
  installmentCurrent?: number;
  installmentTotal?: number;
}

/** Mês por extenso abreviado, como as faturas brasileiras escrevem. */
const MESES: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
  jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

/**
 * Linhas que TÊM data e valor mas não são lançamentos.
 *
 * Sem isto, o resumo da fatura entra como se fosse compra: a linha
 * "Total de compras de todos os cartões, 07 JUL a 07 AGO   R$ 2.996,09"
 * viraria uma despesa de R$ 2.996,09 — somada a cada uma das compras que ela
 * resume. O erro dobraria a fatura inteira.
 */
const LINHAS_DE_RESUMO: RegExp[] = [
  /total de compras/i,
  /total a pagar/i,
  /pagamento recebido/i,
  /pagamento m[íi]nimo/i,
  /\bpagamento em\b/i,
  /saldo restante da fatura/i,
  /saldo em aberto/i,
  /fatura anterior/i,
  /fechamento da pr[óo]xima fatura/i,
  /per[íi]odo vigente/i,
  /^transa[çc][õo]es\b/i,
  /^limite\b/i,
  /valor m[áa]ximo/i,
  /data de vencimento/i,
  /^fatura\b/i,
  /juros totais/i,
  /valor da parcela/i,
  /valor de entrada/i,
];

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
    const referencia = this.detectarCompetencia(content);
    const linhas = content.split('\n').map((l) => l.trim());
    let sequence = 0;

    for (let i = 0; i < linhas.length; i++) {
      const line = linhas[i];
      if (!line) continue;
      if (LINHAS_DE_RESUMO.some((padrao) => padrao.test(line))) continue;

      // Compra com detalhamento (câmbio, IOF, juros) não cabe numa linha só: a
      // fatura quebra o bloco e joga o VALOR algumas linhas abaixo, sozinho.
      // Sem juntar os dois, a compra internacional de R$ 112,76 e o Pix
      // parcelado de R$ 1.099,96 desta fatura seriam perdidos em silêncio.
      const alvo = this.temValor(line)
        ? line
        : this.juntarComValorAdiante(linhas, i, referencia);

      if (!alvo) continue;

      const transaction = this.parseTransactionLine(
        alvo,
        sequence + 1,
        referencia,
      );
      if (transaction) {
        sequence++;
        transactions.push(transaction);
      }
    }

    return transactions;
  }

  /** A linha traz algum valor monetário? */
  private temValor(line: string): boolean {
    return /R\$\s*-?\d|\d{1,3}(?:\.\d{3})*,\d{2}/.test(line);
  }

  /**
   * Para uma linha com data mas sem valor, procura o valor solto logo abaixo.
   *
   * Só aceita uma linha que seja EXCLUSIVAMENTE um valor — as linhas de
   * detalhe no meio ("Total a pagar: R$ 16,40 (valor da transação de
   * R$ 15,00 + ...)") citam vários números e pegar qualquer um deles daria a
   * quantia errada. E para na próxima linha com data, para nunca roubar o
   * valor do lançamento seguinte.
   */
  private juntarComValorAdiante(
    linhas: string[],
    inicio: number,
    referencia: { mes: number; ano: number } | null,
  ): string | null {
    if (!this.resolverData(linhas[inicio].replace(/[−‒–—]/g, '-'), referencia)) {
      return null;
    }

    const limite = Math.min(inicio + 5, linhas.length);
    for (let j = inicio + 1; j < limite; j++) {
      const candidata = linhas[j];
      if (!candidata) continue;

      if (this.resolverData(candidata.replace(/[−‒–—]/g, '-'), referencia)) {
        return null;
      }

      if (/^-?\s*R\$\s*-?\d{1,3}(?:\.\d{3})*,\d{2}$/.test(candidata)) {
        return `${linhas[inicio]} ${candidata}`;
      }
    }

    return null;
  }

  /**
   * Descobre a que ano/mês a fatura se refere.
   *
   * Faturas de cartão escrevem o dia dos lançamentos SEM ano — "07 JUL", não
   * "07/07/2026". O ano só aparece no cabeçalho ("FATURA 14 AGO 2026"). Sem
   * essa âncora não há como datar nenhuma compra, que era exatamente o motivo
   * de uma fatura real do Nubank ser lida com ZERO lançamentos.
   *
   * Usa a PRIMEIRA data completa do documento: nas faturas ela é o vencimento,
   * no cabeçalho. As datas que aparecem depois costumam ser do ciclo seguinte
   * ("Fechamento da próxima fatura 07 SET 2026") e apontariam para o mês errado.
   */
  private detectarCompetencia(
    content: string,
  ): { mes: number; ano: number } | null {
    const completa = content.match(
      /\b(\d{1,2})\s+(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\w*\s+(20\d{2})\b/i,
    );

    if (completa) {
      return { mes: MESES[completa[2].toLowerCase()], ano: Number(completa[3]) };
    }

    const numerica = content.match(/\b\d{1,2}\/(\d{1,2})\/(20\d{2})\b/);
    if (numerica) {
      return { mes: Number(numerica[1]), ano: Number(numerica[2]) };
    }

    const soAno = content.match(/\b(20\d{2})\b/);
    return soAno ? { mes: 12, ano: Number(soAno[1]) } : null;
  }

  /**
   * Resolve a data de uma linha, com ou sem ano explícito.
   */
  private resolverData(
    line: string,
    referencia: { mes: number; ano: number } | null,
  ): { date: string; fim: number } | null {
    // 1. Data numérica completa: 05/08/2026 ou 05-08-26.
    const numerica = line.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
    if (numerica) {
      const [, dia, mes, anoBruto] = numerica;
      const ano =
        anoBruto.length === 2 ? `20${anoBruto}` : anoBruto.padStart(4, '0');
      return {
        date: `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`,
        fim: (numerica.index ?? 0) + numerica[0].length,
      };
    }

    // 2. Mês por extenso: "07 JUL" ou "14 AGO 2026".
    const extenso = line.match(
      /\b(\d{1,2})\s+(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\w*\b(?:\s+(20\d{2}))?/i,
    );
    if (extenso) {
      const dia = Number(extenso[1]);
      const mes = MESES[extenso[2].toLowerCase()];
      let ano = extenso[3] ? Number(extenso[3]) : referencia?.ano;

      if (ano === undefined) return null;

      // Ciclo que atravessa o réveillon: numa fatura de JANEIRO, um lançamento
      // de DEZEMBRO é do ano anterior. Sem isto a compra vai parar 12 meses no
      // futuro e some de qualquer relatório.
      if (!extenso[3] && referencia && mes > referencia.mes) {
        ano -= 1;
      }

      if (dia < 1 || dia > 31) return null;

      return {
        date: `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`,
        fim: (extenso.index ?? 0) + extenso[0].length,
      };
    }

    return null;
  }

  /**
   * Parse individual transaction line
   */
  private parseTransactionLine(
    line: string,
    sequence: number,
    referencia: { mes: number; ano: number } | null = null,
  ): ExtractedTransaction | null {
    // Faturas usam o sinal de menos tipográfico (U+2212) em estornos:
    // "−R$ 3,95". Sem normalizar, o estorno entra como despesa.
    const normalizada = line.replace(/[−‒–—]/g, '-');

    const data = this.resolverData(normalizada, referencia);
    if (!data) return null;

    // O valor fica no fim da linha. Buscar a PRIMEIRA ocorrência numérica
    // (comportamento anterior) capturava o próprio dia da data — "05/08/2026"
    // virava R$ 5,00. Aqui a última ocorrência monetária é a escolhida.
    // O sinal pode vir ANTES do "R$", por isso ele é capturado à parte.
    const amountPattern =
      /(-)?\s*R\$\s*(-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+(?:[.,]\d{1,2})?)|(-?\d{1,3}(?:\.\d{3})*,\d{2})/g;

    const matches = [...normalizada.matchAll(amountPattern)];
    if (matches.length === 0) return null;

    const chosen = matches[matches.length - 1];
    const amountStr = (chosen[2] ?? chosen[3] ?? '').trim();
    const parsed = this.parseAmount(amountStr);

    if (parsed === null || Number.isNaN(parsed)) return null;

    const amount = chosen[1] === '-' ? -Math.abs(parsed) : parsed;

    // Lançamento de R$ 0,00 não é lançamento: as faturas usam essa linha para
    // dizer que não sobrou saldo do ciclo anterior.
    if (amount === 0) return null;

    // Descrição = o que está entre o fim da data e o início do valor.
    const descriptionEnd = chosen.index ?? normalizada.length;
    const description = normalizada
      .slice(data.fim, descriptionEnd)
      // Máscara do cartão usado ("•••• 8424") não é parte do estabelecimento.
      .replace(/[•●*·]{2,}\s*\d{4}/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!description) return null;

    const parcela = description.match(/parcela\s+(\d+)\s*\/\s*(\d+)/i);

    return {
      date: data.date,
      description: description.substring(0, 255),
      establishment: this.extractEstablishment(description),
      amount: Math.abs(amount),
      type: this.determineTransactionType(normalizada, amount),
      transactionId: `extracted_${sequence}`,
      confidence: 0.7,
      ...(parcela && {
        installmentCurrent: Number(parcela[1]),
        installmentTotal: Number(parcela[2]),
      }),
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
    // O sinal é a evidência mais forte que existe e vem do próprio documento:
    // numa fatura, valor negativo é estorno ou devolução, nunca compra.
    if (amount < 0) return 'credit';

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
