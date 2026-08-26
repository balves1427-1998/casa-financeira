'use client';

import { ReportDto } from '@/types/reports';
import { formatDate, formatCurrency } from '@/utils/formatters';

interface ReportPreviewProps {
  report: ReportDto;
  onClose?: () => void;
}

export function ReportPreview({ report, onClose }: ReportPreviewProps) {
  const monthNames = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

  const getPeriodLabel = (): string => {
    const start = `${monthNames[report.startMonth]} de ${report.startYear}`;

    if (report.endMonth && report.endYear) {
      const end = `${monthNames[report.endMonth]} de ${report.endYear}`;
      return `${start} até ${end}`;
    }

    return start;
  };

  const renderMetadata = () => {
    if (!report.metadata) return null;

    const m = report.metadata;

    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg">
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Total de Despesas</p>
          <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
            {formatCurrency(m.totalExpenses)}
          </p>
        </div>
        <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg">
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Total de Receitas</p>
          <p className="text-lg font-bold text-green-600 dark:text-green-400">
            {formatCurrency(m.totalIncome)}
          </p>
        </div>
        <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg">
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Média Diária</p>
          <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
            {formatCurrency(m.averageDaily)}
          </p>
        </div>
        <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg">
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Transações</p>
          <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
            {m.transactionCount}
          </p>
        </div>

        <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg">
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Top Categoria</p>
          <p className="text-lg font-bold text-indigo-600 dark:text-indigo-400">
            {m.topCategory}
          </p>
        </div>
        <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg">
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Top Estabelecimento</p>
          <p className="text-lg font-bold text-indigo-600 dark:text-indigo-400 truncate">
            {m.topMerchant}
          </p>
        </div>
        <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg">
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Anomalias Detectadas</p>
          <p className="text-lg font-bold text-orange-600 dark:text-orange-400">
            {m.anomalyCount}
          </p>
        </div>
        <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg">
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Visualizações</p>
          <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
            {report.viewCount}
          </p>
        </div>
      </div>
    );
  };

  const renderSectionStatus = () => {
    if (!report.config) return null;

    const sections = [
      { key: 'includeSummary', label: 'Resumo Executivo' },
      { key: 'includeSpendingPatterns', label: 'Padrões de Gasto' },
      { key: 'includeAnomalies', label: 'Anomalias' },
      { key: 'includeTrends', label: 'Tendências' },
      { key: 'includeComparison', label: 'Comparativo' },
      { key: 'includeForecasting', label: 'Previsões' },
      { key: 'includeMetas', label: 'Metas' },
    ];

    const included = sections.filter(s => report.config?.[s.key as keyof typeof report.config]);

    return (
      <div className="space-y-2">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Seções Incluídas</h3>
        <div className="flex flex-wrap gap-2">
          {included.map(section => (
            <span
              key={section.key}
              className="px-3 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-sm rounded-full"
            >
              ✓ {section.label}
            </span>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-900 rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Relatório - {getPeriodLabel()}
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Formato: {report.fileFormat?.toUpperCase()} • Criado: {formatDate(report.createdAt)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-8">
          {/* Summary */}
          <section>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              📊 Resumo Financeiro
            </h3>
            {renderMetadata()}
          </section>

          {/* Info Boxes */}
          <section>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              ℹ️ Informações do Relatório
            </h3>
            <div className="space-y-3">
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <p className="text-sm">
                  <strong>Período:</strong> {getPeriodLabel()}
                </p>
              </div>
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <p className="text-sm">
                  <strong>Tamanho do Arquivo:</strong>{' '}
                  {report.fileSize ? (report.fileSize / 1024).toFixed(2) + ' KB' : 'N/A'}
                </p>
              </div>
              {report.sentToEmail && (
                <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                  <p className="text-sm">
                    <strong>Enviado por Email:</strong> {formatDate(report.sentAt)}
                  </p>
                  {report.metadata?.totalExpenses && (
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                      Para: {report.metadata ? 'Destinatários registrados' : 'N/A'}
                    </p>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* Sections */}
          <section>
            {renderSectionStatus()}
          </section>

          {/* Notes */}
          <section className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <p className="text-sm text-yellow-800 dark:text-yellow-300">
              💡 <strong>Nota:</strong> Esta é uma visualização resumida do relatório. Para ver o
              relatório completo com gráficos e análises detalhadas, baixe o arquivo{' '}
              {report.fileFormat?.toUpperCase() || 'solicitado'}.
            </p>
          </section>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2 px-4 bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
