'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  ReportDto,
  GenerateReportDto,
  SendReportDto,
  SaveAsTemplateDto,
  ReportTemplate,
} from '@/types/reports';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

interface UseReportsState {
  reports: ReportDto[];
  templates: ReportTemplate[];
  currentReport: ReportDto | null;
  isLoading: boolean;
  isGenerating: boolean;
  error: string | null;
}

export function useReports() {
  const [state, setState] = useState<UseReportsState>({
    reports: [],
    templates: [],
    currentReport: null,
    isLoading: false,
    isGenerating: false,
    error: null,
  });

  // ==================== GENERATE REPORT ====================

  const generateReport = useCallback(async (dto: GenerateReportDto) => {
    setState(prev => ({ ...prev, isGenerating: true, error: null }));
    try {
      const response = await fetch(`${API_BASE}/reports/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify(dto),
      });

      if (!response.ok) throw new Error('Failed to generate report');
      const report = await response.json();

      setState(prev => ({
        ...prev,
        currentReport: report,
        reports: [report, ...prev.reports],
        isGenerating: false,
      }));
      return report;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setState(prev => ({ ...prev, error: errorMsg, isGenerating: false }));
      throw err;
    }
  }, []);

  // ==================== GET REPORT ====================

  const getReport = useCallback(async (reportId: string) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const response = await fetch(`${API_BASE}/reports/${reportId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (!response.ok) throw new Error('Failed to fetch report');
      const report = await response.json();

      setState(prev => ({
        ...prev,
        currentReport: report,
        isLoading: false,
      }));
      return report;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setState(prev => ({ ...prev, error: errorMsg, isLoading: false }));
      throw err;
    }
  }, []);

  // ==================== LIST REPORTS ====================

  const listReports = useCallback(async (limit: number = 20, offset: number = 0) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const params = new URLSearchParams();
      params.append('limit', limit.toString());
      params.append('offset', offset.toString());

      const response = await fetch(`${API_BASE}/reports?${params}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (!response.ok) throw new Error('Failed to fetch reports');
      const data = await response.json();

      setState(prev => ({
        ...prev,
        reports: data.reports,
        isLoading: false,
      }));
      return data;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setState(prev => ({ ...prev, error: errorMsg, isLoading: false }));
      throw err;
    }
  }, []);

  // ==================== SEND REPORT ====================

  const sendReport = useCallback(async (reportId: string, dto: SendReportDto) => {
    try {
      const response = await fetch(`${API_BASE}/reports/${reportId}/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify(dto),
      });

      if (!response.ok) throw new Error('Failed to send report');
      const result = await response.json();

      // Update current report
      if (state.currentReport && state.currentReport.id === reportId) {
        setState(prev => ({
          ...prev,
          currentReport: {
            ...prev.currentReport!,
            sentToEmail: true,
            sentAt: new Date(),
            recipientEmails: dto.recipientEmails,
          },
        }));
      }

      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setState(prev => ({ ...prev, error: errorMsg }));
      throw err;
    }
  }, [state.currentReport]);

  // ==================== SAVE AS TEMPLATE ====================

  const saveAsTemplate = useCallback(async (reportId: string, dto: SaveAsTemplateDto) => {
    try {
      const response = await fetch(`${API_BASE}/reports/${reportId}/template`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify(dto),
      });

      if (!response.ok) throw new Error('Failed to save template');
      const result = await response.json();

      // Refresh templates
      await getTemplates();

      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setState(prev => ({ ...prev, error: errorMsg }));
      throw err;
    }
  }, []);

  // ==================== GET TEMPLATES ====================

  const getTemplates = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const response = await fetch(`${API_BASE}/reports/templates/list`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (!response.ok) throw new Error('Failed to fetch templates');
      const templates = await response.json();

      setState(prev => ({
        ...prev,
        templates,
        isLoading: false,
      }));
      return templates;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setState(prev => ({ ...prev, error: errorMsg, isLoading: false }));
      throw err;
    }
  }, []);

  // ==================== DELETE REPORT ====================

  const deleteReport = useCallback(async (reportId: string) => {
    try {
      const response = await fetch(`${API_BASE}/reports/${reportId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (!response.ok) throw new Error('Failed to delete report');

      // Remove from list
      setState(prev => ({
        ...prev,
        reports: prev.reports.filter(r => r.id !== reportId),
        currentReport: prev.currentReport?.id === reportId ? null : prev.currentReport,
      }));

      return true;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setState(prev => ({ ...prev, error: errorMsg }));
      throw err;
    }
  }, []);

  // ==================== DOWNLOAD FILE ====================

  const downloadFile = useCallback((report: ReportDto) => {
    if (!report.fileUrl) return;

    const link = document.createElement('a');
    link.href = report.fileUrl;
    link.download = report.fileName || `report_${report.id}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  // Auto-load reports on mount
  useEffect(() => {
    listReports();
    getTemplates();
  }, [listReports, getTemplates]);

  return {
    ...state,
    generateReport,
    getReport,
    listReports,
    sendReport,
    saveAsTemplate,
    getTemplates,
    deleteReport,
    downloadFile,
  };
}
