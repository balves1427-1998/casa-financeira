import axios, { AxiosInstance, AxiosError } from 'axios';
import {
  AiAnomalyDto,
  AiInsightsDto,
  ApplyRecommendationDto,
  BalanceProjectionResponseDto,
  BehaviorAnalysisResponseDto,
  ChatMessageResponseDto,
  ChatSuggestionsDto,
  ConfirmAnomalyDto,
  DetectAnomaliesResultDto,
  ForecastDetailsDto,
  ForecastResponseDto,
  ForecastScenariosDto,
  GetAnomaliesDto,
  GetCategoryForecastsDto,
  GetChatHistoryDto,
  GetCorrelationsDto,
  GetPatternsDto,
  GetRecommendationsDto,
  ListAnomaliesDto,
  ListCategoryForecastsDto,
  ListChatHistoryDto,
  ListCorrelationsDto,
  ListForecastComparisonsDto,
  ListPatternsDto,
  ListRecommendationsDto,
  RecommendationActionResultDto,
  RecommendationDto,
  RecommendationImpactEstimateDto,
  SendChatMessageDto,
  SpendingProfileDto,
  UpdateRecommendationDto,
} from '@/types/ai';
import {
  AddFamilyMemberDto,
  CreateFamilyDto,
  FamilyDto,
  FamilyMemberDto,
  UpdateFamilyDto,
} from '@/types/family';
import {
  CreateIncomeDto,
  IncomeDto,
  IncomeMonthlyTotalDto,
  IncomeTotalByResponsibleDto,
  IncomeTypeBreakdownDto,
  RecurringMonthlyIncomeDto,
  UpdateIncomeDto,
} from '@/types/income';
import {
  AddContributionDto,
  CreateGoalDto,
  GoalDto,
  GoalStatus,
  GoalsSummaryDto,
  UpdateGoalDto,
} from '@/types/goal';
import {
  CategorySplitDto,
  SetSplitRuleDto,
  SettlementDto,
  SplitRuleDto,
  SplitSummaryDto,
} from '@/types/split';
import {
  GenerateMonthlyReportDto,
  ListMonthlyReportsDto,
  MonthlyReport,
  MonthlyReportDetailDto,
  MonthlyReportSummaryDto,
  ReportFormat,
} from '@/types/report';

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

/**
 * `fetch` já autenticado, para os hooks que não passam pelo cliente axios.
 *
 * Existe porque quatro hooks (relatórios, previsão, regras e analytics) foram
 * escritos assumindo cookie de sessão (`credentials: 'include'`) ou lendo o
 * token da chave errada do localStorage (`token`, quando o login grava
 * `access_token`). Nos dois casos a API respondia 401 e a tela mostrava um
 * "Failed to fetch..." sem explicar a causa. Concentrar a montagem do header
 * aqui evita que a divergência volte a aparecer em cada hook novo.
 *
 * `path` é relativo à API (`/reports/generate`), sem a base.
 */
export async function authFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const token =
    typeof window !== 'undefined'
      ? localStorage.getItem('access_token')
      : null;

  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...((init.headers as Record<string, string>) ?? {}),
      // Vem por último de propósito: sobrescreve qualquer Authorization que o
      // chamador tenha montado por conta própria.
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

/**
 * Extrai o nome do arquivo de um cabeçalho `Content-Disposition`.
 *
 * Aceita as duas formas que o Express emite:
 * `attachment; filename="relatorio.pdf"` e `filename*=UTF-8''relatorio.pdf`.
 * Devolve `null` quando o cabeçalho não veio — o navegador só o entrega se o
 * servidor o expuser via `Access-Control-Expose-Headers`.
 */
function parseFileNameFromContentDisposition(
  header: unknown,
): string | null {
  if (typeof header !== 'string' || !header.trim()) {
    return null;
  }

  const utf8 = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8?.[1]) {
    try {
      return decodeURIComponent(utf8[1].trim());
    } catch {
      return utf8[1].trim();
    }
  }

  const simples = header.match(/filename="?([^";]+)"?/i);
  return simples?.[1]?.trim() || null;
}

