'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useFamily } from '@/hooks/useFamily';
import { FAMILY_ROLE_LABELS } from '@/types/family';
import { formatDateBR } from '@/utils/format';
import {
  AlertCircle,
  Check,
  Home,
  Loader2,
  Mail,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';

export default function FamiliaPage() {
  const {
    family,
    members,
    hasFamily,
    isLoading,
    isSaving,
    error,
    createFamily,
    updateFamily,
    addMember,
    removeMember,
    clearError,
  } = useFamily();

  // Formulário de edição da família existente
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  // Formulário de criação (usuário ainda sem família)
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');

  // Adicionar membro por e-mail
  const [memberEmail, setMemberEmail] = useState('');

  // Confirmação inline de remoção (sem window.confirm: diálogos nativos
  // travam a automação do navegador)
  const [confirmingRemovalId, setConfirmingRemovalId] = useState<string | null>(null);

  const [feedback, setFeedback] = useState<string | null>(null);

  // Sincroniza os campos editáveis quando a família é carregada/atualizada
  useEffect(() => {
    if (family) {
      setName(family.name);
      setDescription(family.description || '');
    }
  }, [family]);

  const handleSaveFamily = async (event: FormEvent) => {
    event.preventDefault();
    setFeedback(null);
    try {
      await updateFamily({ name: name.trim(), description: description.trim() });
      setFeedback('Dados da família atualizados com sucesso.');
    } catch {
      // O erro já é exibido pelo estado do hook
    }
  };

  const handleCreateFamily = async (event: FormEvent) => {
    event.preventDefault();
    setFeedback(null);
    try {
      await createFamily({
        name: newName.trim(),
        description: newDescription.trim() || undefined,
      });
      setNewName('');
      setNewDescription('');
      setFeedback('Família criada com sucesso.');
    } catch {
      // O erro já é exibido pelo estado do hook
    }
  };

  const handleAddMember = async (event: FormEvent) => {
    event.preventDefault();
    setFeedback(null);
    try {
      const member = await addMember({ email: memberEmail });
      setMemberEmail('');
      setFeedback(`${member.name} agora faz parte da família.`);
    } catch {
      // O erro já é exibido pelo estado do hook
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    setFeedback(null);
    try {
      await removeMember(memberId);
      setConfirmingRemovalId(null);
      setFeedback('Membro removido da família.');
    } catch {
      setConfirmingRemovalId(null);
    }
  };

  const isNameValid = name.trim().length >= 2;
  const isNewNameValid = newName.trim().length >= 2;
  const isEmailValid = /\S+@\S+\.\S+/.test(memberEmail.trim());

  return (
    <div className="max-w-5xl mx-auto p-6 md:p-8 space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Users className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
            Minha Família
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            A família é o escopo de todos os lançamentos: despesas, receitas e
            análises somam o que todos os membros registram.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center gap-2"
        >
          <Home className="w-4 h-4" />
          Voltar ao painel
        </Link>
      </div>

      {/* Erro da API */}
      {error && (
        <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/20 p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold text-red-900 dark:text-red-100">
              Não foi possível concluir a operação
            </h3>
            <p className="text-sm text-red-800 dark:text-red-200 mt-1">{error}</p>
          </div>
          <button
            onClick={clearError}
            aria-label="Fechar aviso de erro"
            className="text-red-600 dark:text-red-300 hover:text-red-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Confirmação de sucesso */}
      {feedback && (
        <div className="rounded-lg border border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/20 p-4 flex items-start gap-3">
          <Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-green-800 dark:text-green-200 flex-1">{feedback}</p>
          <button
            onClick={() => setFeedback(null)}
            aria-label="Fechar aviso de sucesso"
            className="text-green-700 dark:text-green-300 hover:text-green-900"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Carregando */}
      {isLoading && hasFamily === null && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-6 w-1/3 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="h-24 bg-gray-200 dark:bg-gray-700 rounded" />
          </div>
        </div>
      )}

      {/* Usuário ainda sem família */}
      {hasFamily === false && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
            Você ainda não pertence a nenhuma família
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-5">
            Crie uma família para começar a registrar os lançamentos da casa. Sem
            ela, as telas de inteligência financeira não conseguem carregar seus
            dados.
          </p>

          <form onSubmit={handleCreateFamily} className="space-y-4">
            <div>
              <label
                htmlFor="new-family-name"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Nome da família
              </label>
              <input
                id="new-family-name"
                type="text"
                value={newName}
                onChange={event => setNewName(event.target.value)}
                placeholder="Ex.: Casa do Bruno e da Giovanna"
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Mínimo de 2 caracteres.
              </p>
            </div>

            <div>
              <label
                htmlFor="new-family-description"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Descrição (opcional)
              </label>
              <textarea
                id="new-family-description"
                value={newDescription}
                onChange={event => setNewDescription(event.target.value)}
                rows={2}
                placeholder="Ex.: Controle financeiro da casa"
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <button
              type="submit"
              disabled={!isNewNameValid || isSaving}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors flex items-center gap-2"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Users className="w-4 h-4" />
              )}
              Criar família
            </button>
          </form>
        </div>
      )}

      {/* Família existente */}
      {hasFamily === true && family && (
        <div className="space-y-6">
          {/* Dados da família */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Dados da família
              </h2>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                  {family.memberCount}{' '}
                  {family.memberCount === 1 ? 'membro' : 'membros'}
                </span>
                <span className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                  Criada em {formatDateBR(family.createdAt)}
                </span>
                <span
                  className={`px-2 py-1 rounded ${
                    family.isActive
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                  }`}
                >
                  {family.isActive ? 'Ativa' : 'Inativa'}
                </span>
              </div>
            </div>

            <form onSubmit={handleSaveFamily} className="space-y-4">
              <div>
                <label
                  htmlFor="family-name"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  Nome
                </label>
                <input
                  id="family-name"
                  type="text"
                  value={name}
                  onChange={event => setName(event.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label
                  htmlFor="family-description"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  Descrição
                </label>
                <textarea
                  id="family-description"
                  value={description}
                  onChange={event => setDescription(event.target.value)}
                  rows={2}
                  placeholder="Ex.: Controle financeiro da casa"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <button
                type="submit"
                disabled={!isNameValid || isSaving}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors flex items-center gap-2"
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                Salvar alterações
              </button>
            </form>
          </div>

          {/* Membros */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-5 flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              Membros
            </h2>

            {members.length === 0 ? (
              <p className="text-sm text-gray-600 dark:text-gray-400 py-4 text-center">
                Nenhum membro cadastrado nesta família.
              </p>
            ) : (
              <ul className="space-y-3">
                {members.map(member => (
                  <li
                    key={member.id}
                    className="rounded-lg border border-gray-200 dark:border-gray-700 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 dark:text-white truncate">
                          {member.name}
                        </p>
                        <p className="text-sm text-gray-600 dark:text-gray-400 truncate flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5" />
                          {member.email}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            member.role === 'admin'
                              ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-200'
                              : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                          }`}
                        >
                          {FAMILY_ROLE_LABELS[member.role] || member.role}
                        </span>

                        {confirmingRemovalId !== member.id && (
                          <button
                            onClick={() => setConfirmingRemovalId(member.id)}
                            disabled={isSaving}
                            className="px-3 py-1.5 rounded text-xs font-medium border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50 transition-colors flex items-center gap-1.5"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Remover
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Confirmação inline — sem diálogo nativo */}
                    {confirmingRemovalId === member.id && (
                      <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 rounded bg-red-50 dark:bg-red-950/20 p-3">
                        <p className="text-sm text-red-800 dark:text-red-200 mb-3">
                          Remover <strong>{member.name}</strong> da família? Os
                          lançamentos já registrados por essa pessoa deixarão de
                          aparecer nos totais da casa.
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => handleRemoveMember(member.id)}
                            disabled={isSaving}
                            className="px-3 py-1.5 rounded text-xs font-medium bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white transition-colors flex items-center gap-1.5"
                          >
                            {isSaving ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                            Confirmar remoção
                          </button>
                          <button
                            onClick={() => setConfirmingRemovalId(null)}
                            className="px-3 py-1.5 rounded text-xs font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Adicionar membro */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              Adicionar membro
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              A pessoa já precisa ter uma conta no sistema. Informe o e-mail do
              cadastro dela.
            </p>

            <form onSubmit={handleAddMember} className="flex flex-col sm:flex-row gap-3">
              <input
                id="member-email"
                type="email"
                value={memberEmail}
                onChange={event => setMemberEmail(event.target.value)}
                placeholder="email@exemplo.com"
                aria-label="E-mail do novo membro"
                className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="submit"
                disabled={!isEmailValid || isSaving}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <UserPlus className="w-4 h-4" />
                )}
                Adicionar
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
