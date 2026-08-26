import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe, ClassSerializerInterceptor } from '@nestjs/common';
import { AppModule } from './app.module';
import helmet from 'helmet';
// import * as Sentry from '@sentry/nestjs';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Security
  app.use(helmet());

  // CORS
  //
  // `FRONTEND_URL` aceita uma lista separada por vírgula: em produção é comum
  // precisar liberar o domínio final e as URLs de preview da Vercel ao mesmo
  // tempo. `exposedHeaders` é obrigatório para o download de relatórios — sem
  // ele o navegador esconde o `Content-Disposition` e o arquivo baixa sem nome.
  const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:3001')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Disposition'],
  });

  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Serialização das respostas.
  //
  // Sem este interceptor, os campos marcados com `@Exclude()` nas entidades são
  // ignorados e acabam na resposta HTTP: qualquer consulta que carregue a
  // relação `user` devolvia o hash bcrypt da senha e o refresh token.
  // É a defesa de última linha — as consultas também não devem carregar a
  // relação `user` sem necessidade.
  app.useGlobalInterceptors(
    new ClassSerializerInterceptor(app.get(Reflector)),
  );

  // Sentry Error Tracking (if enabled)
  // if (process.env.SENTRY_DSN) {
  //   Sentry.init({
  //     dsn: process.env.SENTRY_DSN,
  //     environment: process.env.NODE_ENV,
  //     tracesSampleRate: 0.1,
  //   });
  // }

  // As plataformas de hospedagem (Railway, Render, Fly, Heroku) injetam `PORT`
  // e roteiam o tráfego para ela. Ignorar essa variável faz o deploy falhar no
  // health check, mesmo com a aplicação no ar.
  const port = process.env.PORT || process.env.API_PORT || 3000;

  // `0.0.0.0` é necessário dentro de contêiner: em `localhost` o processo só
  // aceitaria conexões de dentro do próprio contêiner.
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 API running on port ${port}`);
}

bootstrap().catch((error) => {
  console.error('🔴 Failed to start application:', error);
  process.exit(1);
});
