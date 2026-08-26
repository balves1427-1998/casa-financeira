'use client';

import { useState } from 'react';
import { useCustomRules } from '@/hooks/useCustomRules';

interface RegexTesterProps {
  initialPattern?: string;
  initialMatchType?: string;
  onTestResult?: (result: any) => void;
}

export function RegexTester({
  initialPattern = '',
  initialMatchType = 'keyword',
  onTestResult,
}: RegexTesterProps) {
  const { testPattern, isLoading, error } = useCustomRules();
  const [pattern, setPattern] = useState(initialPattern);
  const [matchType, setMatchType] = useState(initialMatchType);
  const [testInput, setTestInput] = useState('');
  const [testStrings, setTestStrings] = useState<string[]>([]);
  const [result, setResult] = useState<any>(null);

  const handleAddTestString = () => {
    if (testInput.trim()) {
      setTestStrings([...testStrings, testInput.trim()]);
      setTestInput('');
    }
  };

  const handleRemoveTestString = (index: number) => {
    setTestStrings(testStrings.filter((_, i) => i !== index));
  };

  const handleTest = async () => {
    if (!pattern.trim()) {
      alert('Pattern is required');
      return;
    }
    if (testStrings.length === 0) {
      alert('Add at least one test string');
      return;
    }

    try {
      const result = await testPattern(pattern, matchType, testStrings);
      setResult(result);
      onTestResult?.(result);
    } catch (error) {
      console.error('Test pattern error:', error);
    }
  };

  const getMatchTypeLabel = (type: string): string => {
    switch (type) {
      case 'keyword':
        return '🔤 Palavra-chave (case-insensitive)';
      case 'regex':
        return '🔍 Expressão regular (Regex)';
      case 'exact':
        return '✓ Correspondência exata';
      default:
        return type;
    }
  };

  return (
    <div className="w-full space-y-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
        🧪 Testador de Padrões
      </h3>

      {/* Pattern Input */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-400">
          Padrão
        </label>
        <input
          type="text"
          value={pattern}
          onChange={e => setPattern(e.target.value)}
          placeholder="Digite o padrão a testar (ex: IFOOD, .*UBER.*, NETFLIX)"
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Match Type Select */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-400">
          Tipo de Correspondência
        </label>
        <select
          value={matchType}
          onChange={e => setMatchType(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="keyword">🔤 Palavra-chave</option>
          <option value="regex">🔍 Expressão regular</option>
          <option value="exact">✓ Exata</option>
        </select>
        <p className="text-xs text-gray-600 dark:text-gray-500">
          {getMatchTypeLabel(matchType)}
        </p>
      </div>

      {/* Test Strings Input */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-400">
          Strings de Teste
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={testInput}
            onChange={e => setTestInput(e.target.value)}
            onKeyPress={e => {
              if (e.key === 'Enter') {
                handleAddTestString();
              }
            }}
            placeholder="Digite uma string e pressione Enter ou clique em Adicionar"
            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleAddTestString}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
          >
            Adicionar
          </button>
        </div>
      </div>

      {/* Test Strings List */}
      {testStrings.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-400">
            Adicionadas ({testStrings.length}):
          </p>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {testStrings.map((str, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-sm"
              >
                <code className="text-gray-900 dark:text-gray-100">
                  {str}
                </code>
                <button
                  onClick={() => handleRemoveTestString(idx)}
                  className="text-red-600 hover:text-red-700 font-medium"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Test Button */}
      <button
        onClick={handleTest}
        disabled={isLoading || !pattern.trim() || testStrings.length === 0}
        className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? '⏳ Testando...' : '▶️ Testar Padrão'}
      </button>

      {/* Error Display */}
      {error && (
        <div className="p-3 bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-800 dark:text-red-400">
          ❌ Erro: {error}
        </div>
      )}

      {/* Results Display */}
      {result && (
        <div className="space-y-3 p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
          <h4 className="font-semibold text-gray-900 dark:text-gray-100">
            📊 Resultados
          </h4>

          <div className="grid grid-cols-3 gap-2 text-sm">
            <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded text-center">
              <div className="text-xs text-gray-600 dark:text-gray-400">
                Total
              </div>
              <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
                {result.testResults.length}
              </div>
            </div>
            <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded text-center">
              <div className="text-xs text-gray-600 dark:text-gray-400">
                Correspondências
              </div>
              <div className="text-lg font-bold text-green-600 dark:text-green-400">
                {result.matchCount}
              </div>
            </div>
            <div className="p-2 bg-purple-50 dark:bg-purple-900/20 rounded text-center">
              <div className="text-xs text-gray-600 dark:text-gray-400">
                Taxa de sucesso
              </div>
              <div className="text-lg font-bold text-purple-600 dark:text-purple-400">
                {(result.successRate * 100).toFixed(0)}%
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-xs font-medium text-gray-600 dark:text-gray-400">
              Detalhes:
            </p>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {result.testResults.map((res: any, idx: number) => (
                <div
                  key={idx}
                  className={`p-2 rounded text-xs font-mono ${
                    res.matched
                      ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-400 border border-green-200 dark:border-green-800'
                      : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-400 border border-red-200 dark:border-red-800'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span>{res.matched ? '✓' : '✗'}</span>
                    <span>{res.input}</span>
                    {res.error && <span className="text-red-600">({res.error})</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {result.successRate === 1 && (
            <div className="p-2 bg-green-100 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded text-sm text-green-800 dark:text-green-400">
              ✓ Padrão funcionando perfeitamente!
            </div>
          )}
          {result.successRate === 0 && (
            <div className="p-2 bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded text-sm text-red-800 dark:text-red-400">
              ✗ Padrão não correspondeu com nenhuma string
            </div>
          )}
        </div>
      )}
    </div>
  );
}
