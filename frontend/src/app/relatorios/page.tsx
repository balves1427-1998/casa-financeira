'use client';

import { ReactNode, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useMonthlyReport } from '@/hooks/useMonthlyReport';
import {
  ALERT_SEVERITY_LABELS,
  AlertLine,
  BUDGET_STATUS_LABELS,
  CategoryLine,
  MONTH_OPTIONS,
  MonthlyReportSummaryDto,
  PlannedAccountsGroup,
  REPORT_FORMATS,
  REPORT_FORMAT_LABELS,
  REPORT_STATUS_LABELS,
  ReportFormat,
  Variation,
  formatFileSize,
  formatMonthLabel,
  formatResponsibleName,
} from '@/types/report';
import { formatBRL, formatDateBR, formatDateTime, formatPercent } from '@/utils/format';
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Check,
  CreditCard,
  Download,
  FileSpreadsheet,
  FileText,
  Home,
  Info,
  Lightbulb,
  Loader2,
  Minus,
  PiggyBank,
  Scale,
  Target,
  Trash2,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react';

/**
 * Paleta categórica dos gráficos.
 * Passos escuros pensados para a superfície escura — não são inversões.
 */
const CHART_PALETTE = [
  '#2a78d6',
  '#eb6834',
  '#3f9e6b',
  '#a05fd1',
  '#fab219',
  '#d03b3b',
  '#0e9aa7',
  '#8c6d4a',
  '#c2417f',
  '#6b7280',
];

/** Cinza neutro dos eixos: legível no tema claro e no escuro. */
const AXIS_COLOR = '#9ca3af';

/** Categorias desenhadas na pizza antes de agrupar o resto em "Outras". */
const MAX_FATIAS = 8;

const FORMAT_ICONS: Record<ReportFormat, typeof FileText> = {
  pdf: FileText,
  xlsx: FileSpreadsheet,
  csv: Download,
};

/** Anos oferecidos no seletor: cinco para trás e um para frente. */
function anosDisponiveis(): number[] {
  const atual = new Date().getFullYear();
  const anos: number[] = [];
  for (let ano = atual + 1; ano >= atual - 5; ano -= 1) {
    anos.push(ano);
  }
  return anos;
}

/** Percentual de variação — `null` significa "sem base", nunca 0% ou 100%. */
function textoVariacaoPercentual(percent: number | null): string {
  if (percent === null || percent === undefined) {
    return 'sem base';
  }
  const sinal = percent > 0 ? '+' : '';
  return `${sinal}${formatPercent(percent)}`;
}

/**
 * Selo de variação em relação ao mês anterior.
 *
 * `positiveIsGood` inverte as cores: receita subindo é bom, despesa subindo
 * não é. Quando o backend não conseguiu calcular o percentual (mês anterior
 * zerado), o selo diz "sem base" — jamais 100%.
 */
function VariationBadge({
  variation,
  positiveIsGood = true,
}: {
  variation: Variation;
  positiveIsGood?: boolean;
}) {
  const subiu = variation.direction === 'up';
  const desceu = variation.direction === 'down';
  const bom = (subiu && positiveIsGood) || (desceu && !positiveIsGood);
  const ruim = (subiu && !positiveIsGood) || (desceu && positiveIsGood);

  const cor = bom
    ? 'text-green-600 dark:text-green-400'
    : ruim
      ? 'text-red-600 dark:text-red-400'
      : 'text-gray-600 dark:text-gray-400';

  const Icone = subiu ? ArrowUpRight : desceu ? ArrowDownRight : Minus;

  return (
    <span className={`inline-flex items-center gap-1 text-sm font-medium ${cor}`}>
      <Icone className="w-4 h-4" />
      {formatBRL(Math.abs(variation.absolute))}
      <span className="text-xs font-normal">
        ({textoVariacaoPercentual(variation.percent)})
      </span>
    </span>
  );
}

