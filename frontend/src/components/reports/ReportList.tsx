'use client';

import { useState } from 'react';
import { ReportDto } from '@/types/reports';
import { useReports } from '@/hooks/useReports';
import { formatDate, formatCurrency } from '@/utils/formatters';

interface ReportListProps {
  reports: ReportDto[];
  onSelectReport?: (report: ReportDto) => void;
  isLoading?: boolean;
}

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  pending: {
    bg: 'bg-yellow-100 dark:bg-yellow-900/30',
    text: 'text-yellow-800 dark:text-yellow-300',
    label: 'Pendente',
  },
  generating: {
    bg: 'bg-blue-100 dark:bg-blue-900/30',
    text: 'text-blue-800 dark:text-blue-300',
    label: 'Gerando',
  },
  ready: {
    bg: 'bg-green-100 dark:bg-green-900/30',
    text: 'text-green-800 dark:text-green-300',
    label: 'Pronto',
  },
  failed: {
    bg: 'bg-red-100 dark:bg-red-900/30',
    text: 'text-red-800 dark:text-red-300',
    label: 'Falha',
  },
};

const REPORT_TYPE_LABELS: Record<string, string> = {
  monthly: 'Mensal',
  quarterly: 'Trimestral',
  annual: 'Anual',
  custom: 'Personalizado',
  comparison: 'Comparativo',
};

export function ReportList({ reports, onSelectReport, isLoading }: ReportListProps) {
  const { deleteReport, downloadFile } = useReports();
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const handleDelete = async (reportId: string) => {
    try {
      setDeleting(reportId);
      await deleteReport(reportId);
      setDeleteConfirm(null);
    } finally {
      setDeleting(null);
    }
  };

  const getPeriodLabel = (report: ReportDto): string => {
    const monthNames = ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

    const start = `${monthNames[report.startMonth]}/${report.startYear}`;

    if (report.endMonth && report.endYear) {
      const end = `${monthNames[report.endMonth]}/${report.endYear}`;
      return `${start} a ${end}`;
    }

    return start;
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array(3)
          .fill(0)
          .map((_, i) => (
            <div
              key={i}
              className="p-4 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse"
            >
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2" />
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
            </div>
          ))}
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-4xl mb-3">📄</div>
        <p className="text-gray-600 dark:text-gray-400">Nenhum relatório gerado ainda</p>
        <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
          Crie seu primeiro relatório usando o construtor acima
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {reports.map(report => {
        const statusInfo = STATUS_COLORS[report.status] || STATUS_COLORS.pending;

        return (
          <div
            key={report.id}
            className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-2">
                  <div>
                    <h3 className="font-medium text-gray-900 dark:text-gray-100">
                      {REPORT_TYPE_LABELS[report.reportType] || report.reportType} -{' '}
                      {getPeriodLabel(report)}
                    </h3>
                  </div>
                  <span
                    className={`text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${statusInfo.bg} ${statusInfo.text}`}
                  >
                    {statusInfo.label}
                  </span>
                </div>

                {/* Report Details */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                  <div>
                    <p className="text-gray-600 dark:text-gray-400">Formato</p>
                    <p className="text-gray-900 dark:text-gray-100 font-medium">
                      {report.fileFormat?.toUpperCase() || 'N/A'}
                    </p>
                  </div>
                  {report.metadata && (
                    <>
                      <div>
                        <p className="text-gray-600 dark:text-gray-400">Total</p>
                        <p className="text-gray-900 dark:text-gray-100 font-medium">
                          {formatCurrency(report.metadata.totalExpenses)}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-600 dark:text-gray-400">Top Categoria</p>
                        <p className="text-gray-900 dark:text-gray-100 font-medium text-xs truncate">
                          {report.metadata.topCategory}
                        </p>
                      </div>
                    </>
                  )}
                  <div>
                    <p className="text-gray-600 dark:text-gray-400">Visualizações</p>
                    <p className="text-gray-900 dark:text-gray-100 font-medium">
                      {report.viewCount}
                    </p>
                  </div>
                </div>

                {/* Timestamps */}
                <div className="mt-2 text-xs text-gray-500 dark:text-gray-500">
                  Criado: {formatDate(report.createdAt)}
                  {report.sentToEmail && ` • Enviado: ${formatDate(report.sentAt)}`}
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-2 sm:flex-row">
                {report.status === 'ready' && (
                  <>
                    <button
                      onClick={() => downloadFile(report)}
                      title="Baixar relatório"
                      className="p-2 text-gray-600 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                    >
                      ⬇️
                    </button>
                    <button
                      onClick={() => onSelectReport?.(report)}
                      title="Visualizar detalhes"
                      className="p-2 text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                    >
                      👁️
                    </button>
                  </>
                )}

                {deleteConfirm === report.id ? (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setDeleteConfirm(null)}
                      className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => handleDelete(report.id)}
                      disabled={deleting === report.id}
                      className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 transition-colors"
                    >
                      {deleting === report.id ? 'Deletando...' : 'Confirmar'}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeleteConfirm(report.id)}
                    title="Deletar relatório"
                    className="p-2 text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                  >
                    🗑️
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
