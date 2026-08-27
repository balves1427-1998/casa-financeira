# 📊 Seção B - Previsões Financeiras (Fase 3)

**Status**: ✅ COMPLETO  
**Data de Conclusão**: 2026-08-25  
**Foco**: Backend + Frontend para análise de cenários e projeções de longo prazo

---

## 📋 RESUMO EXECUTIVO

Seção B implementa um sistema completo de previsões com:

- **Projeções de Curto Prazo**: 30 dias
- **Projeções de Médio Prazo**: 90 dias
- **Projeções de Longo Prazo**: 1 ano (365 dias)
- **Análise de Sensibilidade**: Simule impactos de mudanças em receitas/despesas
- **Algoritmos Sofisticados**: Histórico, média móvel, sazonalidade

---

## 🏗️ ARQUITETURA

### Backend (6 arquivos)

#### 1. **Entity** - `forecast.entity.ts` (110 linhas)

TypeORM Entity para armazenar previsões

**Campos Principais:**
- `id` (uuid, primary)
- `userId` (uuid, FK → users)
- `period` (enum: '30-days' | '90-days' | '365-days')
- `forecastDate` (date) - Data inicial da previsão
- `initialBalance` (decimal) - Saldo no início
- `projectedEndBalance` (decimal) - Saldo ao final do período
- `minProjectedBalance` (decimal) - Saldo mínimo projetado
- `minBalanceDate` (date, nullable) - Data do saldo mínimo

**Receitas e Despesas:**
- `projectedIncome` - Receita total projetada
- `projectedExpenses` - Despesa total projetada
- `fixedExpenses` - Despesas fixas (60% do histórico)
- `variableExpenses` - Despesas variáveis (40% do histórico)
- `installmentPayments` - Parcelamentos futuros

**Análise:**
- `daysWithLowBalance` (int) - Dias com saldo < R$ 2.000
- `hasNegativeRisk` (boolean) - Risco de saldo negativo
- `negativeRiskDate` (date, nullable) - Quando ficaria negativo
- `confidence` (decimal 0-1) - Confiança da previsão

**Dados Detalhados:**
- `detailedProjections` (jsonb array) - Projeção dia a dia/semana/mês
- `seasonalityAnalysis` (jsonb) - Análise de padrões sazonais
- `recommendations` (text array) - Recomendações automáticas
- `metadata` (jsonb) - dataPoints, historyMonths, averages, consistency

**Índices:**
- `idx_forecasts_userId_forecastDate` - Busca por usuário e data
- `idx_forecasts_userId_period_createdAt` - Busca por período

#### 2. **DTOs** - `forecast.dto.ts` (280 linhas)

Sete classes e enums:

1. **ForecastPeriod** (enum)
   - SHORT: '30-days'
   - MEDIUM: '90-days'
   - LONG: '365-days'

2. **ProjectionPointDto**
   - date, projectedBalance, income, expenses, minBalance
   - week, month (optional)

3. **SeasonalityAnalysisDto**
   - pattern: 'high' | 'low' | 'stable'
   - variance (0-1)
   - peakDates[], lowDates[]

4. **ForecastDto** - Previsão completa com todos os campos

5. **GenerateForecastDto** - Request para gerar
   - period (obrigatório)
   - startDate (opcional)
   - minimumBalanceThreshold (opcional)

6. **ForecastSummaryDto** - Resumo com as 3 previsões
   - forecast30Days, forecast90Days, forecast365Days
   - currentBalance, generatedAt

7. **SensitivityAnalysisDto** - Análise de cenário
   - variable: 'income' | 'expenses' | 'both'
   - percentageChange (-100 a 100)
   - projectedBalance30/90/365Days
   - riskLevel: 'low' | 'medium' | 'high'
   - negativeDate (se houver risco)
   - insights[]

#### 3. **Service** - `forecasting.service.ts` (500 linhas)

Lógica complexa com 3 métodos principais:

