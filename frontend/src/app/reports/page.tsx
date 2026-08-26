'use client';

import { useState, useEffect } from 'react';
import { ReportBuilder } from '@/components/reports/ReportBuilder';
import { ReportList } from '@/components/reports/ReportList';
import { ReportPreview } from '@/components/reports/ReportPreview';
import { TemplateManager } from '@/components/reports/TemplateManager';
import { useReports } from '@/hooks/useReports';
import { ReportDto } from '@/types/reports';

type TabType = 'create' | 'list' | 'templates';

export default function ReportsPage() {
  const { reports, templates, isLoading, error, listReports, getTemplates, deleteReport } = useReports();
  const [activeTab, setActiveTab] = useState<TabType>('list');
  const [selectedReport, setSelectedReport] = useState<ReportDto | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    handleRefresh();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([listReports(100, 0), getTemplates()]);
    } finally {
      setRefreshing(false);
    }
  };

  const handleReportCreated = () => {
    setActiveTab('list');
    handleRefresh();
  };

  const handleDeleteTemplate = async (templateId: string) => {
    await deleteReport(templateId);
    await getTemplates();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            📊 Relatórios
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Gere, exporte e compartilhe relatórios financeiros detalhados
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
          title="Atualizar"
        >
          🔄
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setActiveTab('create')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors ${
            activeTab === 'create'
              ? 'text-indigo-600 dark:text-indigo-400 border-indigo-600 dark:border-indigo-400'
              : 'text-gray-600 dark:text-gray-400 border-transparent hover:text-gray-900 dark:hover:text-gray-100'
          }`}
        >
          ➕ Criar Novo
        </button>
        <button
          onClick={() => setActiveTab('list')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors ${
            activeTab === 'list'
              ? 'text-indigo-600 dark:text-indigo-400 border-indigo-600 dark:border-indigo-400'
              : 'text-gray-600 dark:text-gray-400 border-transparent hover:text-gray-900 dark:hover:text-gray-100'
          }`}
        >
          📄 Meus Relatórios ({reports.length})
        </button>
        <button
          onClick={() => setActiveTab('templates')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors ${
            activeTab === 'templates'
              ? 'text-indigo-600 dark:text-indigo-400 border-indigo-600 dark:border-indigo-400'
              : 'text-gray-600 dark:text-gray-400 border-transparent hover:text-gray-900 dark:hover:text-gray-100'
          }`}
        >
          📋 Templates ({templates.length})
        </button>
      </div>

      {/* Tab Content */}
      <div>
        {/* Create Tab */}
        {activeTab === 'create' && (
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6">
            <div className="max-w-2xl">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
                Gerar Novo Relatório
              </h2>
              <ReportBuilder
                onSuccess={handleReportCreated}
                onCancel={() => setActiveTab('list')}
              />
            </div>
          </div>
        )}

        {/* List Tab */}
        {activeTab === 'list' && (
          <div className="space-y-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6">
              <ReportList
                reports={reports}
                onSelectReport={setSelectedReport}
                isLoading={isLoading}
              />
            </div>
          </div>
        )}

        {/* Templates Tab */}
        {activeTab === 'templates' && (
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6">
            <TemplateManager
              templates={templates}
              onDeleteTemplate={handleDeleteTemplate}
              isLoading={isLoading}
            />
          </div>
        )}
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total de Relatórios</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{reports.length}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Prontos</p>
          <p className="text-2xl font-bold text-green-600 dark:text-green-400">
            {reports.filter(r => r.status === 'ready').length}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Templates Salvos</p>
          <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
            {templates.length}
          </p>
        </div>
      </div>

      {/* Tips Section */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h3 className="font-semibold text-blue-900 dark:text-blue-300 mb-2">💡 Dicas</h3>
        <ul className="text-sm text-blue-800 dark:text-blue-300 space-y-1">
          <li>• Crie templates para reutilizar configurações de relatórios frequentes</li>
          <li>• Exporte em PDF para compartilhar, CSV para análise em planilhas, ou XLSX para dados estruturados</li>
          <li>• Você pode enviar relatórios por email automaticamente durante a geração</li>
          <li>• Relatórios incluem análises inteligentes de anomalias e tendências</li>
        </ul>
      </div>

      {/* Report Preview Modal */}
      {selectedReport && (
        <ReportPreview report={selectedReport} onClose={() => setSelectedReport(null)} />
      )}
    </div>
  );
}
