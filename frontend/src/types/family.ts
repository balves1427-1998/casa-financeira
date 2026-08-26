/**
 * Tipos do módulo de Famílias
 *
 * Espelham os DTOs reais do backend em:
 * backend/src/modules/families/dtos/family.dto.ts
 *
 * A família é a unidade de escopo de todo o sistema financeiro: despesas e
 * receitas pertencem a usuários, e usuários pertencem a uma família. Sem
 * família, os endpoints de inteligência financeira respondem 403.
 */

/**
 * Papel do usuário dentro do sistema.
 * O backend guarda `role` como enum ('admin' | 'user') na entidade User.
 */
export type FamilyMemberRole = 'admin' | 'user';

export interface FamilyMemberDto {
  id: string;
  name: string;
  email: string;
  /** 'admin' | 'user' — tipado como string para tolerar novos papéis do backend */
  role: FamilyMemberRole | string;
}

export interface FamilyDto {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  members: FamilyMemberDto[];
  memberCount: number;
  createdAt: Date | string;
}

export interface CreateFamilyDto {
  /** Mínimo de 2 caracteres, máximo de 255 (validado no backend) */
  name: string;
  /** Máximo de 500 caracteres */
  description?: string;
}

export interface UpdateFamilyDto {
  name?: string;
  description?: string;
  isActive?: boolean;
}

/**
 * Adiciona um usuário JÁ CADASTRADO à família, identificado pelo e-mail.
 */
export interface AddFamilyMemberDto {
  email: string;
}

/** Rótulos em português para os papéis dos membros */
export const FAMILY_ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  user: 'Membro',
};