**generateForecast(user, dto): Promise<ForecastDto>**
```typescript
1. Validar período
2. Buscar dados históricos (últimos 6 meses)
   - Agrupar por mês
   - Calcular médias de receita e despesa
   - Calcular dataPoints (quantidade de transações)
3. Buscar transações futuras (incomes, expenses, planned)
4. Calcular totais projetados:
   - projectedIncome = futuras + média histórica * dias
   - fixedExpenses = 60% * média histórica
   - variableExpenses = 40% * média histórica
   - installmentPayments = soma contas planejadas
5. Gerar projeções dia a dia
   - Iterar por cada dia do período
   - Acumular saldo com operações
   - Rastrear saldo mínimo
6. Detectar riscos
   - hasNegativeRisk se minBalance < 0
   - daysWithLowBalance se < R$ 2.000
7. Calcular confiança
   - Baseada em quantidade de dados históricos
   - min 0.5, max 0.95
8. Analisar sazonalidade
   - Calcular variância das despesas mensais
   - Classificar como 'high' (>30%), 'stable' (<10%), 'low'
9. Gerar recomendações automáticas (4-5 insights)
10. Salvar no banco
```

**getForecastSummary(user): Promise<ForecastSummaryDto>**
```typescript
1. Buscar últimas 3 previsões (30, 90, 365 dias)
2. Retornar resumo com as 3
3. Se não existir: undefined
```

**analyzeSensitivity(user, period, variable, change): Promise<SensitivityAnalysisDto[]>**
```typescript
1. Validar percentageChange (-100 a 100)
2. Buscar forecast do período
3. Testar 3 cenários:
   - Só renda mudar
   - Só despesa mudar
   - Ambas mudarem
4. Para cada cenário:
   - Ajustar valores: valor * (1 + percentageChange/100)
   - Recalcular saldos em 30, 90, 365 dias
   - Detectar se fica negativo
   - Gerar insights baseado em resultados
5. Retornar array de análises
```

**Private Helpers:**
- `getHistoricalData()` - Busca últimos 6 meses
- `calculateFixedExpenses()` - 60% da média
- `calculateVariableExpenses()` - 40% da média
- `calculateRecurringIncome()` - Média de receitas
- `generateDetailedProjections()` - Dia a dia com operações
- `analyzeSeasonality()` - Padrões de variação
- `generateRecommendations()` - 4-5 insights personalizados
- `generateSensitivityInsights()` - Insights por cenário
- `calculateConsistencyScore()` - Coeficiente de variação

#### 4. **Controller** - `forecasting.controller.ts` (60 linhas)

Três endpoints:

```typescript
@Post('generate')  // POST /forecasting/generate
async generateForecast(dto): ForecastDto

@Get('summary')  // GET /forecasting/summary
async getForecastSummary(): ForecastSummaryDto

@Get('sensitivity')  // GET /forecasting/sensitivity?period=90-days&variable=both&percentageChange=10
async analyzeSensitivity(period, variable, change): SensitivityAnalysisDto[]
```

- Guards: `@UseGuards(JwtAuthGuard)`
- Decorators: `@CurrentUser()` para extrair usuário

#### 5. **Module** - `forecasting.module.ts` (25 linhas)

```typescript
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Forecast,
      Expense,
      Income,
      PlannedAccount,
    ]),
  ],
  controllers: [ForecastingController],
  providers: [ForecastingService],
  exports: [ForecastingService],
})
```

#### 6. **Migration** - `011-create-forecasts-table.ts` (140 linhas)

```sql
CREATE TABLE forecasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  userId UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period VARCHAR NOT NULL,
  forecastDate DATE NOT NULL,
  initialBalance NUMERIC(12,2) NOT NULL,
  projectedEndBalance NUMERIC(12,2) NOT NULL,
  minProjectedBalance NUMERIC(12,2) NOT NULL,
  minBalanceDate DATE,
  projectedIncome NUMERIC(12,2) DEFAULT 0,
  projectedExpenses NUMERIC(12,2) DEFAULT 0,
  fixedExpenses NUMERIC(12,2) DEFAULT 0,
  variableExpenses NUMERIC(12,2) DEFAULT 0,
  installmentPayments NUMERIC(12,2) DEFAULT 0,
  daysWithLowBalance INT DEFAULT 0,
  hasNegativeRisk BOOLEAN DEFAULT false,
  negativeRiskDate DATE,
  confidence NUMERIC(3,2) DEFAULT 0.5,
  detailedProjections JSONB,
  seasonalityAnalysis JSONB,
  recommendations TEXT[],
  metadata JSONB,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deletedAt TIMESTAMP
);
```

