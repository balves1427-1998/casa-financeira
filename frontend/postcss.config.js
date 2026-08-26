/**
 * Configuração do PostCSS.
 *
 * Sem este arquivo o Next.js não processa as diretivas do Tailwind em
 * `src/app/globals.css` e nenhuma classe utilitária chega ao CSS final.
 */
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
