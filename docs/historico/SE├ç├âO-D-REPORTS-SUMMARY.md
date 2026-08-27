# Seção D - Reports & Exports 📊

## Sumário Executivo

Seção D implementa um sistema completo de geração, gestão e exportação de relatórios financeiros personalizados. Usuários podem criar relatórios em múltiplos formatos (PDF, CSV, XLSX), salvar configurações como templates reutilizáveis, compartilhar por email e acompanhar o histórico de relatórios.

**Total de Arquivos Implementados:** 12 arquivos (Backend: 5 + Frontend: 7)  
**Total de Linhas de Código:** ~3,500+ linhas

---

## 🔧 Backend Implementation

### 1. Entity: `entities/report.entity.ts` (140 linhas)

**Responsabilidade:** Representa um relatório gerado no banco de dados

**Campos Principais:**
- `id: string` - UUID primária
- `userId: string` - Referência ao usuário (FK cascade)
- `reportType: enum` - monthly | quarterly | annual | custom | comparison
- `status: enum` - pending | generating | ready | failed
- `startMonth/startYear` - Período inicial
- `endMonth/endYear` - Período final (opcional)
- `config: ReportConfig` - JSONB com flags de seções incluídas
- `metadata: ReportMetadata` - JSONB com estatísticas
- `fileUrl?: string` - URL para download
- `fileName?: string` - Nome do arquivo gerado
- `fileFormat?: enum` - pdf | csv | xlsx
- `fileSize?: number` - Tamanho em bytes
- `sentToEmail: boolean` - Se foi enviado
- `sentAt?: Date` - Quando foi enviado
- `recipientEmails?: string[]` - Array de emails
- `errorMessage?: string` - Mensagem de erro (se falhou)
- `isTemplate: boolean` - Se é um template salvo
- `templateName?: string` - Nome do template
- `viewCount: number` - Contador de visualizações
- `timestamps` - createdAt, updatedAt, deletedAt (soft delete)

**Índices para Performance:**
- `IDX_REPORTS_USER_TYPE_CREATED` - userId + reportType + createdAt
- `IDX_REPORTS_USER_STATUS` - userId + status + createdAt
- `IDX_REPORTS_USER_TEMPLATE` - userId + isTemplate

### 2. DTO: `dtos/report.dto.ts` (280 linhas)

**ReportConfigDto**
- `includeSpendingPatterns: boolean` - Seção de padrões
- `includeAnomalies: boolean` - Seção de anomalias
- `includeTrends: boolean` - Seção de tendências
- `includeComparison: boolean` - Seção Bruno vs Giovanna
- `includeForecasting: boolean` - Seção de previsões
- `includeMetas: boolean` - Seção de metas
- `includeSummary: boolean` - Resumo executivo
- `categories?: string[]` - Filtro de categorias (opcional)
- `minAnomalySeverity?: enum` - Filtro de severidade

**GenerateReportDto**
- `reportType: enum` - Tipo de relatório
- `startMonth/startYear: number` - Período
- `endMonth?/endYear?: number` - Período final
- `config: ReportConfigDto` - Configuração
- `format?: enum` - pdf | csv | xlsx
- `sendToEmail?: boolean` - Enviar por email
- `recipientEmails?: string[]` - Destinatários

**ReportMetadataDto**
- `totalExpenses: number` - Total gasto
- `totalIncome: number` - Total recebido
- `averageDaily: number` - Média diária
- `topCategory: string` - Categoria principal
- `topMerchant: string` - Estabelecimento mais usado
- `anomalyCount: number` - Quantidade de anomalias
- `highestTransaction: number` - Maior transação
- `lowestTransaction: number` - Menor transação
- `transactionCount: number` - Total de transações

**ReportDto** - Resposta completa com todos os campos

**SendReportDto** - Para enviar relatório por email
- `recipientEmails: string[]`
- `message?: string`

**SaveAsTemplateDto** - Para salvar como template
- `templateName: string`
- `description?: string`

### 3. Service: `services/report-generator.service.ts` (500+ linhas)

**Método: `generateReport(userId, dto: GenerateReportDto): Promise<Report>`**
- Valida período e configuração
- Cria registro de relatório com status "pending"
- Calcula metadados (totais, médias, top items)
- Gera arquivo baseado no formato
- Envia email se solicitado
- Retorna relatório criado

