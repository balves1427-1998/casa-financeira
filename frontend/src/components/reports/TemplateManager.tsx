'use client';

import { useState } from 'react';
import { ReportTemplate } from '@/types/reports';

interface TemplateManagerProps {
  templates: ReportTemplate[];
  onSelectTemplate?: (template: ReportTemplate) => void;
  onDeleteTemplate?: (templateId: string) => void;
  isLoading?: boolean;
}

export function TemplateManager({
  templates,
  onSelectTemplate,
  onDeleteTemplate,
  isLoading,
}: TemplateManagerProps) {
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const handleDelete = async (templateId: string) => {
    try {
      setDeleting(templateId);
      await onDeleteTemplate?.(templateId);
      setDeleteConfirm(null);
    } finally {
      setDeleting(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array(2)
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

  if (templates.length === 0) {
    return (
      <div className="text-center py-8 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
        <div className="text-3xl mb-2">📋</div>
        <p className="text-gray-600 dark:text-gray-400">Nenhum template salvo</p>
        <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
          Crie um relatório e salve sua configuração como template
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
        📋 Meus Templates ({templates.length})
      </h3>

      {templates.map(template => (
        <div
          key={template.id}
          className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-1">
                {template.name}
              </h4>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Tipo: {template.type} • Criado: {new Date(template.createdAt).toLocaleDateString('pt-BR')}
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => onSelectTemplate?.(template)}
                title="Usar este template"
                className="p-2 text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              >
                ✓
              </button>

              {deleteConfirm === template.id ? (
                <div className="flex gap-1">
                  <button
                    onClick={() => setDeleteConfirm(null)}
                    className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => handleDelete(template.id)}
                    disabled={deleting === template.id}
                    className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 transition-colors"
                  >
                    {deleting === template.id ? 'Deletando...' : 'Confirmar'}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setDeleteConfirm(template.id)}
                  title="Deletar template"
                  className="p-2 text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                >
                  🗑️
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
