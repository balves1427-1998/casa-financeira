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
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3001',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
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

  const port = process.env.API_PORT || 3000;
  await app.listen(port);
  console.log(`🚀 API running on http://localhost:${port}`);
}

bootstrap().catch((error) => {
  console.error('🔴 Failed to start application:', error);
  process.exit(1);
});