/**
 * Substitui, no lugar, um corpo de erro que veio como `Blob` pelo JSON que ele
 * contém.
 *
 * Requisições com `responseType: 'blob'` recebem TAMBÉM as respostas de erro
 * como Blob. Sem esta conversão, `getApiErrorMessage` não encontraria o campo
 * `message` do NestJS e a tela mostraria um erro genérico no lugar da
 * explicação real ("Relatório não encontrado", "Formato inválido"…).
 */
async function hydrateBlobErrorBody(error: unknown): Promise<void> {
  if (!axios.isAxiosError(error) || !error.response) {
    return;
  }

  const data = error.response.data;
  if (typeof Blob === 'undefined' || !(data instanceof Blob)) {
    return;
  }

  try {
    const texto = await data.text();
    error.response.data = JSON.parse(texto);
  } catch {
    // Corpo não-JSON (ex.: HTML de um proxy): deixa como está para o fallback.
  }
}

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_URL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add Authorization header
    this.client.interceptors.request.use((config) => {
      if (typeof window !== 'undefined') {
        const token = localStorage.getItem('access_token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      }
      return config;
    });

    // Handle errors
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        if (error.response?.status === 401) {
          if (typeof window !== 'undefined') {
            localStorage.removeItem('access_token');
            localStorage.removeItem('user');
            window.location.href = '/login';
          }
        }
        throw error;
      }
    );
  }

  // Auth endpoints
  async login(email: string, password: string) {
    const response = await this.client.post('/auth/login', { email, password });
    return response.data;
  }

  async register(name: string, email: string, password: string) {
    const response = await this.client.post('/auth/register', {
      name,
      email,
      password,
      confirmPassword: password,
    });
    return response.data;
  }

  async logout() {
    return await this.client.post('/auth/logout');
  }

  async refresh(refreshToken: string) {
    const response = await this.client.post('/auth/refresh', { refresh_token: refreshToken });
    return response.data;
  }

  // Accounts endpoints
  async getAccounts() {
    const response = await this.client.get('/accounts');
    return response.data;
  }

  async createAccount(data: any) {
    const response = await this.client.post('/accounts', data);
    return response.data;
  }

  async getAccount(id: string) {
    const response = await this.client.get(`/accounts/${id}`);
    return response.data;
  }

  async updateAccount(id: string, data: any) {
    const response = await this.client.put(`/accounts/${id}`, data);
    return response.data;
  }

  async deleteAccount(id: string) {
    return await this.client.delete(`/accounts/${id}`);
  }

  async getTotalBalance() {
    const response = await this.client.get('/accounts/balance/total');
    return response.data;
  }

  // Users endpoints
  async getCurrentUser() {
    const response = await this.client.get('/users/me');
    return response.data;
  }

  // ==================== Receitas (incomes) ====================
  // O antigo módulo `receipts` FOI REMOVIDO do backend: as duas tabelas que
  // representavam o mesmo conceito foram consolidadas em `incomes`.

  async getIncomes(): Promise<IncomeDto[]> {
    const response = await this.client.get('/incomes');
    return response.data;
  }

  async createIncome(data: CreateIncomeDto): Promise<IncomeDto> {
    const response = await this.client.post('/incomes', data);
    return response.data;
  }

  async getIncome(id: string): Promise<IncomeDto> {
    const response = await this.client.get(`/incomes/${id}`);
    return response.data;
  }

  async updateIncome(id: string, data: UpdateIncomeDto): Promise<IncomeDto> {
    const response = await this.client.put(`/incomes/${id}`, data);
    return response.data;
  }

  /** `DELETE /incomes/:id` responde 204 sem corpo. */
  async deleteIncome(id: string): Promise<void> {
    await this.client.delete(`/incomes/${id}`);
  }

  async getRecurringIncomes(): Promise<IncomeDto[]> {
    const response = await this.client.get('/incomes/recurring');
    return response.data;
  }

  /** Renda mensal recorrente por responsável — base do rateio proporcional. */
  async getRecurringMonthlyIncome(): Promise<RecurringMonthlyIncomeDto[]> {
    const response = await this.client.get('/incomes/recurring/monthly');
    return response.data;
  }

  /** Composição da renda por origem. */
  async getIncomeTypeBreakdown(): Promise<IncomeTypeBreakdownDto[]> {
    const response = await this.client.get('/incomes/type-breakdown');
    return response.data;
  }

  async getIncomesByType(type: string): Promise<IncomeDto[]> {
    const response = await this.client.get(`/incomes/by-type/${type}`);
    return response.data;
  }

  async getIncomesByResponsible(responsible: string): Promise<IncomeDto[]> {
    const response = await this.client.get(`/incomes/by-responsible/${responsible}`);
    return response.data;
  }

  async getIncomesByDateRange(startDate: Date, endDate: Date): Promise<IncomeDto[]> {
    const response = await this.client.get('/incomes/by-date-range', {
      params: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
    });
    return response.data;
  }

  async getIncomesMonthlyTotal(
    month: number,
    year: number,
  ): Promise<IncomeMonthlyTotalDto> {
    const response = await this.client.get(`/incomes/monthly/${month}/${year}`);
    return response.data;
  }

  async getIncomesTotalByResponsible(
    responsible: string,
  ): Promise<IncomeTotalByResponsibleDto> {
    const response = await this.client.get(
      `/incomes/total-by-responsible/${responsible}`,
    );
    return response.data;
  }

  // ==================== Metas (goals) ====================

  async getGoals(status?: GoalStatus): Promise<GoalDto[]> {
    const response = await this.client.get('/goals', {
      params: status ? { status } : undefined,
    });
    return response.data;
  }

  async getGoalsSummary(): Promise<GoalsSummaryDto> {
    const response = await this.client.get('/goals/summary');
    return response.data;
  }

  async getGoal(id: string): Promise<GoalDto> {
    const response = await this.client.get(`/goals/${id}`);
    return response.data;
  }

  async createGoal(data: CreateGoalDto): Promise<GoalDto> {
    const response = await this.client.post('/goals', data);
    return response.data;
  }

  async updateGoal(id: string, data: UpdateGoalDto): Promise<GoalDto> {
    const response = await this.client.put(`/goals/${id}`, data);
    return response.data;
  }

  /** Registra um aporte e devolve a meta com o progresso recalculado. */
  async addGoalContribution(id: string, data: AddContributionDto): Promise<GoalDto> {
    const response = await this.client.post(`/goals/${id}/contributions`, data);
    return response.data;
  }

  /** `DELETE /goals/:id` responde 204 sem corpo. */
  async deleteGoal(id: string): Promise<void> {
    await this.client.delete(`/goals/${id}`);
  }

  // ==================== Divisão Bruno × Giovanna (split) ====================

  async getSplitSummary(period?: string): Promise<SplitSummaryDto> {
    const response = await this.client.get('/split/summary', {
      params: period ? { period } : undefined,
    });
    return response.data;
  }

  async getSplitSettlement(period?: string): Promise<SettlementDto> {
    const response = await this.client.get('/split/settlement', {
      params: period ? { period } : undefined,
    });
    return response.data;
  }

  async getSplitByCategory(period?: string): Promise<CategorySplitDto[]> {
    const response = await this.client.get('/split/by-category', {
      params: period ? { period } : undefined,
    });
    return response.data;
  }

  async getSplitRule(): Promise<SplitRuleDto> {
    const response = await this.client.get('/split/rule');
    return response.data;
  }

  async setSplitRule(data: SetSplitRuleDto): Promise<SplitRuleDto> {
    const response = await this.client.put('/split/rule', data);
    return response.data;
  }

  // ==================== Relatório Mensal (item 28) ====================

  /**
   * `POST /reports/monthly` — botão "Gerar Relatório do Mês".
   *
   * Monta o relatório, grava os arquivos em disco e devolve o registro salvo.
   * Sem `month`/`year` o backend usa o mês corrente. O timeout é maior que o
   * padrão porque a geração percorre 12 meses de histórico e escreve três
   * arquivos.
   */
  async generateMonthlyReport(
    data: GenerateMonthlyReportDto = {},
  ): Promise<MonthlyReportSummaryDto> {
    const response = await this.client.post('/reports/monthly', data, {
      timeout: 120000,
    });
    return response.data;
  }

  /**
   * `GET /reports/monthly/preview?month&year` — relatório em JSON, sem
   * persistir nem gerar arquivo. É o que a tela desenha.
   *
   * O backend exige mês e ano JUNTOS (ou nenhum dos dois): mandar só um dos
   * dois responde 400.
   */
  async previewMonthlyReport(
    month?: number,
    year?: number,
  ): Promise<MonthlyReport> {
    const response = await this.client.get('/reports/monthly/preview', {
      params:
        month !== undefined && year !== undefined ? { month, year } : undefined,
      timeout: 120000,
    });
    return response.data;
  }

  /** `GET /reports` — histórico de relatórios já gerados pela família. */
  async listMonthlyReports(
    limit = 20,
    offset = 0,
  ): Promise<ListMonthlyReportsDto> {
    const response = await this.client.get('/reports', {
      params: { limit, offset },
    });
    return response.data;
  }

  /** `GET /reports/:id` — o resumo mais o relatório consolidado gravado. */
  async getMonthlyReport(id: string): Promise<MonthlyReportDetailDto> {
    const response = await this.client.get(`/reports/${id}`);
    return response.data;
  }

  /**
   * `GET /reports/:id/download?format=pdf|xlsx|csv`
   *
   * A resposta é um ARQUIVO BINÁRIO — daí `responseType: 'blob'`. Sem isso o
   * axios trataria os bytes como texto UTF-8 e corromperia o PDF/XLSX.
   *
   * O nome do arquivo vem do `Content-Disposition`; quando o CORS não expõe
   * esse cabeçalho, `fileName` volta `null` e quem chama escolhe um nome.
   */
  async downloadMonthlyReport(
    id: string,
    format: ReportFormat,
  ): Promise<{ blob: Blob; fileName: string | null }> {
    try {
      const response = await this.client.get(`/reports/${id}/download`, {
        params: { format },
        responseType: 'blob',
        timeout: 120000,
      });

      return {
        blob: response.data as Blob,
        fileName: parseFileNameFromContentDisposition(
          response.headers?.['content-disposition'],
        ),
      };
    } catch (error) {
      // Com `responseType: 'blob'` o CORPO DO ERRO também chega como Blob, e o
      // `getApiErrorMessage` leria `{}` no lugar da explicação do backend.
      // Converter o blob de volta para JSON preserva a mensagem real.
      await hydrateBlobErrorBody(error);
      throw error;
    }
  }

  /** `DELETE /reports/:id` responde 204 sem corpo. */
  async deleteMonthlyReport(id: string): Promise<void> {
    await this.client.delete(`/reports/${id}`);
  }

  // Expenses endpoints
  async getExpenses() {
    const response = await this.client.get('/expenses');
    return response.data;
  }

  async createExpense(data: any) {
    const response = await this.client.post('/expenses', data);
    return response.data;
  }

  async getExpense(id: string) {
    const response = await this.client.get(`/expenses/${id}`);
    return response.data;
  }

  async updateExpense(id: string, data: any) {
    const response = await this.client.put(`/expenses/${id}`, data);
    return response.data;
  }

  async deleteExpense(id: string) {
    return await this.client.delete(`/expenses/${id}`);
  }

  async getExpensesByCategory(category: string) {
    const response = await this.client.get(`/expenses/by-category/${category}`);
    return response.data;
  }

  async getExpensesByResponsible(responsible: string) {
    const response = await this.client.get(`/expenses/by-responsible/${responsible}`);
    return response.data;
  }

  async getExpensesByDateRange(startDate: Date, endDate: Date) {
    const response = await this.client.get(
      `/expenses/by-date-range?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`,
    );
    return response.data;
  }

  async getExpensesMonthlyTotal(month: number, year: number) {
    const response = await this.client.get(`/expenses/monthly/${month}/${year}`);
    return response.data;
  }

  async getExpensesCategoryBreakdown() {
    const response = await this.client.get('/expenses/category-breakdown');
    return response.data;
  }

  async getExpensesRecurring() {
    const response = await this.client.get('/expenses/recurring');
    return response.data;
  }

  async getExpensesInstallments(installmentNumber?: number) {
    const url =
      installmentNumber !== undefined
        ? `/expenses/installments?installmentNumber=${installmentNumber}`
        : '/expenses/installments';
    const response = await this.client.get(url);
    return response.data;
  }

  async getExpensesDailyAverage(days: number = 30) {
    const response = await this.client.get(`/expenses/daily-average?days=${days}`);
    return response.data;
  }

  async getExpensesTotalByCategory(category: string) {
    const response = await this.client.get(`/expenses/total-by-category/${category}`);
    return response.data;
  }

  async getExpensesTotalByResponsible(responsible: string) {
    const response = await this.client.get(
      `/expenses/total-by-responsible/${responsible}`,
    );
    return response.data;
  }

  /**
   * Encerra ou retoma a recorrência de uma despesa.
   *
   * Cancelar não apaga a despesa — ela continua sendo um gasto realizado. O que
   * termina é a projeção dos meses seguintes.
   */
  async setExpenseRecurrence(id: string, active: boolean) {
    const response = await this.client.patch(`/expenses/${id}/recurrence`, {
      active,
    });
    return response.data;
  }

  /** Marca ou desmarca uma despesa como paga. */
  async setExpensePaid(id: string, isPaid: boolean) {
    const response = await this.client.patch(`/expenses/${id}/pay`, { isPaid });
    return response.data;
  }

  /** Quantas contas a casa pagou no mês, e quanto somaram. */
  async getExpensesPaidSummary(
    month: number,
    year: number,
  ): Promise<{ count: number; total: number }> {
    const response = await this.client.get('/expenses/paid-summary', {
      params: { month, year },
    });
    return response.data;
  }

  // Cash flow endpoints
  //
  // Estes métodos existem porque o hook do Fluxo de Caixa chamava `fetch`
  // direto com `credentials: 'include'` — cookie, que esta API não usa. Sem o
  // header `Authorization`, toda chamada voltava 401 e a tela exibia
  // "Failed to fetch cash flow: Unauthorized".
  async getCashFlowMonth(month: number, year: number) {
    const response = await this.client.get(`/cash-flow/${month}/${year}`);
    return response.data;
  }

  async getCashFlowSummary() {
    const response = await this.client.get('/cash-flow/summary/current');
    return response.data;
  }

  async getCashFlowBestDay(data: {
    desiredAmount: number;
    startDate?: string;
    endDate?: string;
    minimumBalanceThreshold?: number;
    onlyLowRisk?: boolean;
  }) {
    const response = await this.client.post('/cash-flow/best-day', data);
    return response.data;
  }

  // AI Assistant (chat) endpoints
  async sendAiChatMessage(data: SendChatMessageDto): Promise<ChatMessageResponseDto> {
    const response = await this.client.post('/ai/chat', data);
    return response.data;
  }

  async getAiChatHistory(params?: GetChatHistoryDto): Promise<ListChatHistoryDto> {
    const response = await this.client.get('/ai/chat/history', { params });
    return response.data;
  }

  async getAiChatSuggestions(): Promise<ChatSuggestionsDto> {
    const response = await this.client.get('/ai/chat/suggestions');
    return response.data;
  }

  async deleteAiChatMessage(messageId: string) {
    return await this.client.delete(`/ai/chat/history/${messageId}`);
  }

  async clearAiChatHistory() {
    return await this.client.post('/ai/chat/clear-history');
  }

  // AI Recommendations endpoints
  async getAiRecommendations(
    params?: GetRecommendationsDto,
  ): Promise<ListRecommendationsDto> {
    const response = await this.client.get('/recommendations', { params });
    return response.data;
  }

  async getAiHighPriorityRecommendations(limit?: number): Promise<ListRecommendationsDto> {
    const response = await this.client.get('/recommendations/high-priority', {
      params: { limit },
    });
    return response.data;
  }

  async getAiRecommendationsImpactEstimate(): Promise<RecommendationImpactEstimateDto> {
    const response = await this.client.get('/recommendations/impact-estimate');
    return response.data;
  }

  async getAiRecommendation(recommendationId: string): Promise<RecommendationDto> {
    const response = await this.client.get(`/recommendations/${recommendationId}`);
    return response.data;
  }

  async updateAiRecommendation(
    recommendationId: string,
    data: UpdateRecommendationDto,
  ): Promise<RecommendationDto> {
    const response = await this.client.patch(
      `/recommendations/${recommendationId}`,
      data,
    );
    return response.data;
  }

  async applyAiRecommendation(
    recommendationId: string,
    data: ApplyRecommendationDto = {},
  ): Promise<RecommendationActionResultDto> {
    const response = await this.client.post(
      `/recommendations/${recommendationId}/apply`,
      data,
    );
    return response.data;
  }

  async regenerateAiRecommendations() {
    const response = await this.client.post('/recommendations/regenerate');
    return response.data;
  }

  // AI Behavior analysis endpoints
  async getAiBehaviorAnalysis(period?: string): Promise<BehaviorAnalysisResponseDto> {
    const response = await this.client.get('/analysis/behavior', {
      params: { period },
    });
    return response.data;
  }

  async getAiAnomalies(params?: GetAnomaliesDto): Promise<ListAnomaliesDto> {
    const response = await this.client.get('/analysis/anomalies', { params });
    return response.data;
  }

  async getAiAnomaly(anomalyId: string): Promise<AiAnomalyDto | null> {
    const response = await this.client.get(`/analysis/anomalies/${anomalyId}`);
    return response.data;
  }

  async confirmAiAnomaly(
    anomalyId: string,
    data: ConfirmAnomalyDto,
  ): Promise<AiAnomalyDto | null> {
    const response = await this.client.patch(
      `/analysis/anomalies/${anomalyId}/confirm`,
      data,
    );
    return response.data;
  }

  async getAiPatterns(params?: GetPatternsDto): Promise<ListPatternsDto> {
    const response = await this.client.get('/analysis/patterns', { params });
    return response.data;
  }

  async getAiCorrelations(params?: GetCorrelationsDto): Promise<ListCorrelationsDto> {
    const response = await this.client.get('/analysis/correlations', { params });
    return response.data;
  }

  async getAiSpendingProfile(period?: string): Promise<SpendingProfileDto> {
    const response = await this.client.get('/analysis/spending-profile', {
      params: { period },
    });
    return response.data;
  }

  async getAiInsights(): Promise<AiInsightsDto> {
    const response = await this.client.get('/analysis/insights');
    return response.data;
  }

  // AI Forecasts endpoints
  async getAiForecast30Days(): Promise<ForecastResponseDto> {
    const response = await this.client.get('/forecasts/next-30-days');
    return response.data;
  }

  async getAiForecast90Days(): Promise<ForecastResponseDto> {
    const response = await this.client.get('/forecasts/next-90-days');
    return response.data;
  }

  async getAiForecast180Days(): Promise<ForecastResponseDto> {
    const response = await this.client.get('/forecasts/next-180-days');
    return response.data;
  }

  async getAiForecast365Days(): Promise<ForecastResponseDto> {
    const response = await this.client.get('/forecasts/next-365-days');
    return response.data;
  }

  async getAiForecastByCategory(
    params?: GetCategoryForecastsDto,
  ): Promise<ListCategoryForecastsDto> {
    const response = await this.client.get('/forecasts/by-category', { params });
    return response.data;
  }

  async getAiForecastScenarios(period?: string): Promise<ForecastScenariosDto> {
    const response = await this.client.get('/forecasts/scenarios', {
      params: { period },
    });
    return response.data;
  }

  async getAiBalanceProjection(
    period?: string,
    includeRisk: boolean = true,
  ): Promise<BalanceProjectionResponseDto> {
    const response = await this.client.get('/forecasts/balance-projection', {
      params: { period, includeRisk },
    });
    return response.data;
  }

  async getAiForecastDetails(period?: string): Promise<ForecastDetailsDto> {
    const response = await this.client.get('/forecasts/details', {
      params: { period },
    });
    return response.data;
  }

  async getAiForecastAccuracyComparison(
    limit?: number,
  ): Promise<ListForecastComparisonsDto> {
    const response = await this.client.get('/forecasts/accuracy-comparison', {
      params: { limit },
    });
    return response.data;
  }

  async getAiForecastByCategoryId(
    categoryId: string,
    period?: string,
  ): Promise<ForecastResponseDto> {
    const response = await this.client.get(`/forecasts/${categoryId}`, {
      params: { period },
    });
    return response.data;
  }

  async regenerateAiForecasts() {
    const response = await this.client.get('/forecasts/regenerate');
    return response.data;
  }

  // Families endpoints
  async createFamily(data: CreateFamilyDto): Promise<FamilyDto> {
    const response = await this.client.post('/families', data);
    return response.data;
  }

  async getMyFamily(): Promise<FamilyDto> {
    const response = await this.client.get('/families/me');
    return response.data;
  }

  async getFamily(familyId: string): Promise<FamilyDto> {
    const response = await this.client.get(`/families/${familyId}`);
    return response.data;
  }

  async updateFamily(familyId: string, data: UpdateFamilyDto): Promise<FamilyDto> {
    const response = await this.client.patch(`/families/${familyId}`, data);
    return response.data;
  }

  async getFamilyMembers(familyId: string): Promise<FamilyMemberDto[]> {
    const response = await this.client.get(`/families/${familyId}/members`);
    return response.data;
  }

  async addFamilyMember(
    familyId: string,
    data: AddFamilyMemberDto,
  ): Promise<FamilyMemberDto> {
    const response = await this.client.post(`/families/${familyId}/members`, data);
    return response.data;
  }

  async removeFamilyMember(familyId: string, memberId: string): Promise<void> {
    await this.client.delete(`/families/${familyId}/members/${memberId}`);
  }

  /**
   * Entra na família de outra pessoa pelo e-mail dela.
   *
   * É o caminho para juntar duas contas criadas separadamente — cada cadastro
   * novo nasce com a própria família, e sem este endpoint não havia como
   * fundi-las pela interface.
   */
  async joinFamily(email: string): Promise<FamilyDto> {
    const response = await this.client.post('/families/join', { email });
    return response.data;
  }

  /**
   * Dispara a varredura de anomalias do período.
   * `getAiAnomalies` apenas lista o que já foi detectado.
   */
  async detectAnomalies(period?: string): Promise<DetectAnomaliesResultDto> {
    const response = await this.client.post('/analysis/anomalies/detect', undefined, {
      params: { period },
    });
    return response.data;
  }

  // Generic methods for extensibility
  async get(url: string, config?: any) {
    const response = await this.client.get(url, config);
    return response.data;
  }

  async post(url: string, data?: any, config?: any) {
    const response = await this.client.post(url, data, config);
    return response.data;
  }

  async put(url: string, data?: any, config?: any) {
    const response = await this.client.put(url, data, config);
    return response.data;
  }

  async patch(url: string, data?: any, config?: any) {
    const response = await this.client.patch(url, data, config);
    return response.data;
  }

  async delete(url: string, config?: any) {
    const response = await this.client.delete(url, config);
    return response.data;
  }
}

export const apiClient = new ApiClient();
