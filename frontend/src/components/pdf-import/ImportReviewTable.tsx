'use client';

import { useState } from 'react';
import { ExtractedTransaction } from '@/hooks/usePdfImport';

interface ImportReviewTableProps {
  transactions: ExtractedTransaction[];
  duplicateMatches?: any[];
  onConfirm: (selectedIds: string[]) => Promise<void>;
  onReject: () => void;
  isLoading?: boolean;
}

export function ImportReviewTable({
  transactions,
  duplicateMatches = [],
  onConfirm,
  onReject,
  isLoading,
}: ImportReviewTableProps) {
  const [selectedTransactions, setSelectedTransactions] = useState<Set<string>>(
    new Set(transactions.map((t) => t.transactionId || `tx_${transactions.indexOf(t)}`)
  ));
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const duplicateMap = new Map(
    duplicateMatches?.map((m) => [m.transactionId, m.matches]) || []
  );

  const handleSelectAll = () => {
    if (selectedTransactions.size === transactions.length) {
      setSelectedTransactions(new Set());
    } else {
      setSelectedTransactions(
        new Set(transactions.map((t) => t.transactionId || `tx_${transactions.indexOf(t)}`))
      );
    }
  };

  const handleSelectTransaction = (id: string) => {
    const newSet = new Set(selectedTransactions);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedTransactions(newSet);
  };

  const toggleRow = (id: string) => {
    const newSet = new Set(expandedRows);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setExpandedRows(newSet);
  };

  const handleConfirm = async () => {
    await onConfirm(Array.from(selectedTransactions));
  };

  const formatDate = (dateStr: string) => {
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">
          Revisar Transações Importadas ({selectedTransactions.size}/{transactions.length})
        </h3>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={selectedTransactions.size === transactions.length}
            onChange={handleSelectAll}
            disabled={isLoading}
            className="w-4 h-4 rounded"
          />
          <span className="text-sm">Selecionar todas</span>
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-gray-200 dark:border-gray-700">
              <th className="text-left py-2 px-4 w-12">
                <input type="checkbox" disabled className="w-4 h-4 rounded" />
              </th>
              <th className="text-left py-2 px-4">Data</th>
              <th className="text-left py-2 px-4">Descrição</th>
              <th className="text-right py-2 px-4">Valor</th>
              <th className="text-left py-2 px-4">Categoria Sugerida</th>
              <th className="text-left py-2 px-4">Status</th>
              <th className="text-center py-2 px-4">Ações</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((transaction, idx) => {
              const txId = transaction.transactionId || `tx_${idx}`;
              const isDuplicate = duplicateMap.has(txId);
              const duplicates = duplicateMap.get(txId) || [];
              const isSelected = selectedTransactions.has(txId);
              const isExpanded = expandedRows.has(txId);

              return (
                <div key={txId}>
                  <tr
                    className={`border-b border-gray-200 dark:border-gray-700 ${
                      isDuplicate ? 'bg-yellow-50 dark:bg-yellow-900/20' : ''
                    } ${isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
                  >
                    <td className="py-3 px-4">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleSelectTransaction(txId)}
                        disabled={isLoading}
                        className="w-4 h-4 rounded"
                      />
                    </td>
                    <td className="py-3 px-4 font-medium">{formatDate(transaction.date)}</td>
                    <td className="py-3 px-4">{transaction.description}</td>
                    <td className="py-3 px-4 text-right font-mono">
                      R$ {transaction.amount.toLocaleString('pt-BR', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-block bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 px-2 py-1 rounded text-xs">
                        {transaction.suggestedCategory || 'Não classificado'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {isDuplicate && (
                        <span className="inline-block bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 px-2 py-1 rounded text-xs">
                          ⚠️ Possível duplicata
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {isDuplicate && (
                        <button
                          onClick={() => toggleRow(txId)}
                          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                        >
                          {isExpanded ? 'Ocultar' : 'Ver detalhes'}
                        </button>
                      )}
                    </td>
                  </tr>

                  {isDuplicate && isExpanded && (
                    <tr className="bg-yellow-50 dark:bg-yellow-900/10">
                      <td colSpan={7} className="py-4 px-4">
                        <div className="bg-white dark:bg-gray-800 rounded border border-yellow-200 dark:border-yellow-800 p-4">
                          <h4 className="font-semibold text-yellow-900 dark:text-yellow-200 mb-3">
                            Possíveis Duplicatas Encontradas:
                          </h4>
                          <div className="space-y-3">
                            {duplicates.map((dup: any, dupIdx: number) => (
                              <div
                                key={dupIdx}
                                className="border-l-4 border-yellow-400 pl-3 text-sm"
                              >
                                <div className="font-medium text-gray-700 dark:text-gray-300">
                                  Correspondência: {(dup.matchScore * 100).toFixed(0)}%
                                </div>
                                <div className="text-gray-600 dark:text-gray-400 text-xs mt-1">
                                  {dup.reason}
                                </div>
                                <div className="mt-2 text-xs text-gray-500 dark:text-gray-500">
                                  Diferença de datas: {dup.details.dateDiff} dias
                                  {dup.details.amountMatch && ' | Valor idêntico'}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </div>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex gap-2 justify-end pt-4">
        <button
          onClick={onReject}
          disabled={isLoading}
          className="px-4 py-2 bg-gray-300 hover:bg-gray-400 text-gray-800 font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          Rejeitar Importação
        </button>
        <button
          onClick={handleConfirm}
          disabled={isLoading || selectedTransactions.size === 0}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          {isLoading ? 'Confirmando...' : `Confirmar ${selectedTransactions.size} transações`}
        </button>
      </div>

      {selectedTransactions.size < transactions.length && (
        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-sm text-blue-800 dark:text-blue-400">
          💡 {transactions.length - selectedTransactions.size} transação(ões) não
          selecionada(s) será(ão) ignorada(s).
        </div>
      )}
    </div>
  );
}