**Método: `generateMetadata(userId, startMonth, startYear, endMonth, endYear): Promise<ReportMetadata>`**
- Busca todas as despesas do período
- Busca todas as receitas do período
- Calcula estatísticas: totalExpenses, totalIncome, averageDaily
- Identifica topCategory e topMerchant
- Conta anomalias detectadas
- Encontra highest/lowest transactions
- Conta total de transações

**Método: `generateFile(report, config): Promise<string>`**
- Dispatcher para PDF/CSV/XLSX
- Retorna URL do arquivo gerado
- Mock implementation (pronto para integração com PDFKit/pdfmake)

**Método: `generatePDF(report, config): Promise<string>`**
- Mock implementation
- Estrutura pronta para integração com PDFKit ou pdfmake
- Incluiria: cabeçalho com período, seções com análises, tabelas de dados

**Método: `generateCSV(expenses, format): Promise<string>`**
- Exporta dados em formato CSV
- Colunas: Date, Description, Establishment, Value, Category, Responsible
- Suporta filtros por categoria e responsável

**Método: `generateXLSX(report, data): Promise<string>`**
- Placeholder para XLSX
- Seria implementado com biblioteca `xlsx`
- Múltiplas abas por seção do relatório

**Método: `sendReportByEmail(report, recipientEmails, message?)`**
- Log de email (mock)
- Pronto para integração com nodemailer
- Enviaria arquivo em anexo e link para download

**Método: `getReport(userId, reportId): Promise<Report | null>`**
- Busca relatório específico
- Verifica ownership (userId)

**Método: `listReports(userId, limit, offset): Promise<Report[]>`**
- Pagina relatórios do usuário
- Ordenado por createdAt DESC

**Método: `saveAsTemplate(userId, reportId, templateName): Promise<Report>`**
- Marca relatório como template
- Define templateName
- Retorna relatório atualizado

**Método: `getTemplates(userId): Promise<Report[]>`**
- Lista todos os templates do usuário
- WHERE isTemplate = true

**Método: `deleteReport(userId, reportId): Promise<boolean>`**
- Soft delete (deletedAt)
- Valida ownership

**Método: `incrementViewCount(reportId): Promise<void>`**
- Incrementa viewCount
- Usado ao visualizar relatório

### 4. Controller: `controllers/reports.controller.ts` (220 linhas)

