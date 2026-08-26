'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';

export interface ExtractedTransaction {
  date: string;
  description: string;
  establishment?: string;
  amount: number;
  type: 'debit' | 'credit';
  transactionId?: string;
  confidence?: number;
  suggestedCategory?: string;
  suggestedSubcategory?: string;
  classificationConfidence?: number;
  potentialDuplicate?: {
    existingId: string;
    matchScore: number;
    reason: string;
  };
}

export interface PdfImportData {
  id: string;
  fileName: string;
  importType: 'bank_statement' | 'credit_card_invoice' | 'unknown';
  bankName?: string;
  cardName?: string;
  extractedData: ExtractedTransaction[];
  transactionCount: number;
  duplicateCount: number;
  status: 'pending_review' | 'reviewing' | 'confirmed' | 'imported' | 'rejected' | 'error';
  errorMessage?: string;
  duplicateMatches?: any[];
  isProcessed: boolean;
  processedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export const usePdfImport = () => {
  const [imports, setImports] = useState<PdfImportData[]>([]);
  const [currentImport, setCurrentImport] = useState<PdfImportData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Upload PDF file
  const uploadPdf = async (file: File): Promise<PdfImportData> => {
    try {
      setIsLoading(true);
      setError(null);
      setUploadProgress(0);

      // Read file as base64
      const fileContent = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // Upload to API
      const data = await apiClient.post('/pdf-import/upload', {
        fileName: file.name,
        fileContent,
      });

      setCurrentImport(data);
      setUploadProgress(100);
      return data;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to upload PDF';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch all imports
  const fetchImports = async (limit: number = 20, offset: number = 0) => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await apiClient.get(`/pdf-import?limit=${limit}&offset=${offset}`);
      setImports(data);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to fetch imports';
      setError(errorMessage);
      console.error('Error fetching imports:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Get import status
  const getImportStatus = async (id: string): Promise<PdfImportData> => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await apiClient.get(`/pdf-import/${id}`);
      setCurrentImport(data);
      return data;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to get import status';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // Review import
  const reviewImport = async (
    id: string,
    review: {
      confirmedTransactions: ExtractedTransaction[];
      rejectedTransactions?: ExtractedTransaction[];
      correctedTransactions?: ExtractedTransaction[];
      notes?: string;
    },
  ): Promise<PdfImportData> => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await apiClient.put(`/pdf-import/${id}/review`, review);
      setCurrentImport(data);
      return data;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to review import';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // Confirm import
  const confirmImport = async (
    id: string,
    selectedTransactionIds?: string[],
  ): Promise<{ imported: number; skipped: number; errors: any[] }> => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await apiClient.put(`/pdf-import/${id}/confirm`, {
        action: 'confirm',
        selectedTransactionIds,
      });

      // Update current import status
      if (currentImport && currentImport.id === id) {
        setCurrentImport({
          ...currentImport,
          status: 'imported',
          isProcessed: true,
        });
      }

      return data;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to confirm import';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // Reject import
  const rejectImport = async (id: string, reason?: string): Promise<PdfImportData> => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await apiClient.put(`/pdf-import/${id}/reject`, { reason });
      setCurrentImport(data);
      return data;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to reject import';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // Delete import
  const deleteImport = async (id: string) => {
    try {
      setIsLoading(true);
      setError(null);
      await apiClient.delete(`/pdf-import/${id}`);
      setImports(imports.filter((imp) => imp.id !== id));
      if (currentImport?.id === id) {
        setCurrentImport(null);
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to delete import';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // Get import statistics
  const getImportStats = async () => {
    try {
      return await apiClient.get('/pdf-import/stats');
    } catch (err) {
      console.error('Error fetching import stats:', err);
      throw err;
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchImports();
  }, []);

  return {
    imports,
    currentImport,
    isLoading,
    error,
    uploadProgress,
    uploadPdf,
    fetchImports,
    getImportStatus,
    reviewImport,
    confirmImport,
    rejectImport,
    deleteImport,
    getImportStats,
  };
};