/** Cartão de indicador do resumo. */
function IndicatorCard({
  label,
  value,
  hint,
  accent = 'text-gray-900 dark:text-white',
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
      <p className="text-xs text-gray-600 dark:text-gray-400">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${accent}`}>{value}</p>
      {hint && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{hint}</p>
      )}
    </div>
  );
}

/** Bloco de uma seção do relatório. */
function Section({
  title,
  icon,
  subtitle,
  children,
}: {
  title: string;
  icon?: ReactNode;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
        {icon}
        {title}
      </h2>
      {subtitle && (
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{subtitle}</p>
      )}
      <div className="mt-4">{children}</div>
    </div>
  );
}

/** Aviso de seção indisponível — o motivo vem do backend, não é inventado. */
function UnavailableNotice({ notice }: { notice: string | null }) {
  return (
    <div className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/20 p-4 flex items-start gap-3">
      <Info className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
      <p className="text-sm text-amber-800 dark:text-amber-200">
        {notice ||
          'Esta seção não se aplica ao período escolhido e por isso não foi calculada.'}
      </p>
    </div>
  );
}

/** Grupo de contas planejadas (pagas, pendentes, vencidas, canceladas). */
function PlannedGroup({
  title,
  group,
  tone,
}: {
  title: string;
  group: PlannedAccountsGroup;
  tone: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          {title}
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {group.count} {group.count === 1 ? 'conta' : 'contas'}
        </span>
      </div>
      <p className={`text-xl font-bold mt-1 ${tone}`}>{formatBRL(group.total)}</p>

      {group.items.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {group.items.slice(0, 6).map(item => (
            <li
              key={item.id}
              className="flex items-baseline justify-between gap-3 text-xs"
            >
              <span className="text-gray-700 dark:text-gray-300 truncate">
                {item.description}
                <span className="text-gray-500 dark:text-gray-400">
                  {' '}
                  · {formatDateBR(item.dueDate)}
                </span>
              </span>
              <span className="font-medium text-gray-900 dark:text-white flex-shrink-0">
                {formatBRL(item.amount)}
              </span>
            </li>
          ))}
          {group.items.length > 6 && (
            <li className="text-xs text-gray-500 dark:text-gray-400">
              e mais {group.items.length - 6}…
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

/** Cor do alerta conforme a severidade devolvida pelo backend. */
function alertaClasses(severity: AlertLine['severity']): string {
  if (severity === 'critical') {
    return 'border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/20 text-red-900 dark:text-red-100';
  }
  if (severity === 'warning') {
    return 'border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-100';
  }
  return 'border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/20 text-blue-900 dark:text-blue-100';
}

export default function RelatoriosPage() {
  const {
    preview,
    history,
    historyTotal,
    month,
    year,
    isLoading,
    isGenerating,
    isDeleting,
    downloadingKey,
    error,
    fetchPreview,
    generateReport,
    downloadReport,
    deleteReport,
    clearError,
  } = useMonthlyReport();

  // Seletor: só vira a competência do relatório quando o usuário confirma.
  const [mesSelecionado, setMesSelecionado] = useState(month);
  const [anoSelecionado, setAnoSelecionado] = useState(year);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [confirmingDeletionId, setConfirmingDeletionId] = useState<string | null>(null);

  const anos = useMemo(() => anosDisponiveis(), []);

  /**
   * Relatório JÁ GERADO para a competência em tela.
   *
   * A pré-visualização não grava arquivo nenhum: sem um relatório gerado não
   * existe PDF/XLSX/CSV para baixar, e os botões precisam dizer isso em vez de
   * falhar no clique.
   */
  const relatorioGerado: MonthlyReportSummaryDto | undefined = useMemo(
    () =>
      history.find(
        item => item.month === month && item.year === year && item.status === 'ready',
      ),
    [history, month, year],
  );

  const formatosDisponiveis = useMemo(
    () => new Set((relatorioGerado?.files || []).map(file => file.format)),
    [relatorioGerado],
  );

  const handleVerRelatorio = async () => {
    setFeedback(null);
    try {
      await fetchPreview(mesSelecionado, anoSelecionado);
    } catch {
      // A mensagem do backend já é exibida pelo estado do hook
    }
  };

  const handleGerar = async () => {
    setFeedback(null);
    try {
      await generateReport(mesSelecionado, anoSelecionado);
      // A pré-visualização é recarregada porque o relatório gravado e o que
      // está na tela precisam ser o mesmo número.
      await fetchPreview(mesSelecionado, anoSelecionado).catch(() => undefined);
      setFeedback(
        `Relatório de ${formatMonthLabel(mesSelecionado, anoSelecionado)} gerado. ` +
          'Os arquivos PDF, Excel e CSV já estão disponíveis para download.',
      );
    } catch {
      // A mensagem do backend já é exibida pelo estado do hook
    }
  };

  const handleDownload = async (
    id: string,
    formato: ReportFormat,
    fallbackName?: string,
  ) => {
    setFeedback(null);
    try {
      await downloadReport(id, formato, fallbackName);
    } catch {
      // A mensagem do backend já é exibida pelo estado do hook
    }
  };

  const handleDelete = async (id: string) => {
    setFeedback(null);
    try {
      await deleteReport(id);
      setConfirmingDeletionId(null);
      setFeedback('Relatório excluído do histórico.');
    } catch {
      // A mensagem do backend já é exibida pelo estado do hook
    }
  };

  // ==================== dados dos gráficos ====================

  /** Pizza de categorias: as maiores, com o restante agrupado em "Outras". */
  const dadosPizza = useMemo(() => {
    const positivas = (preview?.byCategory || []).filter(item => item.total > 0);
    if (positivas.length === 0) return [];

    const principais = positivas.slice(0, MAX_FATIAS);
    const resto = positivas.slice(MAX_FATIAS);
    const dados = principais.map(item => ({
      name: item.category,
      value: item.total,
    }));

    if (resto.length > 0) {
      dados.push({
        name: `Outras (${resto.length})`,
        value: resto.reduce((soma, item) => soma + item.total, 0),
      });
    }

    return dados;
  }, [preview]);

  /** Barras: receita × despesa do mês anterior contra o mês do relatório. */
  const dadosBarras = useMemo(() => {
    if (!preview) return [];
    return [
      {
        name: preview.comparison.previousLabel,
        Receitas: preview.comparison.income.previous,
        Despesas: preview.comparison.expenses.previous,
      },
      {
        name: preview.period.label,
        Receitas: preview.comparison.income.current,
        Despesas: preview.comparison.expenses.current,
      },
    ];
  }, [preview]);

  const dadosLinha = useMemo(
    () =>
      (preview?.netWorth.points || []).map(ponto => ({
        name: ponto.label,
        Acumulado: ponto.accumulated,
        Resultado: ponto.net,
      })),
    [preview],
  );

  const semLancamentos = preview !== null && !preview.hasData;

  return (
    <div className="max-w-6xl mx-auto p-6 md:p-8 space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <FileText className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
            Relatório Mensal
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            O fechamento do mês da casa: receitas, despesas, contas, cartões,
            parcelamentos, metas, alertas e o que dá para economizar.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center gap-2"
        >
          <Home className="w-4 h-4" />
          Voltar ao painel
        </Link>
      </div>

      {/* Erro da API */}
      {error && (
        <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/20 p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold text-red-900 dark:text-red-100">
              Não foi possível concluir a operação
            </h3>
            <p className="text-sm text-red-800 dark:text-red-200 mt-1">{error}</p>
          </div>
          <button
            onClick={clearError}
            aria-label="Fechar aviso de erro"
            className="text-red-600 dark:text-red-300 hover:text-red-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Confirmação de sucesso */}
      {feedback && (
        <div className="rounded-lg border border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/20 p-4 flex items-start gap-3">
          <Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-green-800 dark:text-green-200 flex-1">{feedback}</p>
          <button
            onClick={() => setFeedback(null)}
            aria-label="Fechar aviso de sucesso"
            className="text-green-700 dark:text-green-300 hover:text-green-900"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Competência + geração */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label
              htmlFor="relatorio-mes"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Mês
            </label>
            <select
              id="relatorio-mes"
              value={mesSelecionado}
              onChange={event => setMesSelecionado(Number(event.target.value))}
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {MONTH_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="relatorio-ano"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Ano
            </label>
            <select
              id="relatorio-ano"
              value={anoSelecionado}
              onChange={event => setAnoSelecionado(Number(event.target.value))}
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {anos.map(ano => (
                <option key={ano} value={ano}>
                  {ano}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleVerRelatorio}
            disabled={isLoading || isGenerating}
            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ArrowRight className="w-4 h-4" />
            )}
            Ver o mês
          </button>

          <button
            onClick={handleGerar}
            disabled={isGenerating || isLoading}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors flex items-center gap-2"
          >
            {isGenerating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FileText className="w-4 h-4" />
            )}
            Gerar Relatório do Mês
          </button>
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
          &ldquo;Ver o mês&rdquo; apenas exibe o relatório na tela, sem gravar nada.
          &ldquo;Gerar Relatório do Mês&rdquo; salva o relatório no histórico e produz os
          arquivos PDF, Excel e CSV.
        </p>

        {/* Downloads */}
        <div className="mt-5 pt-5 border-t border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
            Baixar o relatório de {formatMonthLabel(month, year)}
          </h3>

          {relatorioGerado ? (
            <div className="flex flex-wrap gap-2">
              {REPORT_FORMATS.map(formato => {
                const arquivo = relatorioGerado.files.find(
                  file => file.format === formato,
                );
                const Icone = FORMAT_ICONS[formato];
                const baixando = downloadingKey === `${relatorioGerado.id}:${formato}`;
                const indisponivel = !formatosDisponiveis.has(formato);

                return (
                  <button
                    key={formato}
                    onClick={() =>
                      handleDownload(relatorioGerado.id, formato, arquivo?.fileName)
                    }
                    disabled={indisponivel || baixando}
                    title={
                      indisponivel
                        ? `Este relatório não foi exportado em ${REPORT_FORMAT_LABELS[formato]}.`
                        : undefined
                    }
                    className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                  >
                    {baixando ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Icone className="w-4 h-4" />
                    )}
                    {REPORT_FORMAT_LABELS[formato]}
                    {arquivo && (
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {formatFileSize(arquivo.size)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Ainda não há arquivos para {formatMonthLabel(month, year)}. Clique em{' '}
              <strong>Gerar Relatório do Mês</strong> para produzir o PDF, o Excel e o
              CSV desta competência.
            </p>
          )}
        </div>
      </div>

      {/* Carregando a primeira vez */}
      {isLoading && !preview && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-6 w-1/3 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded" />
          </div>
        </div>
      )}

      {preview && (
        <>
          {/*
            SEM LANÇAMENTOS NO MÊS — regra 27 do projeto.
            Os totais abaixo são zero porque não existe dado no período, e não
            porque o mês fechou zerado. A tela precisa dizer isso antes de
            mostrar qualquer número.
          */}
          {semLancamentos && (
            <div className="rounded-lg border-2 border-amber-400 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 p-4 flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-amber-900 dark:text-amber-100">
                  Ainda não há lançamentos em {formatMonthLabel(month, year)}
                </h3>
                <p className="text-sm text-amber-800 dark:text-amber-200 mt-1">
                  Nenhuma receita e nenhuma despesa foram registradas nesta
                  competência. Os valores exibidos abaixo são zero por ausência de
                  dados — nada foi estimado nem projetado.
                </p>
                <p className="text-sm text-amber-800 dark:text-amber-200 mt-2">
                  Registre lançamentos em{' '}
                  <Link href="/receitas" className="underline font-medium">
                    Receitas
                  </Link>{' '}
                  ou{' '}
                  <Link href="/despesas" className="underline font-medium">
                    Despesas
                  </Link>{' '}
                  para que o relatório passe a ter conteúdo.
                </p>
              </div>
            </div>
          )}

          {/* Avisos do backend */}
          {preview.notices.length > 0 && (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4 flex items-start gap-3">
              <Info className="w-5 h-5 text-gray-500 dark:text-gray-400 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
                  O que não pôde ser calculado
                </h3>
                <ul className="space-y-1 text-sm text-gray-700 dark:text-gray-300 list-disc list-inside">
                  {preview.notices.map(aviso => (
                    <li key={aviso}>{aviso}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* ==================== Resumo ==================== */}
          <Section
            title={`Resumo de ${preview.period.label}`}
            icon={<Wallet className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />}
            subtitle={`Relatório montado em ${formatDateTime(preview.generatedAt)} · ${
              preview.period.days
            } dias no período · ${preview.overview.transactionCount} ${
              preview.overview.transactionCount === 1 ? 'lançamento' : 'lançamentos'
            }`}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <IndicatorCard
                label="Receitas do mês"
                value={formatBRL(preview.overview.totalIncome)}
                hint={`${preview.overview.incomeCount} ${
                  preview.overview.incomeCount === 1 ? 'entrada' : 'entradas'
                }`}
                accent="text-green-600 dark:text-green-400"
              />
              <IndicatorCard
                label="Despesas do mês"
                value={formatBRL(preview.overview.totalExpenses)}
                hint={`${preview.overview.expenseCount} ${
                  preview.overview.expenseCount === 1 ? 'saída' : 'saídas'
                }`}
                accent="text-red-600 dark:text-red-400"
              />
              <IndicatorCard
                label="Resultado do mês"
                value={formatBRL(preview.overview.balance)}
                hint="Receitas menos despesas do período"
                accent={
                  preview.overview.balance >= 0
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400'
                }
              />
              <IndicatorCard
                label="Taxa de poupança"
                value={
                  preview.overview.savingsRate === null
                    ? 'Sem receita no mês'
                    : formatPercent(preview.overview.savingsRate)
                }
                hint={
                  preview.overview.savingsRate === null
                    ? 'Não houve receita registrada — não há percentual a calcular.'
                    : 'Percentual da receita que sobrou'
                }
              />
              <IndicatorCard
                label="Média diária de gastos"
                value={formatBRL(preview.overview.averageDailyExpense)}
                hint={`Despesas ÷ ${preview.period.days} dias`}
              />
              <IndicatorCard
                label="Saldo atual das contas"
                value={formatBRL(preview.overview.currentBalance)}
                hint="Consolidado hoje — não é o saldo do mês fechado"
              />
            </div>

            {(preview.overview.highestExpense !== null ||
              preview.overview.lowestExpense !== null) && (
              <div className="mt-4 rounded-lg bg-gray-50 dark:bg-gray-800/50 p-4 flex flex-wrap gap-6 text-sm">
                <span className="text-gray-700 dark:text-gray-300">
                  Maior despesa individual:{' '}
                  <strong className="text-gray-900 dark:text-white">
                    {preview.overview.highestExpense === null
                      ? 'sem despesas no mês'
                      : formatBRL(preview.overview.highestExpense)}
                  </strong>
                </span>
                <span className="text-gray-700 dark:text-gray-300">
                  Menor despesa individual:{' '}
                  <strong className="text-gray-900 dark:text-white">
                    {preview.overview.lowestExpense === null
                      ? 'sem despesas no mês'
                      : formatBRL(preview.overview.lowestExpense)}
                  </strong>
                </span>
              </div>
            )}
          </Section>

          {/* ==================== Comparação com o mês anterior ==================== */}
          <Section
            title={`Comparação com ${preview.comparison.previousLabel}`}
            icon={<TrendingUp className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />}
            subtitle={
              preview.comparison.previousHasData
                ? 'Variação absoluta e percentual entre as duas competências.'
                : `Não há lançamentos em ${preview.comparison.previousLabel}: as variações percentuais aparecem como "sem base".`
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-2 px-3 font-medium text-gray-600 dark:text-gray-400">
                      Indicador
                    </th>
                    <th className="text-right py-2 px-3 font-medium text-gray-600 dark:text-gray-400">
                      {preview.comparison.previousLabel}
                    </th>
                    <th className="text-right py-2 px-3 font-medium text-gray-600 dark:text-gray-400">
                      {preview.period.label}
                    </th>
                    <th className="text-right py-2 px-3 font-medium text-gray-600 dark:text-gray-400">
                      Variação
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      ['Receitas', preview.comparison.income, true],
                      ['Despesas', preview.comparison.expenses, false],
                      ['Resultado', preview.comparison.balance, true],
                      ['Gastos no cartão', preview.comparison.creditCard, false],
                    ] as Array<[string, Variation, boolean]>
                  ).map(([rotulo, variacao, positivoBom]) => (
                    <tr
                      key={rotulo}
                      className="border-b border-gray-100 dark:border-gray-800"
                    >
                      <td className="py-2 px-3 font-medium text-gray-900 dark:text-white">
                        {rotulo}
                      </td>
                      <td className="py-2 px-3 text-right text-gray-700 dark:text-gray-300">
                        {formatBRL(variacao.previous)}
                      </td>
                      <td className="py-2 px-3 text-right text-gray-700 dark:text-gray-300">
                        {formatBRL(variacao.current)}
                      </td>
                      <td className="py-2 px-3 text-right">
                        <VariationBadge
                          variation={variacao}
                          positiveIsGood={positivoBom}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Gráfico de barras: receita × despesa nas duas competências */}
            {dadosBarras.length > 0 && (
              <div className="h-64 w-full mt-6">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dadosBarras}>
                    <CartesianGrid strokeDasharray="3 3" stroke={AXIS_COLOR} opacity={0.3} />
                    <XAxis dataKey="name" stroke={AXIS_COLOR} fontSize={12} />
                    <YAxis stroke={AXIS_COLOR} fontSize={12} width={80} />
                    <Tooltip
                      formatter={(value: number | string) => formatBRL(Number(value))}
                    />
                    <Legend verticalAlign="bottom" height={24} />
                    <Bar dataKey="Receitas" fill="#3f9e6b" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Despesas" fill="#d03b3b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Categorias que mais subiram e que mais caíram */}
            {(preview.comparison.biggestIncreases.length > 0 ||
              preview.comparison.biggestDecreases.length > 0) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                {(
                  [
                    ['Categorias que mais subiram', preview.comparison.biggestIncreases],
                    ['Categorias que mais caíram', preview.comparison.biggestDecreases],
                  ] as Array<[string, CategoryLine[]]>
                ).map(([titulo, linhas]) => (
                  <div
                    key={titulo}
                    className="rounded-lg border border-gray-200 dark:border-gray-700 p-4"
                  >
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                      {titulo}
                    </h3>
                    {linhas.length === 0 ? (
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Nenhuma categoria nesta situação.
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {linhas.map(linha => (
                          <li
                            key={linha.category}
                            className="flex items-baseline justify-between gap-3 text-sm"
                          >
                            <span className="text-gray-700 dark:text-gray-300 truncate">
                              {linha.category}
                            </span>
                            <span
                              className={`flex-shrink-0 font-medium ${
                                linha.variationAbsolute > 0
                                  ? 'text-red-600 dark:text-red-400'
                                  : 'text-green-600 dark:text-green-400'
                              }`}
                            >
                              {linha.variationAbsolute > 0 ? '+' : '−'}
                              {formatBRL(Math.abs(linha.variationAbsolute))}
                              <span className="ml-1 text-xs font-normal text-gray-500 dark:text-gray-400">
                                ({textoVariacaoPercentual(linha.variationPercent)})
                              </span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* ==================== Gastos por categoria ==================== */}
          <Section
            title="Gastos por categoria"
            icon={<PiggyBank className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />}
            subtitle="Cada categoria comparada com a mesma categoria no mês anterior."
          >
            {preview.byCategory.length === 0 ? (
              <p className="text-sm text-gray-600 dark:text-gray-400 py-4">
                Nenhuma despesa registrada em {formatMonthLabel(month, year)} — não há
                categorias a exibir.
              </p>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                {dadosPizza.length > 0 && (
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={dadosPizza}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={55}
                          outerRadius={95}
                          paddingAngle={2}
                        >
                          {dadosPizza.map((entry, index) => (
                            <Cell
                              key={entry.name}
                              fill={CHART_PALETTE[index % CHART_PALETTE.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value: number | string) => formatBRL(Number(value))}
                        />
                        <Legend verticalAlign="bottom" height={36} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        <th className="text-left py-2 px-3 font-medium text-gray-600 dark:text-gray-400">
                          Categoria
                        </th>
                        <th className="text-right py-2 px-3 font-medium text-gray-600 dark:text-gray-400">
                          Total
                        </th>
                        <th className="text-right py-2 px-3 font-medium text-gray-600 dark:text-gray-400">
                          Fatia
                        </th>
                        <th className="text-right py-2 px-3 font-medium text-gray-600 dark:text-gray-400">
                          vs. mês anterior
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.byCategory.map(linha => (
                        <tr
                          key={linha.category}
                          className="border-b border-gray-100 dark:border-gray-800"
                        >
                          <td className="py-2 px-3">
                            <span className="font-medium text-gray-900 dark:text-white">
                              {linha.category}
                            </span>
                            <span className="block text-xs text-gray-500 dark:text-gray-400">
                              {linha.count}{' '}
                              {linha.count === 1 ? 'lançamento' : 'lançamentos'} · média{' '}
                              {formatBRL(linha.average)}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right text-gray-900 dark:text-white font-medium">
                            {formatBRL(linha.total)}
                          </td>
                          <td className="py-2 px-3 text-right text-gray-700 dark:text-gray-300">
                            {formatPercent(linha.share)}
                          </td>
                          <td
                            className={`py-2 px-3 text-right ${
                              linha.variationAbsolute > 0
                                ? 'text-red-600 dark:text-red-400'
                                : linha.variationAbsolute < 0
                                  ? 'text-green-600 dark:text-green-400'
                                  : 'text-gray-600 dark:text-gray-400'
                            }`}
                          >
                            {formatBRL(linha.variationAbsolute)}
                            <span className="block text-xs text-gray-500 dark:text-gray-400">
                              {textoVariacaoPercentual(linha.variationPercent)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Section>

          {/* ==================== Gastos por responsável ==================== */}
          <Section
            title="Gastos por responsável"
            icon={<Scale className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />}
          >
            {preview.byResponsible.length === 0 ? (
              <p className="text-sm text-gray-600 dark:text-gray-400 py-4">
                Nenhuma despesa atribuída a um responsável nesta competência.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {preview.byResponsible.map(linha => (
                  <div
                    key={linha.responsible}
                    className="rounded-lg border border-gray-200 dark:border-gray-700 p-4"
                  >
                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      {formatResponsibleName(linha.responsible)}
                    </p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                      {formatBRL(linha.total)}
                    </p>
                    <div className="mt-3 h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                      <div
                        className="h-full bg-indigo-500"
                        style={{
                          width: `${Math.min(Math.max(linha.share, 0), 100)}%`,
                        }}
                      />
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
                      {formatPercent(linha.share)} do total · {linha.count}{' '}
                      {linha.count === 1 ? 'lançamento' : 'lançamentos'}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Mês anterior: {formatBRL(linha.previousTotal)} (
                      {textoVariacaoPercentual(linha.variationPercent)})
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* ==================== Divisão Bruno × Giovanna ==================== */}
          <Section
            title="Divisão entre os responsáveis"
            icon={<Scale className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />}
            subtitle={preview.split.criteria || undefined}
          >
            {!preview.split.available ? (
              <UnavailableNotice notice={preview.split.notice} />
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {preview.split.participants.map(participante => (
                    <div
                      key={participante.responsible}
                      className="rounded-lg border border-gray-200 dark:border-gray-700 p-4"
                    >
                      <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                        {formatResponsibleName(participante.responsible)}
                      </p>
                      <p className="text-xl font-bold text-gray-900 dark:text-white mt-1">
                        {formatBRL(participante.paid)}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {formatPercent(participante.sharePercent)} do total de{' '}
                        {formatBRL(preview.split.totalPaid)}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="mt-4 rounded-lg bg-gray-50 dark:bg-gray-800/50 p-4">
                  {preview.split.difference ? (
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      <strong>
                        {formatResponsibleName(preview.split.difference.paidMore)}
                      </strong>{' '}
                      desembolsou{' '}
                      <strong>{formatBRL(preview.split.difference.amount)}</strong> a mais
                      que{' '}
                      <strong>
                        {formatResponsibleName(preview.split.difference.paidLess)}
                      </strong>
                      .
                    </p>
                  ) : (
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      Não há dois responsáveis com despesas nesta competência — não existe
                      diferença a comparar.
                    </p>
                  )}
                </div>

                {preview.split.transfers.length > 0 && (
                  <ul className="mt-4 space-y-2">
                    {preview.split.transfers.map(transferencia => (
                      <li
                        key={`${transferencia.from}-${transferencia.to}-${transferencia.amount}`}
                        className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 flex flex-wrap items-center gap-3 text-sm"
                      >
                        <span className="font-medium text-gray-900 dark:text-white">
                          {formatResponsibleName(transferencia.from)}
                        </span>
                        <ArrowRight className="w-4 h-4 text-gray-400" />
                        <span className="font-medium text-gray-900 dark:text-white">
                          {formatResponsibleName(transferencia.to)}
                        </span>
                        <span className="ml-auto font-bold text-indigo-600 dark:text-indigo-400">
                          {formatBRL(transferencia.amount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </Section>

          {/* ==================== Contas pagas e pendentes ==================== */}
          <Section
            title="Contas do mês"
            icon={<Check className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />}
            subtitle="Contas planejadas com vencimento nesta competência."
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <PlannedGroup
                title="Pagas"
                group={preview.plannedAccounts.paid}
                tone="text-green-600 dark:text-green-400"
              />
              <PlannedGroup
                title="Pendentes"
                group={preview.plannedAccounts.pending}
                tone="text-amber-600 dark:text-amber-400"
              />
              <PlannedGroup
                title="Vencidas"
                group={preview.plannedAccounts.overdue}
                tone="text-red-600 dark:text-red-400"
              />
              <PlannedGroup
                title="Canceladas"
                group={preview.plannedAccounts.cancelled}
                tone="text-gray-600 dark:text-gray-400"
              />
            </div>

            {preview.plannedAccounts.paid.count +
              preview.plannedAccounts.pending.count +
              preview.plannedAccounts.overdue.count +
              preview.plannedAccounts.cancelled.count ===
              0 && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-4">
                Nenhuma conta planejada vence em {formatMonthLabel(month, year)}. Cadastre
                as contas futuras em{' '}
                <Link href="/planned" className="underline font-medium">
                  Planejado
                </Link>
                .
              </p>
            )}
          </Section>

          {/* ==================== Cartões ==================== */}
          <Section
            title="Gastos no cartão de crédito"
            icon={<CreditCard className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />}
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <IndicatorCard
                label="Gasto no cartão no mês"
                value={formatBRL(preview.creditCards.totalSpent)}
                hint={`${preview.creditCards.transactionCount} ${
                  preview.creditCards.transactionCount === 1 ? 'compra' : 'compras'
                } · ${formatPercent(preview.creditCards.shareOfExpenses)} das despesas`}
              />
              <IndicatorCard
                label="Limite utilizado"
                value={formatBRL(preview.creditCards.totalUsedLimit)}
                hint={`de ${formatBRL(preview.creditCards.totalLimit)} cadastrados`}
              />
              <IndicatorCard
                label="Limite disponível"
                value={formatBRL(preview.creditCards.totalAvailableLimit)}
              />
            </div>

            {preview.creditCards.cards.length === 0 ? (
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-4">
                Nenhum cartão de crédito cadastrado. Cadastre em{' '}
                <Link href="/cards" className="underline font-medium">
                  Cartões
                </Link>{' '}
                para acompanhar limite e fatura.
              </p>
            ) : (
              <div className="overflow-x-auto mt-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left py-2 px-3 font-medium text-gray-600 dark:text-gray-400">
                        Cartão
                      </th>
                      <th className="text-right py-2 px-3 font-medium text-gray-600 dark:text-gray-400">
                        Fatura atual
                      </th>
                      <th className="text-right py-2 px-3 font-medium text-gray-600 dark:text-gray-400">
                        Limite
                      </th>
                      <th className="text-right py-2 px-3 font-medium text-gray-600 dark:text-gray-400">
                        Disponível
                      </th>
                      <th className="text-right py-2 px-3 font-medium text-gray-600 dark:text-gray-400">
                        Uso
                      </th>
                      <th className="text-left py-2 px-3 font-medium text-gray-600 dark:text-gray-400">
                        Fechamento / vencimento
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.creditCards.cards.map(cartao => (
                      <tr
                        key={cartao.cardId}
                        className="border-b border-gray-100 dark:border-gray-800"
                      >
                        <td className="py-2 px-3">
                          <span className="font-medium text-gray-900 dark:text-white">
                            {cartao.name}
                          </span>
                          <span className="block text-xs text-gray-500 dark:text-gray-400">
                            {cartao.bank}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right text-gray-900 dark:text-white">
                          {formatBRL(cartao.currentBalance)}
                        </td>
                        <td className="py-2 px-3 text-right text-gray-700 dark:text-gray-300">
                          {formatBRL(cartao.limit)}
                        </td>
                        <td className="py-2 px-3 text-right text-gray-700 dark:text-gray-300">
                          {formatBRL(cartao.availableLimit)}
                        </td>
                        <td
                          className={`py-2 px-3 text-right font-medium ${
                            cartao.utilizationPercent >= 80
                              ? 'text-red-600 dark:text-red-400'
                              : cartao.utilizationPercent >= 60
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-gray-700 dark:text-gray-300'
                          }`}
                        >
                          {formatPercent(cartao.utilizationPercent)}
                        </td>
                        <td className="py-2 px-3 text-gray-700 dark:text-gray-300">
                          dia {cartao.closingDay} / dia {cartao.dueDay}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* ==================== Parcelamentos ==================== */}
          <Section
            title="Parcelamentos"
            icon={<CreditCard className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />}
            subtitle="Compras parceladas com parcela lançada nesta competência e o que ainda vai pesar nos próximos meses."
          >
            {preview.installments.count === 0 ? (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Nenhuma compra parcelada foi identificada em{' '}
                {formatMonthLabel(month, year)}.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                  <IndicatorCard
                    label="Parcelas no mês"
                    value={formatBRL(preview.installments.totalInMonth)}
                    hint={`${preview.installments.count} ${
                      preview.installments.count === 1 ? 'parcelamento' : 'parcelamentos'
                    }`}
                  />
                  <IndicatorCard
                    label="Ainda a pagar"
                    value={formatBRL(preview.installments.totalRemaining)}
                    hint="Impacto nos meses seguintes"
                    accent="text-amber-600 dark:text-amber-400"
                  />
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        <th className="text-left py-2 px-3 font-medium text-gray-600 dark:text-gray-400">
                          Compra
                        </th>
                        <th className="text-left py-2 px-3 font-medium text-gray-600 dark:text-gray-400">
                          Data
                        </th>
                        <th className="text-left py-2 px-3 font-medium text-gray-600 dark:text-gray-400">
                          Parcela
                        </th>
                        <th className="text-right py-2 px-3 font-medium text-gray-600 dark:text-gray-400">
                          Valor da parcela
                        </th>
                        <th className="text-right py-2 px-3 font-medium text-gray-600 dark:text-gray-400">
                          Falta pagar
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.installments.items.map((item, index) => (
                        <tr
                          key={`${item.description}-${item.date}-${index}`}
                          className="border-b border-gray-100 dark:border-gray-800"
                        >
                          <td className="py-2 px-3">
                            <span className="font-medium text-gray-900 dark:text-white">
                              {item.description}
                            </span>
                            <span className="block text-xs text-gray-500 dark:text-gray-400">
                              {item.establishment || item.category} ·{' '}
                              {formatResponsibleName(item.responsible)}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-gray-700 dark:text-gray-300">
                            {formatDateBR(item.date)}
                          </td>
                          <td className="py-2 px-3 text-gray-700 dark:text-gray-300">
                            {item.currentInstallment}/{item.totalInstallments}
                          </td>
                          <td className="py-2 px-3 text-right text-gray-900 dark:text-white">
                            {formatBRL(item.installmentAmount)}
                          </td>
                          <td className="py-2 px-3 text-right text-amber-600 dark:text-amber-400">
                            {formatBRL(item.remainingAmount)}
                            <span className="block text-xs text-gray-500 dark:text-gray-400">
                              {item.remainingInstallments}{' '}
                              {item.remainingInstallments === 1 ? 'parcela' : 'parcelas'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Section>

          {/* ==================== Evolução patrimonial ==================== */}
          <Section
            title="Evolução patrimonial"
            icon={<TrendingUp className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />}
            subtitle={`Resultado mês a mês nos últimos 12 meses. ${preview.netWorth.monthsWithData} ${
              preview.netWorth.monthsWithData === 1
                ? 'mês tem lançamentos'
                : 'meses têm lançamentos'
            }.`}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <IndicatorCard
                label="Resultado acumulado em 12 meses"
                value={formatBRL(preview.netWorth.accumulatedResult)}
                accent={
                  preview.netWorth.accumulatedResult >= 0
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400'
                }
              />
              <IndicatorCard
                label="Saldo consolidado hoje"
                value={formatBRL(preview.netWorth.currentBalance)}
                hint="Referência atual das contas — não é histórico"
              />
            </div>

            {preview.netWorth.monthsWithData < 2 && (
              <div className="mb-4">
                <UnavailableNotice notice="Há menos de dois meses com lançamentos no histórico: a curva abaixo ainda não representa uma tendência." />
              </div>
            )}

            {dadosLinha.length > 0 && (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dadosLinha}>
                    <CartesianGrid strokeDasharray="3 3" stroke={AXIS_COLOR} opacity={0.3} />
                    <XAxis dataKey="name" stroke={AXIS_COLOR} fontSize={12} />
                    <YAxis stroke={AXIS_COLOR} fontSize={12} width={80} />
                    <Tooltip
                      formatter={(value: number | string) => formatBRL(Number(value))}
                    />
                    <Legend verticalAlign="bottom" height={24} />
                    <Line
                      type="monotone"
                      dataKey="Acumulado"
                      stroke="#2a78d6"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="Resultado"
                      stroke="#a05fd1"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </Section>

          {/* ==================== Metas ==================== */}
          <Section
            title="Metas financeiras"
            icon={<Target className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />}
            subtitle={`${preview.goals.activeGoals} ${
              preview.goals.activeGoals === 1 ? 'meta ativa' : 'metas ativas'
            } · ${preview.goals.completedGoals} ${
              preview.goals.completedGoals === 1 ? 'concluída' : 'concluídas'
            }`}
          >
            {preview.goals.totalGoals === 0 ? (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Nenhuma meta cadastrada. Crie objetivos em{' '}
                <Link href="/metas" className="underline font-medium">
                  Metas
                </Link>
                .
              </p>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                  <IndicatorCard
                    label="Objetivo total"
                    value={formatBRL(preview.goals.totalTargetAmount)}
                  />
                  <IndicatorCard
                    label="Já acumulado"
                    value={formatBRL(preview.goals.totalCurrentAmount)}
                    accent="text-green-600 dark:text-green-400"
                  />
                  <IndicatorCard
                    label="Progresso geral"
                    value={
                      preview.goals.overallProgressPercent === null
                        ? 'Sem objetivo definido'
                        : formatPercent(preview.goals.overallProgressPercent)
                    }
                    hint={`Faltam ${formatBRL(preview.goals.totalRemainingAmount)}`}
                  />
                </div>

                <ul className="space-y-3">
                  {preview.goals.items.map(meta => {
                    const percentual = meta.progressPercent ?? 0;
                    return (
                      <li
                        key={meta.id}
                        className="rounded-lg border border-gray-200 dark:border-gray-700 p-4"
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="font-medium text-gray-900 dark:text-white">
                            {meta.name}
                          </span>
                          <span className="text-sm font-bold text-gray-900 dark:text-white">
                            {meta.progressPercent === null
                              ? 'Sem objetivo definido'
                              : formatPercent(meta.progressPercent)}
                          </span>
                        </div>
                        <div className="mt-2 h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                          <div
                            className="h-full bg-indigo-500"
                            style={{
                              width: `${Math.min(Math.max(percentual, 0), 100)}%`,
                            }}
                          />
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
                          {formatBRL(meta.currentAmount)} de{' '}
                          {formatBRL(meta.targetAmount)} · faltam{' '}
                          {formatBRL(meta.remainingAmount)}
                          {meta.deadline
                            ? ` · prazo ${formatDateBR(meta.deadline)}`
                            : ' · sem prazo definido'}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </Section>

          {/* ==================== Orçamento ==================== */}
          <Section
            title="Orçamento por categoria"
            icon={<Wallet className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />}
          >
            {!preview.budgets.available ? (
              <UnavailableNotice notice={preview.budgets.notice} />
            ) : preview.budgets.items.length === 0 ? (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Nenhuma categoria tem orçamento mensal definido. Configure em{' '}
                <Link href="/categories" className="underline font-medium">
                  Categorias
                </Link>
                .
              </p>
            ) : (
              <ul className="space-y-3">
                {preview.budgets.items.map(orcamento => (
                  <li
                    key={orcamento.categoryId}
                    className="rounded-lg border border-gray-200 dark:border-gray-700 p-4"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium text-gray-900 dark:text-white">
                        {orcamento.name}
                      </span>
                      <span
                        className={`text-xs px-2 py-1 rounded font-medium ${
                          orcamento.status === 'exceeded'
                            ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200'
                            : orcamento.status === 'warning'
                              ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200'
                              : 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200'
                        }`}
                      >
                        {BUDGET_STATUS_LABELS[orcamento.status]}
                      </span>
                    </div>
                    <div className="mt-2 h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                      <div
                        className={`h-full ${
                          orcamento.status === 'exceeded'
                            ? 'bg-red-500'
                            : orcamento.status === 'warning'
                              ? 'bg-amber-500'
                              : 'bg-green-500'
                        }`}
                        style={{
                          width: `${Math.min(Math.max(orcamento.percent, 0), 100)}%`,
                        }}
                      />
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
                      {formatBRL(orcamento.spent)} de {formatBRL(orcamento.monthlyBudget)}{' '}
                      ({formatPercent(orcamento.percent)}) ·{' '}
                      {orcamento.remaining >= 0
                        ? `restam ${formatBRL(orcamento.remaining)}`
                        : `estourou ${formatBRL(Math.abs(orcamento.remaining))}`}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* ==================== Alertas ==================== */}
          <Section
            title="Alertas"
            icon={
              <AlertTriangle className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            }
          >
            {preview.alerts.length === 0 ? (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Nenhum alerta foi disparado nesta competência.
              </p>
            ) : (
              <ul className="space-y-3">
                {preview.alerts.map((alerta, index) => (
                  <li
                    key={`${alerta.type}-${index}`}
                    className={`rounded-lg border p-4 ${alertaClasses(alerta.severity)}`}
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-semibold">{alerta.title}</span>
                      <span className="text-xs uppercase tracking-wide opacity-80">
                        {ALERT_SEVERITY_LABELS[alerta.severity]}
                      </span>
                    </div>
                    <p className="text-sm mt-1">{alerta.message}</p>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* ==================== Sugestões de economia ==================== */}
          <Section
            title="Sugestões de economia"
            icon={<Lightbulb className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />}
            subtitle="Baseadas exclusivamente nos lançamentos registrados no sistema."
          >
            {preview.suggestions.length === 0 ? (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Nenhuma sugestão foi gerada: não há lançamentos suficientes para sustentar
                uma recomendação neste período.
              </p>
            ) : (
              <ul className="space-y-3">
                {preview.suggestions.map((sugestao, index) => (
                  <li
                    key={`${sugestao.title}-${index}`}
                    className="rounded-lg border border-gray-200 dark:border-gray-700 p-4"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium text-gray-900 dark:text-white">
                        {sugestao.title}
                      </span>
                      <span className="text-sm font-semibold text-green-600 dark:text-green-400">
                        {sugestao.potentialSavings === null
                          ? 'Economia não estimada'
                          : `Economia estimada: ${formatBRL(sugestao.potentialSavings)}`}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      {sugestao.description}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </>
      )}

      {/* ==================== Histórico ==================== */}
      <Section
        title="Relatórios já gerados"
        icon={<FileText className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />}
        subtitle={
          historyTotal > 0
            ? `${historyTotal} ${historyTotal === 1 ? 'relatório salvo' : 'relatórios salvos'}`
            : undefined
        }
      >
        {history.length === 0 ? (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Nenhum relatório foi gerado ainda. Use o botão{' '}
            <strong>Gerar Relatório do Mês</strong> acima.
          </p>
        ) : (
          <ul className="space-y-3">
            {history.map(item => (
              <li
                key={item.id}
                className="rounded-lg border border-gray-200 dark:border-gray-700 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {item.periodLabel}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      Gerado em {formatDateTime(item.createdAt)} ·{' '}
                      {REPORT_STATUS_LABELS[item.status] || item.status} ·{' '}
                      {item.viewCount}{' '}
                      {item.viewCount === 1 ? 'visualização' : 'visualizações'}
                    </p>
                    {item.errorMessage && (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                        {item.errorMessage}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {item.files.map(arquivo => {
                      const Icone = FORMAT_ICONS[arquivo.format];
                      const baixando = downloadingKey === `${item.id}:${arquivo.format}`;
                      return (
                        <button
                          key={`${item.id}-${arquivo.format}`}
                          onClick={() =>
                            handleDownload(item.id, arquivo.format, arquivo.fileName)
                          }
                          disabled={baixando}
                          className="px-3 py-1.5 rounded text-xs font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors flex items-center gap-1.5"
                        >
                          {baixando ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Icone className="w-3.5 h-3.5" />
                          )}
                          {REPORT_FORMAT_LABELS[arquivo.format]}
                          <span className="text-gray-500 dark:text-gray-400">
                            {formatFileSize(arquivo.size)}
                          </span>
                        </button>
                      );
                    })}

                    {confirmingDeletionId !== item.id && (
                      <button
                        onClick={() => setConfirmingDeletionId(item.id)}
                        disabled={isDeleting}
                        className="px-3 py-1.5 rounded text-xs font-medium border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50 transition-colors flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Excluir
                      </button>
                    )}
                  </div>
                </div>

                {item.files.length === 0 && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    Nenhum arquivo foi gravado para este relatório.
                  </p>
                )}

                {/* Confirmação inline de exclusão — sem diálogo nativo */}
                {confirmingDeletionId === item.id && (
                  <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 rounded bg-red-50 dark:bg-red-950/20 p-3">
                    <p className="text-sm text-red-800 dark:text-red-200 mb-3">
                      Excluir o relatório de <strong>{item.periodLabel}</strong>? Os
                      arquivos gerados também serão removidos. Seus lançamentos não são
                      afetados — o relatório pode ser gerado de novo a qualquer momento.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => handleDelete(item.id)}
                        disabled={isDeleting}
                        className="px-3 py-1.5 rounded text-xs font-medium bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white transition-colors flex items-center gap-1.5"
                      >
                        {isDeleting ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                        Confirmar exclusão
                      </button>
                      <button
                        onClick={() => setConfirmingDeletionId(null)}
                        className="px-3 py-1.5 rounded text-xs font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
