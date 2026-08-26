'use client';

import { useState } from 'react';
import { GenerateReportDto, ReportConfig } from '@/types/reports';
import { useReports } from '@/hooks/useReports';

const REPORT_TYPES = [
  { value: 'monthly', label: 'Mensal' },
  { value: 'quarterly', label: 'Trimestral' },
  { value: 'annual', label: 'Anual' },
  { value: 'custom', label: 'Personalizado' },
  { value: 'comparison', label: 'Comparativo' },
];

const FORMATS = [
  { value: 'pdf', label: 'PDF', icon: '📄' },
  { value: 'csv', label: 'CSV', icon: '📊' },
  { value: 'xlsx', label: 'Excel', icon: '📈' },
];

const SECTIONS = [
  { key: 'includeSummary', label: 'Resumo Executivo', description: 'Visão geral das finanças' },
  { key: 'includeSpendingPatterns', label: 'Padrões de Gasto', description: 'Análise de comportamento financeiro' },
  { key: 'includeAnomalies', label: 'Anomalias', description: 'Gastos incomuns detectados' },
  { key: 'includeTrends', label: 'Tendências', description: 'Evolução por categoria' },
  { key: 'includeComparison', label: 'Comparativo', description: 'Bruno vs Giovanna' },
  { key: 'includeForecasting', label: 'Previsões', description: 'Projeção de gastos' },
  { key: 'includeMetas', label: 'Metas', description: 'Progresso de metas financeiras' },
];

