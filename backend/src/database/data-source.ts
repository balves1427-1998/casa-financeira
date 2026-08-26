import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';

/**
 * DataSource usado pela CLI do TypeORM (migrations e seeds).
 *
 * A aplicação NestJS configura sua própria conexão em `AppModule` via
 * `TypeOrmModule.forRootAsync`; este arquivo existe para que os comandos
 * `npm run db:run-migrations`, `db:revert` e `db:migrate` funcionem fora do
 * contexto do Nest, onde o `ConfigService` não está disponível.
 */
loadEnv({ path: '.env.development' });
loadEnv({ path: '.env' });

const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  entities: [`${__dirname}/../**/entities/*.entity{.ts,.js}`],
  migrations: [`${__dirname}/migrations/*{.ts,.js}`],
  migrationsTableName: 'migrations',
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
});

export default AppDataSource;