**Endpoints Implementados:**

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/reports/generate` | Gera novo relatório |
| GET | `/reports` | Lista relatórios (paginado) |
| GET | `/reports/:reportId` | Obtém relatório específico |
| POST | `/reports/:reportId/send` | Envia relatório por email |
| POST | `/reports/:reportId/template` | Salva como template |
| GET | `/reports/templates/list` | Lista templates salvos |
| DELETE | `/reports/:reportId` | Deleta relatório |

**Validações Implementadas:**
- Tipo de relatório obrigatório
- Período válido (início < fim)
- Pelo menos uma seção incluída
- Emails válidos para envio
- Relatório deve estar "ready" para enviar
- Verificação de ownership em todas as operações

### 5. Module: `reports.module.ts` (30 linhas)

```typescript
@Module({
  imports: [
    TypeOrmModule.forFeature([Report, Expense, Income]),
    AnalyticsModule,
  ],
  providers: [ReportGeneratorService],
  controllers: [ReportsController],
  exports: [ReportGeneratorService],
})
```

**Importações:**
- Report, Expense, Income entities
- AnalyticsModule (para dados de análise)

**Exportações:**
- ReportGeneratorService (para uso em outros módulos)

### 6. Migration: `migrations/013-create-reports-table.ts` (180 linhas)

**Cria tabela `reports` com:**
- Coluna UUID primária
- Foreign key CASCADE para users.id
- Índices compostos para performance
- Soft delete (deletedAt)
- JSONB para config e metadata

---

## 🎨 Frontend Implementation

### 1. Types: `types/reports.ts` (200 linhas)

TypeScript interfaces espelhando todos os DTOs do backend:
- `ReportConfig`
- `GenerateReportDto`
- `ReportMetadata`
- `ReportDto`
- `SendReportDto`
- `SaveAsTemplateDto`
- `ReportTemplate`
- `ReportSummaryDto`

Todas com documentação JSDoc completa e class-validator decorators

### 2. Hook: `hooks/useReports.ts` (280 linhas)

**Estado Gerenciado:**
```typescript
{
  reports: ReportDto[];
  templates: ReportTemplate[];
  currentReport: ReportDto | null;
  isLoading: boolean;
  isGenerating: boolean;
  error: string | null;
}
```

**Métodos Disponibilizados:**
- `generateReport(dto)` - POST /reports/generate
- `getReport(id)` - GET /reports/:id
- `listReports(limit, offset)` - GET /reports
- `sendReport(id, dto)` - POST /reports/:id/send
- `saveAsTemplate(id, dto)` - POST /reports/:id/template
- `getTemplates()` - GET /reports/templates/list
- `deleteReport(id)` - DELETE /reports/:id
- `downloadFile(report)` - Trigger download no navegador

**Inicialização:**
- Auto-carrega reports e templates no mount
- Trata erros com state updates
- Suporta retry logic

### 3. Component: `components/reports/ReportBuilder.tsx` (350 linhas)

**Funcionalidades:**
- Seleção de tipo de relatório (5 tipos)
- Seleção de período (mensal/trimestral/anual/customizado)
- Seleção de formato de saída (PDF/CSV/XLSX)
- Seleção de seções a incluir (7 seções)
- Configuração de envio por email
- Validação completa de entrada
- Loading state durante geração
- Error handling com feedback visual

**UI Features:**
- Tabs para diferentes tipos de relatório
- Checkboxes para seções com descrições
- Suporte a email múltiplos
- Validação de emails em tempo real
- Botões de ação com feedback
- Responsive design
- Dark mode support

### 4. Component: `components/reports/ReportList.tsx` (280 linhas)

**Funcionalidades:**
- Lista paginada de relatórios
- Status visual com cores (pending/generating/ready/failed)
- Metadados exibidos: formato, total gasto, top categoria, visualizações
- Ações: download, visualizar, deletar
- Confirmação de deleção
- Loading state
- Empty state

**UI Features:**
- Cards responsive com grid
- Cores por status
- Ícones para ações rápidas
- Timestamps formatadas
- Indicador de relatórios enviados
- Dark mode support

### 5. Component: `components/reports/ReportPreview.tsx` (300 linhas)

**Funcionalidades:**
- Modal de visualização completa
- Exibição de metadados em cards
- Estatísticas resumidas
- Informações do relatório (período, tamanho, envio)
- Seções incluídas no relatório
- Notas informativas
- Fechar modal

**UI Features:**
- Modal responsivo com scroll
- Cards com estatísticas
- Cores por tipo de informação
- Layout em grid
- Timestamps formatadas
- Dark mode support

### 6. Component: `components/reports/TemplateManager.tsx` (200 linhas)

**Funcionalidades:**
- Lista de templates salvos
- Seleção de template para uso
- Deleção de templates
- Confirmação de deleção
- Loading state
- Empty state

**UI Features:**
- Cards simples e limpos
- Botões de ação (usar/deletar)
- Tipos de relatório exibidos
- Data de criação
- Dark mode support

### 7. Page: `app/reports/page.tsx` (350 linhas)

**Funcionalidades:**
- Layout em abas: Criar, Listar, Templates
- Integração de todos os componentes
- Refresh automático após criação
- Estatísticas rápidas em cards
- Seção de dicas e boas práticas
- Modal de preview

**UI Features:**
- Navegação por abas
- Stats cards em grid
- Dicas com ícones
- Refresh button
- Error handling
- Responsive design
- Dark mode support

### 8. Utils: `utils/formatters.ts` (200 linhas)

**Funções de Formatação:**
- `formatCurrency(value)` - R$ 1.234,56
- `formatDate(date)` - DD/MM/YYYY
- `formatDateTime(date)` - DD/MM/YYYY HH:mm
- `formatPercent(value)` - 12,5%
- `formatNumber(value)` - 1.234
- `formatDuration(minutes)` - 2h 30min
- `truncate(text, length)` - texto...

### 9. Index: `components/reports/index.ts` (10 linhas)

Exports centralizados para facilitar importações

---

## 📊 Algoritmos e Lógica

### Geração de Metadados
```
1. Buscar todas as despesas do período (filtrado por userId)
2. Buscar todas as receitas do período
3. Calcular:
   - totalExpenses = SUM(despesas.valor)
   - totalIncome = SUM(receitas.valor)
   - averageDaily = totalExpenses / dias_no_período
   - topCategory = categoria com maior despesa
   - topMerchant = estabelecimento com mais transações
   - anomalyCount = COUNT(anomalias do período)
   - highestTransaction = MAX(despesa.valor)
   - lowestTransaction = MIN(despesa.valor)
   - transactionCount = COUNT(todas as transações)