interface ReportBuilderProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function ReportBuilder({ onSuccess, onCancel }: ReportBuilderProps) {
  const { generateReport, isGenerating } = useReports();
  const [reportType, setReportType] = useState<'monthly' | 'quarterly' | 'annual' | 'custom' | 'comparison'>('monthly');
  const [format, setFormat] = useState<'pdf' | 'csv' | 'xlsx'>('pdf');
  const [sendEmail, setSendEmail] = useState(false);
  const [recipientEmails, setRecipientEmails] = useState('');
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth() + 1);
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [endMonth, setEndMonth] = useState<number | undefined>();
  const [endYear, setEndYear] = useState<number | undefined>();
  const [error, setError] = useState<string | null>(null);

  const [config, setConfig] = useState<ReportConfig>({
    includeSummary: true,
    includeSpendingPatterns: true,
    includeAnomalies: true,
    includeTrends: true,
    includeComparison: true,
    includeForecasting: false,
    includeMetas: false,
  });

  const handleSectionToggle = (key: keyof ReportConfig) => {
    if (key !== 'categories' && key !== 'excludeCategories' && key !== 'comparisonUser' && key !== 'minAnomalySeverity') {
      setConfig(prev => ({
        ...prev,
        [key]: !prev[key as keyof Omit<ReportConfig, 'categories' | 'excludeCategories' | 'comparisonUser' | 'minAnomalySeverity'>],
      }));
    }
  };

  const handleGenerateReport = async () => {
    setError(null);

    // Validação
    if (reportType !== 'custom' && reportType !== 'monthly' && !currentYear) {
      setError('Ano é obrigatório');
      return;
    }

    if ((reportType === 'custom' || reportType === 'quarterly') && (!endMonth || !endYear)) {
      setError('Data final é obrigatória para este tipo de relatório');
      return;
    }

    // Validar que pelo menos uma seção está incluída
    const hasSections = Object.entries(config).some(
      ([key, value]) =>
        key.startsWith('include') && value === true
    );

    if (!hasSections) {
      setError('Selecione pelo menos uma seção para incluir no relatório');
      return;
    }

    // Validar emails se enviar por email
    if (sendEmail) {
      const emails = recipientEmails.split(',').map(e => e.trim()).filter(Boolean);
      if (emails.length === 0) {
        setError('Forneça pelo menos um email para enviar');
        return;
      }

      const invalidEmails = emails.filter(
        e => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
      );
      if (invalidEmails.length > 0) {
        setError(`Emails inválidos: ${invalidEmails.join(', ')}`);
        return;
      }
    }

    try {
      const dto: GenerateReportDto = {
        reportType,
        startMonth: currentMonth,
        startYear: currentYear,
        endMonth,
        endYear,
        config,
        format,
        sendToEmail: sendEmail,
        recipientEmails: sendEmail
          ? recipientEmails.split(',').map(e => e.trim()).filter(Boolean)
          : undefined,
      };

      await generateReport(dto);
      onSuccess?.();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Erro ao gerar relatório';
      setError(errorMsg);
    }
  };

  const months = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

  return (
    <div className="space-y-6">
      {/* Error Message */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Report Type Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
          Tipo de Relatório
        </label>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {REPORT_TYPES.map(type => (
            <button
              key={type.value}
              onClick={() => setReportType(type.value as any)}
              className={`py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                reportType === type.value
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {type.label}
            </button>
          ))}
        </div>
      </div>

      {/* Date Selection */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
            Mês Inicial
          </label>
          <select
            value={currentMonth}
            onChange={e => setCurrentMonth(Number(e.target.value))}
            className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100"
          >
            {months.map((month, idx) => (
              <option key={idx} value={idx + 1}>
                {month}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
            Ano Inicial
          </label>
          <select
            value={currentYear}
            onChange={e => setCurrentYear(Number(e.target.value))}
            className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100"
          >
            {years.map(year => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>

        {(reportType === 'custom' || reportType === 'quarterly') && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                Mês Final
              </label>
              <select
                value={endMonth || ''}
                onChange={e => setEndMonth(e.target.value ? Number(e.target.value) : undefined)}
                className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100"
              >
                <option value="">Selecionar</option>
                {months.map((month, idx) => (
                  <option key={idx} value={idx + 1}>
                    {month}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                Ano Final
              </label>
              <select
                value={endYear || ''}
                onChange={e => setEndYear(e.target.value ? Number(e.target.value) : undefined)}
                className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100"
              >
                <option value="">Selecionar</option>
                {years.map(year => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
      </div>

      {/* Format Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
          Formato de Saída
        </label>
        <div className="grid grid-cols-3 gap-3">
          {FORMATS.map(fmt => (
            <button
              key={fmt.value}
              onClick={() => setFormat(fmt.value as any)}
              className={`py-3 px-4 rounded-lg text-sm font-medium transition-colors text-center ${
                format === fmt.value
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              <div className="text-lg mb-1">{fmt.icon}</div>
              {fmt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Sections Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
          Seções a Incluir
        </label>
        <div className="space-y-2">
          {SECTIONS.map(section => (
            <label
              key={section.key}
              className="flex items-start p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <input
                type="checkbox"
                checked={config[section.key as keyof ReportConfig] as boolean}
                onChange={() => handleSectionToggle(section.key as keyof ReportConfig)}
                className="mt-1 w-4 h-4 text-indigo-600 rounded"
              />
              <div className="ml-3 flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {section.label}
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  {section.description}
                </p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Email Sending */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
        <label className="flex items-center mb-3">
          <input
            type="checkbox"
            checked={sendEmail}
            onChange={e => setSendEmail(e.target.checked)}
            className="w-4 h-4 text-indigo-600 rounded"
          />
          <span className="ml-2 text-sm font-medium text-gray-900 dark:text-gray-100">
            Enviar por Email
          </span>
        </label>

        {sendEmail && (
          <div>
            <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
              Emails (separados por vírgula)
            </label>
            <textarea
              value={recipientEmails}
              onChange={e => setRecipientEmails(e.target.value)}
              placeholder="seu@email.com, outro@email.com"
              className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 text-sm"
              rows={2}
            />
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={onCancel}
          className="flex-1 py-2 px-4 bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        >
          Cancelar
        </button>
        <button
          onClick={handleGenerateReport}
          disabled={isGenerating}
          className="flex-1 py-2 px-4 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isGenerating ? 'Gerando...' : 'Gerar Relatório'}
        </button>
      </div>
    </div>
  );
}
