'use client';

import { useState, useCallback, useEffect } from 'react';
import { apiClient } from '@/lib/api';
import {
  AddFamilyMemberDto,
  CreateFamilyDto,
  FamilyDto,
  FamilyMemberDto,
  UpdateFamilyDto,
} from '@/types/family';
import { getApiErrorMessage, getApiErrorStatus } from '@/utils/api-error';

interface UseFamilyState {
  family: FamilyDto | null;
  members: FamilyMemberDto[];
  /**
   * `null` enquanto a primeira carga não terminou.
   * `false` quando o backend confirma que o usuário ainda não tem família
   * (404/403 em GET /families/me) — nesse caso a tela oferece criar uma.
   */
  hasFamily: boolean | null;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
}

/**
 * Hook de gestão da família do usuário autenticado.
 *
 * A família é o escopo de todos os dados financeiros: sem ela, os endpoints
 * de inteligência financeira respondem 403.
 */
export function useFamily() {
  const [state, setState] = useState<UseFamilyState>({
    family: null,
    members: [],
    hasFamily: null,
    isLoading: false,
    isSaving: false,
    error: null,
  });

  const fetchFamily = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const data = await apiClient.getMyFamily();
      setState(prev => ({
        ...prev,
        family: data,
        members: data.members || [],
        hasFamily: true,
        isLoading: false,
      }));
      return data;
    } catch (err) {
      const status = getApiErrorStatus(err);

      // 404/403 aqui não é falha: é o usuário que ainda não pertence a nenhuma família
      if (status === 404 || status === 403) {
        setState(prev => ({
          ...prev,
          family: null,
          members: [],
          hasFamily: false,
          isLoading: false,
          error: null,
        }));
        return null;
      }

      const errorMsg = getApiErrorMessage(err, 'Erro ao carregar a família');
      setState(prev => ({ ...prev, error: errorMsg, isLoading: false }));
      throw err;
    }
  }, []);

  const fetchMembers = useCallback(async (familyId: string) => {
    try {
      const data = await apiClient.getFamilyMembers(familyId);
      setState(prev => ({
        ...prev,
        members: data || [],
        family: prev.family
          ? { ...prev.family, members: data || [], memberCount: (data || []).length }
          : prev.family,
      }));
      return data;
    } catch (err) {
      const errorMsg = getApiErrorMessage(err, 'Erro ao carregar os membros da família');
      setState(prev => ({ ...prev, error: errorMsg }));
      throw err;
    }
  }, []);

  const createFamily = useCallback(async (dto: CreateFamilyDto) => {
    setState(prev => ({ ...prev, isSaving: true, error: null }));
    try {
      const data = await apiClient.createFamily(dto);
      setState(prev => ({
        ...prev,
        family: data,
        members: data.members || [],
        hasFamily: true,
        isSaving: false,
      }));
      return data;
    } catch (err) {
      const errorMsg = getApiErrorMessage(err, 'Erro ao criar a família');
      setState(prev => ({ ...prev, error: errorMsg, isSaving: false }));
      throw err;
    }
  }, []);

  const updateFamily = useCallback(
    async (dto: UpdateFamilyDto, familyId?: string) => {
      const targetId = familyId ?? state.family?.id;

      if (!targetId) {
        const errorMsg = 'Nenhuma família selecionada para atualizar';
        setState(prev => ({ ...prev, error: errorMsg }));
        throw new Error(errorMsg);
      }

      setState(prev => ({ ...prev, isSaving: true, error: null }));
      try {
        const data = await apiClient.updateFamily(targetId, dto);
        setState(prev => ({
          ...prev,
          family: data,
          members: data.members || prev.members,
          isSaving: false,
        }));
        return data;
      } catch (err) {
        const errorMsg = getApiErrorMessage(err, 'Erro ao atualizar a família');
        setState(prev => ({ ...prev, error: errorMsg, isSaving: false }));
        throw err;
      }
    },
    [state.family?.id],
  );

  /**
   * Adiciona um usuário JÁ CADASTRADO à família, pelo e-mail.
   * O backend responde 400 quando o e-mail pertence a outra família e 404
   * quando não existe nenhum usuário com aquele e-mail.
   */
  const addMember = useCallback(
    async (dto: AddFamilyMemberDto, familyId?: string) => {
      const targetId = familyId ?? state.family?.id;

      if (!targetId) {
        const errorMsg = 'Crie uma família antes de adicionar membros';
        setState(prev => ({ ...prev, error: errorMsg }));
        throw new Error(errorMsg);
      }

      setState(prev => ({ ...prev, isSaving: true, error: null }));
      try {
        const member = await apiClient.addFamilyMember(targetId, {
          email: dto.email.trim(),
        });
        setState(prev => {
          const members = [...prev.members, member];
          return {
            ...prev,
            members,
            family: prev.family
              ? { ...prev.family, members, memberCount: members.length }
              : prev.family,
            isSaving: false,
          };
        });
        return member;
      } catch (err) {
        const errorMsg = getApiErrorMessage(err, 'Erro ao adicionar o membro');
        setState(prev => ({ ...prev, error: errorMsg, isSaving: false }));
        throw err;
      }
    },
    [state.family?.id],
  );

  /**
   * Remove um membro. O backend recusa (400) a remoção do último membro.
   */
  const removeMember = useCallback(
    async (memberId: string, familyId?: string) => {
      const targetId = familyId ?? state.family?.id;

      if (!targetId) {
        const errorMsg = 'Nenhuma família selecionada';
        setState(prev => ({ ...prev, error: errorMsg }));
        throw new Error(errorMsg);
      }

      setState(prev => ({ ...prev, isSaving: true, error: null }));
      try {
        await apiClient.removeFamilyMember(targetId, memberId);
        setState(prev => {
          const members = prev.members.filter(member => member.id !== memberId);
          return {
            ...prev,
            members,
            family: prev.family
              ? { ...prev.family, members, memberCount: members.length }
              : prev.family,
            isSaving: false,
          };
        });
        return true;
      } catch (err) {
        const errorMsg = getApiErrorMessage(err, 'Erro ao remover o membro');
        setState(prev => ({ ...prev, error: errorMsg, isSaving: false }));
        throw err;
      }
    },
    [state.family?.id],
  );

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  // Carga inicial
  useEffect(() => {
    fetchFamily().catch(() => undefined);
  }, [fetchFamily]);

  return {
    ...state,
    fetchFamily,
    fetchMembers,
    createFamily,
    updateFamily,
    addMember,
    removeMember,
    clearError,
  };
}