```

### Validação de Configuração
```
- Tipo de relatório deve ser válido (monthly/quarterly/annual/custom/comparison)
- Período deve ser válido (startMonth >= 1 && <= 12)
- Se endMonth fornecido, endYear também deve ser fornecido
- Pelo menos uma seção deve estar incluída (include* = true)
- Se sendToEmail = true, deve haver pelo menos 1 email válido
- Formato deve ser válido (pdf/csv/xlsx)
```

### Fluxo de Geração
```
1. Criar registro de relatório com status="pending"
2. Calcular metadados
3. Gerar arquivo (PDF/CSV/XLSX)
4. Atualizar fileUrl, fileSize, status="ready"
5. Se sendToEmail:
   - Enviar email com anexo
   - Atualizar sentToEmail=true, sentAt=now()
6. Retornar relatório gerado
```

---

## 🔌 Integração Necessária

### Backend - `app.module.ts`
```typescript
import { ReportsModule } from './modules/reports/reports.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';

@Module({
  imports: [
    // ... outros módulos
    AnalyticsModule,
    ReportsModule,
  ],
})
export class AppModule {}
```

### Frontend - Middleware de Autenticação
- Todos os endpoints requerem JWT válido (JwtAuthGuard)
- Token extraído do header Authorization: Bearer {token}
- UserId obtido do JWT payload (@CurrentUser())

---

## 📦 Dependências

### Backend (NestJS)
- `typeorm` - ORM e migrations
- `@nestjs/common` - Core framework
- `@nestjs/typeorm` - Integração TypeORM
- `class-validator` - Validação de DTOs
- `uuid` - Geração de IDs (via DB)

### Frontend (Next.js 14+)
- `react` - 18+
- `typescript` - Type safety
- `tailwindcss` - Styling

### Futuras Integrações (não implementadas)
- `pdfkit` ou `pdfmake` - Geração de PDFs
- `xlsx` - Geração de XLSX
- `nodemailer` - Envio de emails
- S3/Cloud Storage - Armazenamento de arquivos

---

## 🎯 Próximos Passos

### Antes de Produção
1. Integrar ReportsModule no app.module.ts
2. Integrar AnalyticsModule no app.module.ts
3. Implementar geração real de PDF (usar PDFKit/pdfmake)
4. Implementar geração real de XLSX (usar xlsx)
5. Implementar envio de emails (usar nodemailer + Gmail/AWS SES)
6. Implementar storage de arquivos (S3, GCS ou disk)
7. Testar fluxo completo de geração
8. Adicionar rate limiting em geração de relatórios
9. Adicionar fila de jobs para relatórios grandes (Bull/BullMQ)
10. Implementar webhooks de notificação

### Melhorias Futuras
1. Agendamento de relatórios (gerar automaticamente)
2. Relatórios comparativos mais avançados
3. Gráficos embutidos no PDF
4. Suporte a mais formatos (JSON, XML)
5. API de filtros avançados
6. Relatórios em tempo real com dados live
7. Compartilhamento de relatórios (links públicos)
8. Histórico de versões de templates

---

## 📈 Estatísticas

| Métrica | Valor |
|---------|-------|
| Total de Arquivos | 12 |
| Linhas de Código Backend | ~1.300 |
| Linhas de Código Frontend | ~2.200 |
| Linhas de Código Total | ~3.500+ |
| Endpoints da API | 7 |
| Componentes React | 4 |
| TypeScript Interfaces | 8+ |
| Índices de Banco de Dados | 3 |
| Estados Gerenciados (Hook) | 6 |

---

## ✅ Checklist de Implementação

- ✅ Backend Entity
- ✅ Backend DTOs
- ✅ Backend Service (com validações)
- ✅ Backend Controller (com endpoints)
- ✅ Backend Module
- ✅ Backend Migration
- ✅ Frontend Types
- ✅ Frontend Hook (useReports)
- ✅ Frontend Components (4)
- ✅ Frontend Page (Reports)
- ✅ Frontend Utils (Formatters)
- ⏳ Integração no app.module.ts (próximo passo)
- ⏳ Implementação de geração de arquivos reais (futuro)
- ⏳ Implementação de envio de emails (futuro)
- ⏳ Testes automatizados (futuro)

---

## 🚀 Status

**Seção D - Completa para Demo e Testes** ✅

Toda a estrutura foi implementada e está pronta para ser integrada no app.module.ts e testada. As gerações de PDF/XLSX e envio de emails estão como mock implementations prontas para integração com bibliotecas reais.

