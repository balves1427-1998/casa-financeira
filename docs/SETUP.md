# 🚀 Setup Detalhado - Casa Financeira

Este documento guia você através de todo o processo de setup do projeto.

## Pré-requisitos

- Docker e Docker Compose instalados
- Git
- (Opcional) Node.js 18+ para desenvolvimento local

## Opção 1: Setup com Docker (Recomendado)

### 1. Clone e Configure

```bash
# Clone o repositório
git clone <seu-repo> casa-financeira
cd casa-financeira

# Configure as variáveis de ambiente
cp .env.example .env

# Se quiser, edite o .env com suas configurações
nano .env
```

### 2. Inicie os Serviços

```bash
# Build e inicie todos os serviços
docker-compose up -d

# Espere ~30 segundos para tudo ficar pronto
docker-compose ps
```

### 3. Acesse a Aplicação

- **Frontend**: http://localhost:3001
- **Backend API**: http://localhost:3000
- **PgAdmin**: http://localhost:5050
  - Email: admin@casa.local
  - Senha: admin_dev_password

### 4. Primeiras Operações

```bash
# Executar migrations (criar tabelas)
docker-compose exec backend npm run db:run-migrations

# (Opcional) Seedar dados de teste
docker-compose exec backend npm run db:seed
```

## Opção 2: Setup Local (Sem Docker)

### Backend Setup

```bash
cd backend

# Instale dependências
npm install

# Configure o arquivo .env
cp ../.env.example .env.development

# Certifique-se que PostgreSQL está rodando
# (edite .env com as credenciais do seu PostgreSQL)

# Execute migrations
npm run db:run-migrations

# Inicie o servidor
npm run start:dev
```

### Frontend Setup

```bash
cd frontend

# Instale dependências
npm install

# Configure o arquivo .env
cp ../.env.example .env.development

# Inicie o dev server
npm run dev
```

## Estrutura de Pastas

Após o setup, você terá:

```
casa-financeira/
├── backend/
│   ├── src/
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   ├── users/
│   │   │   ├── accounts/
│   │   │   ├── receipts/
│   │   │   ├── expenses/
│   │   │   ├── categories/
│   │   │   ├── credit-cards/
│   │   │   ├── planned-accounts/
│   │   │   ├── dashboard/
│   │   │   ├── import/
│   │   │   ├── alerts/
│   │   │   └── reports/
│   │   └── ...
│   ├── test/
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── (auth)/
│   │   │   ├── (dashboard)/
│   │   │   └── ...
│   │   ├── components/
│   │   ├── lib/
│   │   ├── hooks/
│   │   ├── types/
│   │   └── store/
│   └── package.json
│
└── docker-compose.yml
```

## Desenvolvi Configuração do Banco de Dados

### PostgreSQL

O banco é criado automaticamente pelo docker-compose com:
- **Database**: casa_financeira
- **User**: admin
- **Password**: admin_dev_password
- **Host**: localhost (ou 'postgres' dentro do Docker)
- **Port**: 5432

### Acessar o Banco

#### Via PgAdmin (UI)
1. Acesse http://localhost:5050
2. Login: admin@casa.local / admin_dev_password
3. Clique em "Add New Server"
4. Configure:
   - **Hostname**: postgres
   - **Username**: admin
   - **Password**: admin_dev_password

#### Via CLI
```bash
docker-compose exec postgres psql -U admin -d casa_financeira
```

### Redis

Redis roda em:
- **Host**: localhost (ou 'redis' dentro do Docker)
- **Port**: 6379

Teste a conexão:
```bash
docker-compose exec redis redis-cli ping
# Deve retornar: PONG
```

## Verificação de Saúde

### 1. Verifique os Serviços

```bash
# Ver status
docker-compose ps

# Ver logs
docker-compose logs -f

# Ver logs de um serviço específico
docker-compose logs -f backend
docker-compose logs -f frontend
```

### 2. Teste a API

```bash
# Health check
curl http://localhost:3000/health

# Ou use o Postman/Insomnia para testar endpoints
```

### 3. Verifique o Frontend

```bash
# Abra http://localhost:3001 no navegador
# Deve carregar a página de login
```

## Comandos Úteis

```bash
# Parar serviços
docker-compose down

# Reiniciar um serviço
docker-compose restart backend

# Ver logs em tempo real
docker-compose logs -f

# Limpar volumes (CUIDADO: deleta dados)
docker-compose down -v

# Reconstruir imagens
docker-compose build --no-cache
```

## Troubleshooting

### Porta já em uso

Se receber erro de porta em uso:

```bash
# Encontre o processo
lsof -i :3000

# Mate o processo
kill -9 <PID>

# Ou mude a porta no docker-compose.yml
```

### Banco de dados não conecta

```bash
# Verifique se postgres está pronto
docker-compose exec postgres pg_isready -U admin

# Se não, recrie o serviço
docker-compose up -d postgres
```

### Permissão negada no Docker

```bash
# Se tiver erro de permissão, use sudo
sudo docker-compose up -d
```

## Próximos Passos

1. **Leia a Arquitetura**: `arquitectura/01-PLANO-ARQUITETURA.md`
2. **Implemente Fase 1**: Autenticação + CRUD básico
3. **Implemente Fase 2**: Core Financeiro (Receitas/Despesas)
4. **Continue com as fases**: Seguindo o roadmap

## Support

Se encontrar problemas:

1. Verifique `docker-compose logs`
2. Confirme variáveis de ambiente
3. Verifique documentação em `arquitectura/`
4. Abra uma issue no repositório

---

**Status**: Setup completo! Você está pronto para começar o desenvolvimento! 🚀
