import { redirect } from 'next/navigation';

/**
 * A aba Metas foi absorvida por **Investimentos**.
 *
 * Objetivos ("caixinha da viagem") e aplicações (CDB, Tesouro, poupança) eram a
 * mesma coisa vista de dois ângulos, e manter as duas telas obrigava a
 * cadastrar a mesma poupança duas vezes — com os números divergindo com o
 * tempo.
 *
 * Esta rota permanece como redirecionamento em vez de ser apagada: quem tiver
 * `/metas` favoritado ou no histórico do navegador chega ao lugar certo, em vez
 * de bater num 404 sem explicação. Os dados são os mesmos — a tabela do backend
 * continua sendo `goals`, nada foi migrado nem perdido.
 */
export default function MetasRedirect() {
  redirect('/investimentos');
}
