'use client';

import { useEffect, useState } from 'react';
import { useCustomRules } from '@/hooks/useCustomRules';
import { RegexTester } from '@/components/rules/RegexTester';
import { RuleForm } from '@/components/rules/RuleForm';
import { RuleStatsPanel } from '@/components/rules/RuleStatsPanel';

// Mock categories - in production, fetch from API
const MOCK_CATEGORIES = [
  { id: '1', name: 'Alimentação' },
  { id: '2', name: 'Supermercado' },
  { id: '3', name: 'Transporte' },
  { id: '4', name: 'Combustível' },
  { id: '5', name: 'Saúde' },
  { id: '6', name: 'Educação' },
  { id: '7', name: 'Lazer' },
  { id: '8', name: 'Compras' },
  { id: '9', name: 'Assinaturas' },
  { id: '10', name: 'Moradia' },
];

export default function RulesPage() {
  const {
    rules,
    isLoading,
    error,
    fetchRules,
    deleteRule,
  } = useCustomRules();

  const [showForm, setShowForm] = useState(false);
  const [selectedRule, setSelectedRule] = useState<any>(null);
  const [filterMatchType, setFilterMatchType] = useState<string>('all');
  const [filterActive, setFilterActive] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const filteredRules = rules.filter(rule => {
    const matchesType =
      filterMatchType === 'all' || rule.matchType === filterMatchType;
    const matchesActive =
      filterActive === 'all'
        ? true
        : filterActive === 'active'
          ? rule.isActive
          : !rule.isActive;
    const matchesSearch =
      searchTerm === ''
        ? true
        : rule.keyword?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          rule.description?.toLowerCase().includes(searchTerm.toLowerCase());

    return matchesType && matchesActive && matchesSearch;
  });

  const handleEditRule = (rule: any) => {
    setSelectedRule(rule);
    setShowForm(true);
  };

  const handleDeleteRule = async (id: string) => {
    if (confirm('Tem certeza que deseja excluir esta regra?')) {
      try {
        await deleteRule(id);
      } catch (error) {
        console.error('Error deleting rule:', error);
      }
    }
  };

  const handleFormSuccess = () => {
    setShowForm(false);
    setSelectedRule(null);
    fetchRules();
  };

  const getMatchTypeLabel = (type: string): string => {
    switch (type) {
      case 'keyword':
        return '🔤 Palavra-chave';
      case 'regex':
        return '🔍 Regex';
      case 'exact':
        return '✓ Exata';
      default:
        return type;
    }
  };

  const getCategoryName = (categoryId: string): string => {
    return (
      MOCK_CATEGORIES.find(cat => cat.id === categoryId)?.name ||
      'Desconhecida'
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
              ⚙️ Regras de Classificação
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              Crie e gerencie regras personalizadas para classificação automática
            </p>
          </div>
          <button
            onClick={() => {
              setSelectedRule(null);
              setShowForm(true);
            }}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
          >
            ➕ Nova Regra
          </button>
        </div>

        {/* Error Display */}
        {error && (
          <div className="p-4 bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-red-800 dark:text-red-400">
            ❌ Erro: {error}
          </div>
        )}

        {/* Stats Panel */}
        <RuleStatsPanel />

        {/* Form Section */}
        {showForm && (
          <RuleForm
            rule={selectedRule}
            categories={MOCK_CATEGORIES}
            onSuccess={handleFormSuccess}
            onCancel={() => {
              setShowForm(false);
              setSelectedRule(null);
            }}
          />
        )}

        {/* Regex Tester */}
        <RegexTester />

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-400">
              Buscar
            </label>
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Padrão ou descrição..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-400">
              Tipo
            </label>
            <select
              value={filterMatchType}
              onChange={e => setFilterMatchType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Todos os tipos</option>
              <option value="keyword">🔤 Palavra-chave</option>
              <option value="regex">🔍 Regex</option>
              <option value="exact">✓ Exata</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-400">
              Status
            </label>
            <select
              value={filterActive}
              onChange={e => setFilterActive(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Todas</option>
              <option value="active">✓ Ativas</option>
              <option value="inactive">✗ Inativas</option>
            </select>
          </div>
        </div>

        {/* Rules Table */}
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
          {isLoading && !rules.length ? (
            <div className="p-8 text-center">
              <div className="inline-block animate-spin text-2xl">⏳</div>
              <p className="text-gray-600 dark:text-gray-400 mt-2">
                Carregando regras...
              </p>
            </div>
          ) : filteredRules.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-gray-600 dark:text-gray-400">
                {rules.length === 0
                  ? 'Nenhuma regra criada. Crie a primeira!'
                  : 'Nenhuma regra corresponde aos filtros'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">
                      Padrão
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">
                      Tipo
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">
                      Categoria
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">
                      Prioridade
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">
                      Confiança
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">
                      Usos
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                  {filteredRules.map(rule => (
                    <tr
                      key={rule.id}
                      className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                    >
                      <td className="px-4 py-3 text-sm">
                        <code className="text-gray-900 dark:text-gray-100 font-mono">
                          {rule.keyword || rule.pattern}
                        </code>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {getMatchTypeLabel(rule.matchType)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                        {getCategoryName(rule.categoryId)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                        {rule.priority}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex items-center gap-1">
                          <div className="w-16 h-2 bg-gray-300 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-green-500"
                              style={{
                                width: `${(rule.confidence || 0) * 100}%`,
                              }}
                            />
                          </div>
                          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                            {((rule.confidence || 0) * 100).toFixed(0)}%
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                        {rule.timesApplied || 0}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span
                          className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                            rule.isActive
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                              : 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400'
                          }`}
                        >
                          {rule.isActive ? '✓ Ativa' : '✗ Inativa'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleEditRule(rule)}
                            className="px-2 py-1 text-xs bg-blue-100 hover:bg-blue-200 text-blue-800 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 dark:text-blue-400 rounded transition-colors"
                          >
                            ✏️ Editar
                          </button>
                          <button
                            onClick={() => handleDeleteRule(rule.id)}
                            className="px-2 py-1 text-xs bg-red-100 hover:bg-red-200 text-red-800 dark:bg-red-900/30 dark:hover:bg-red-900/50 dark:text-red-400 rounded transition-colors"
                          >
                            🗑️ Excluir
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Summary */}
        {rules.length > 0 && (
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-sm text-blue-800 dark:text-blue-400">
            Mostrando {filteredRules.length} de {rules.length} regras
          </div>
        )}
      </div>
    </div>
  );
}