---

### Frontend (7 arquivos)

#### 1. **Hook** - `useForecasting.ts` (200 linhas)

React Hook com state management completo:

```typescript
interface UseForecastingState {
  summary: ForecastSummaryDto | null,
  currentForecast: ForecastDto | null,
  sensivityAnalysis: SensitivityAnalysisDto[] | null,
  isLoading: boolean,
  error: string | null,
}

Methods:
- generateForecast(dto): POST /forecasting/generate
- fetchForecastSummary(): GET /forecasting/summary
- analyzeSensitivity(period, variable, change): GET /forecasting/sensitivity
```

**Features:**
- Auto-load summary on mount
- Error handling e state management
- Credentials: 'include' para auth

#### 2. **Types** - `forecasting.ts` (120 linhas)

Interfaces TypeScript que espelham DTOs backend:
- ForecastPeriod (enum)
- ProjectionPointDto
- SeasonalityAnalysisDto
- ForecastDto
- GenerateForecastDto
- ForecastSummaryDto
- SensitivityAnalysisDto

#### 3. **Component** - `ForecastSummaryCards.tsx` (220 linhas)

Cards para os 3 períodos (30, 90, 365 dias)

**Features:**
- Conditional render: card ou placeholder
- Status visual: verde (positivo), vermelho (negativo), âmbar (risco)
- Métricas por card:
  - Saldo projetado + % de mudança
  - Saldo mínimo
  - Dias com baixo saldo
  - Confiança (barra de progresso)
  - Aviso se negativo
- Responsive: 1 col mobile, 3 cols desktop
- Loading skeleton

#### 4. **Component** - `ForecastProjection.tsx` (250 linhas)

Gráfico SVG com projeção de saldo

**Features:**
- Gráfico de área com linha
- Eixo Y: valores de saldo
- Eixo X: tempo (dias/semanas/meses)
- Pontos amostrados (cada 20o ponto)
- Linhas de grade
- Linha de referência para saldo mínimo
- Pontos coloridos (verde/âmbar/vermelho por risco)
- Y-axis labels com valores em BRL
- Métricas resumidas abaixo do gráfico
- Avisos para riscos (negativo, saldo baixo)
- Recomendações automáticas

#### 5. **Component** - `SensitivityAnalysis.tsx` (280 linhas)

Simulador de cenários

**Features:**
- 3 controles:
  - Seletor de variável (renda, despesa, ambas)
  - Slider de variação (-50% a +50%)
  - Botão "Analisar"
- Cards por cenário:
  - Nomear cenário (Renda +10%, Despesa -5%, etc)
  - Saldos em 30, 90, 365 dias
  - Nível de risco (baixo/médio/alto)
  - Insights personalizados
  - Aviso se fica negativo
- Cores dinâmicas por risco
- Info box com dicas de uso

#### 6. **Page** - `app/forecasting/page.tsx` (450 linhas)

Página principal com layout completo

**Seções:**
1. Header: Título e descrição
2. Erro: Alert se houver erro
3. Saldo Atual: Card azul destacado
4. Botões de Período: 30/90/365 com ícones
5. Loading: Spinner durante geração
6. Summary Cards: Cards dos 3 períodos
7. Projeção Detalhada: Gráfico completo
8. Análise de Sensibilidade: Simulador
9. Breakdown: 2 colunas com:
   - Receitas/Despesas resumidas
   - Detalhamento de despesas (fixas, variáveis, parcelamentos)
10. Tips: Seção com 5 dicas de uso

**Interactions:**
- Click em botão período: gera previsão
- Select variável e slider: simulação
- Click "Analisar": executa sensitivity

---

## 📊 ESTATÍSTICAS SEÇÃO B

### Arquivos Criados

**Backend:**
1. ✅ `entities/forecast.entity.ts` (110 linhas)
2. ✅ `dtos/forecast.dto.ts` (280 linhas)
3. ✅ `services/forecasting.service.ts` (500 linhas)
4. ✅ `controllers/forecasting.controller.ts` (60 linhas)
5. ✅ `forecasting.module.ts` (25 linhas)
6. ✅ `migrations/011-create-forecasts-table.ts` (140 linhas)

