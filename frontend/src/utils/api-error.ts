import axios from 'axios';

/**
 * Extrai a mensagem legível de um erro vindo da API.
 *
 * O backend (NestJS) responde erros no formato
 * `{ statusCode, message: string | string[], error }` — por exemplo:
 * - 403 quando o usuário não é membro da família
 * - 400 quando o e-mail informado já pertence a outra família
 *
 * Sem esse tratamento, `err.message` do axios mostraria apenas
 * "Request failed with status code 400", escondendo a explicação real.
 */
export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as
      | { message?: string | string[]; error?: string }
      | undefined;

    if (Array.isArray(data?.message) && data!.message.length > 0) {
      return data!.message.join(', ');
    }

    if (typeof data?.message === 'string' && data.message.trim()) {
      return data.message;
    }

    if (typeof data?.error === 'string' && data.error.trim()) {
      return data.error;
    }

    if (!error.response) {
      return 'Não foi possível falar com o servidor. Verifique sua conexão.';
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

/**
 * Código HTTP do erro, quando houver.
 * Usado para diferenciar "usuário ainda sem família" (404/403) de falhas reais.
 */
export function getApiErrorStatus(error: unknown): number | undefined {
  if (axios.isAxiosError(error)) {
    return error.response?.status;
  }
  return undefined;
}
