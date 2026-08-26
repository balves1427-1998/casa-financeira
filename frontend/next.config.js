/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  images: {
    unoptimized: true,
  },
  // Não declare `NEXT_PUBLIC_*` aqui.
  //
  // O bloco `env` do Next tem precedência sobre as variáveis do ambiente, então
  // `NEXT_PUBLIC_API_URL: process.env.API_URL || 'http://localhost:3000'`
  // descartava o valor configurado na Vercel e o build de produção acabava
  // apontando para localhost — falha silenciosa, difícil de diagnosticar.
  //
  // Variáveis com o prefixo `NEXT_PUBLIC_` já são expostas ao navegador
  // automaticamente; basta defini-las no painel da hospedagem ou no `.env.local`.
  headers: async () => {
    return [
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