**Frontend:**
7. ✅ `hooks/useForecasting.ts` (200 linhas)
8. ✅ `types/forecasting.ts` (120 linhas)
9. ✅ `components/forecasting/ForecastSummaryCards.tsx` (220 linhas)
10. ✅ `components/forecasting/ForecastProjection.tsx` (250 linhas)
11. ✅ `components/forecasting/SensitivityAnalysis.tsx` (280 linhas)
12. ✅ `app/forecasting/page.tsx` (450 linhas)

**Total Seção B:**
- **Arquivos**: 12
- **Linhas de Código**: 2.635
- **Endpoints**: 3 (POST, GET, GET)
- **Componentes**: 5 (4 componentes + 1 página)
- **Algoritmos Complexos**: 8 (cálculos, sazonalidade, sensibilidade, etc)

### Quebra por Categoria

| Categoria | Linhas | Arquivos |
|-----------|--------|----------|
| Backend - Service | 500 | 1 |
| Backend - Entity/DTOs/Module | 415 | 3 |
| Backend - Controller | 60 | 1 |
| Backend - Migration | 140 | 1 |
| Frontend - Hook | 200 | 1 |
| Frontend - Types | 120 | 1 |
| Frontend - Components | 750 | 3 |
| Frontend - Page | 450 | 1 |
| **TOTAL** | **2.635** | **12** |

---

## 🎯 FUNCIONALIDADES IMPLEMENTADAS

### Backend

#### Algoritmos de Previsão
✅ Análise de histórico (últimos 6 meses)
✅ Cálculo de média móvel de receitas/despesas
✅ Separação entre despesas fixas (60%) e variáveis (40%)
✅ Incorporação de transações futuras conhecidas
✅ Geração de projeções dia a dia

#### Períodos Suportados
✅ Curto prazo (30 dias)
✅ Médio prazo (90 dias)
✅ Longo prazo (365 dias)

#### Análise de Risco
✅ Detecção de saldo negativo
✅ Contagem de dias com saldo baixo (< R$ 2.000)
✅ Previsão de data do saldo negativo
✅ Scoring de confiança (0-95%)

#### Análise de Sazonalidade
✅ Cálculo de variância mensal
✅ Classificação: padrão alto/baixo/estável
✅ Identificação de picos e vales

#### Análise de Sensibilidade
✅ Teste de impacto de mudanças em renda (±100%)
✅ Teste de impacto de mudanças em despesa (±100%)
✅ Teste de impacto combinado
✅ Identificação de breakeven point
✅ Geração de insights por cenário

#### Recomendações Automáticas
✅ 4-5 recomendações personalizadas por previsão
✅ Baseadas em risco, sazonalidade, histórico
✅ Actionable e contextualizadas

### Frontend

#### Interface Responsiva
✅ Desktop: cards de 3 colunas
✅ Mobile: cards de 1 coluna
✅ Tablet: ajuste intermediário
✅ Dark mode completo

#### Visualizações
✅ Cards resumidos (30, 90, 365 dias)
✅ Gráfico SVG com área e linha
✅ Cores dinâmicas por status
✅ Métricas agregadas
✅ Breakdown de receitas/despesas

#### Interatividade
✅ Seleção de período (botões)
✅ Geração de previsão (click)
✅ Seletor de variável (select)
✅ Slider de percentual (-50 a +50)
✅ Análise de sensibilidade (botão)

#### Informações Contextuais
✅ Saldo atual destacado
✅ Projeção de 3 períodos
✅ Saldo mínimo esperado
✅ Dias com saldo baixo
✅ Nível de confiança (%)
✅ Avisos de risco
✅ Recomendações em texto

---

## 🔐 SEGURANÇA

✅ JwtAuthGuard em todos endpoints
✅ User isolation: `where { userId: user.id }`
✅ DTO validation com class-validator
✅ Soft deletes para auditoria
✅ Índices de performance
✅ Decimal para valores monetários (sem float)

---

## 📈 ALGORITMOS COMPLEXOS

### Cálculo de Confiança
```
confidence = min(0.95, max(0.5, dataPoints / 24))
```
- 0 pontos: 50% confiança
- 24 pontos (6 meses): 100% (capped a 95%)

### Análise de Sazonalidade
```
variance = sqrt(sum((month - avg)^2) / n) / avg
pattern = 'high' se variance > 0.3
        = 'low' se variance < 0.1
        = 'stable' caso contrário
```

### Separação de Despesas
```
fixedExpenses = avgMonthly * 0.6
variableExpenses = avgMonthly * 0.4
```

### Projeção de Saldo
```
balance = initialBalance
para cada dia:
  balance += dayIncome
  balance -= (fixedExpense + dayExpense + plannedAmount)
```

### Sensibilidade
```
adjustedIncome = income * (1 + percentageChange/100)
adjustedExpenses = expenses * (1 + percentageChange/100)
netFlow = adjustedIncome - adjustedExpenses
balance30 = initialBalance + (netFlow * 30 / periodDays)
```

---

## 🚀 PRÓXIMOS PASSOS (Seção C - Advanced Analytics)

### Análise de Tendências
- [ ] Spending patterns (padrões de gasto)
- [ ] Anomaly detection (gastos anormais)
- [ ] Category trends (evolução de categorias)
- [ ] Comparison (Bruno x Giovanna)

### Detecção de Anomalias
- [ ] Desvio padrão de transações
- [ ] Gastos fora do padrão (IQR method)
- [ ] Novas categorias/estabelecimentos
- [ ] Oscilações sazonais

### Comparação
- [ ] Dashboard comparativo Bruno x Giovanna
- [ ] Breakeven de despesas compartilhadas
- [ ] Tendências individuais

---

## ✅ CHECKLIST SEÇÃO B

### Backend
- [x] Entity com índices
- [x] 7 DTOs completos
- [x] Service com 3 métodos core
- [x] Algoritmos de previsão
- [x] Análise de sazonalidade
- [x] Análise de sensibilidade
- [x] Controller com 3 endpoints
- [x] Module configurado
- [x] Migration criada
- [x] User isolation

### Frontend
- [x] Hook com state management
- [x] Types/Interfaces completas
- [x] Componente Summary Cards
- [x] Componente Projection (gráfico)
- [x] Componente Sensitivity
- [x] Página completa
- [x] Responsividade (mobile/desktop)
- [x] Dark mode
- [x] Loading states
- [x] Error handling

---

## 📈 INTEGRAÇÃO COM OUTROS MÓDULOS

**Dependências:**
- ✅ Expense module (busca histórico)
- ✅ Income module (busca histórico)
- ✅ PlannedAccount module (busca futuro)
- ✅ Auth module (JwtAuthGuard)
- ✅ Users module (User entity)
- ✅ CashFlow module (previsões futuras)

**Feedback com CashFlow:**
- Previsão de 30 dias = aproximação do CashFlow diário
- Previsão pode alimentar alertas de CashFlow

---

## 📝 NOTAS TÉCNICAS

### Formato de Data
Todos detailedProjections usam ISO 8601 (YYYY-MM-DD)

### Precisão Decimal
NUMERIC(12,2) com 2 casas decimais para valores monetários

### Índices de Performance
- userId + forecastDate: busca rápida por período
- userId + period + createdAt: get latest por tipo

### Limite de Histórico
6 meses = 180 dias aproximados
- Mínimo 1 ponto de dados para prever
- Máximo 24 pontos (6 meses) para confiança 95%

---

## 🎉 SEÇÃO B - COMPLETA

Fase 3 Seção B implementa previsões financeiras com:
- ✅ Projeções de 30, 90 e 365 dias
- ✅ Algoritmos baseados em histórico
- ✅ Análise de sensibilidade
- ✅ Detecção de risco (negativo, saldo baixo)
- ✅ Interface visual com gráficos
- ✅ Recomendações automáticas
- ✅ Análise de sazonalidade

**Pronto para Seção C (Advanced Analytics)**

---

**Desenvolvido com ❤️ para Casa Financeira**  
2026-08-25

Fase 3 - Seção B ✅ → Seção C 🚀
