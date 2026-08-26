# 🚀 Próximos Passos - Começando a Fase 1

## Resumo Rápido

Você tem:
- ✅ Infraestrutura completa (Docker, PostgreSQL, Redis)
- ✅ Backend e Frontend scaffolding
- ✅ Documentação completa
- ✅ 7 fases planejadas

**Agora**: Comece a implementar a Fase 1 (4 semanas)

---

## Passo 1: Clonar/Organizar os Arquivos

```bash
# Se não tiver feito ainda
mkdir -p ~/projects/casa-financeira
cd ~/projects/casa-financeira

# Copie os arquivos que recebi:
# - docker-compose.yml
# - Dockerfile
# - .env.example
# - backend/
# - frontend/
# - etc

# Depois:
git init
git add .
git commit -m "chore: initial project setup"
```

---

## Passo 2: Preparar Ambiente

```bash
# Configure arquivo de ambiente
cp .env.example .env

# Inicie os serviços
docker-compose up -d

# Aguarde ~30 segundos
docker-compose ps

# Verifique se tudo está pronto
curl http://localhost:5432  # PostgreSQL
curl http://localhost:6379  # Redis
```

---

## Passo 3: Começar a Implementação

### Semana 1: Autenticação Backend

**1. Setup Database Inicial**

```bash
# Entre no container backend
docker-compose exec backend bash

# Execute migrations básicas
npm run db:run-migrations

# Verifique no PgAdmin
# http://localhost:5050
# Server: postgres
# User: admin
# Password: admin_dev_password
```

**2. Criar Módulo de Auth**

```bash
# Dentro do container
npm run start:dev

# Em outro terminal, gere o módulo (CLI do NestJS)
docker-compose exec backend npx nest generate resource auth
```

**3. Implementar**

```
backend/src/modules/auth/
├── auth.controller.ts      ← Endpoints
├── auth.service.ts         ← Lógica de negócio
├── auth.module.ts          ← Module declaration
├── dtos/
│   ├── login.dto.ts
│   └── register.dto.ts
├── strategies/
│   ├── jwt.strategy.ts
│   └── local.strategy.ts
└── guards/
    └── jwt-auth.guard.ts
```

**Endpoints para implementar:**
- `POST /auth/register` → Registrar usuário
- `POST /auth/login` → Login com email/senha
- `POST /auth/refresh` → Refresh JWT token
- `GET /auth/me` → Get current user

**Dependências a usar:**
```typescript
// No service
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { PassportStrategy } from '@nestjs/passport';
```

### Semana 2: CRUD de Contas & Dashboard Backend

**1. Criar Módulo de Contas**

```bash
docker-compose exec backend npx nest generate resource accounts
```

**2. Estrutura**

```
backend/src/modules/accounts/
├── accounts.controller.ts
├── accounts.service.ts
├── accounts.module.ts
├── entities/
│   └── account.entity.ts
├── dtos/
│   ├── create-account.dto.ts
│   ├── update-account.dto.ts
│   └── account.dto.ts
└── repositories/
    └── accounts.repository.ts
```

**Endpoints:**
- `POST /accounts` → Criar conta
- `GET /accounts` → Listar contas do usuário
- `GET /accounts/:id` → Get conta específica
- `PUT /accounts/:id` → Atualizar conta
- `DELETE /accounts/:id` → Deletar conta

**Dependência:**
- Apenas usuários autenticados podem acessar
- Contas pertencem ao usuário (verificação)

### Semana 3: Frontend - Auth Pages

**1. Criar páginas de Login**

```
frontend/src/app/(auth)/
├── login/
│   └── page.tsx           ← Login page
├── register/
│   └── page.tsx           ← Register page
└── layout.tsx             ← Auth layout (sem sidebar)
```

**2. Componentes**

```
frontend/src/components/
├── LoginForm.tsx          ← Form de login
├── RegisterForm.tsx       ← Form de register
└── AuthLayout.tsx         ← Layout para auth pages
```

**3. Hooks**

```
frontend/src/hooks/
├── useAuth.ts            ← Auth context/state
└── useLogin.ts           ← Login logic
```

**Tarefas:**
- [ ] Crie LoginForm.tsx (email, password, submit)
- [ ] Crie RegisterForm.tsx (name, email, password)
- [ ] Implemente useAuth hook (store tokens)
- [ ] Crie JWT interceptor (adicionar em requisições)
- [ ] Redirecione após login para /dashboard

### Semana 4: Dashboard Layout & Accounts Page

**1. Layout Principal**

```
frontend/src/app/(dashboard)/
├── layout.tsx             ← AppLayout com sidebar
├── dashboard/
│   └── page.tsx           ← Dashboard principal
└── accounts/
    ├── page.tsx           ← Accounts list
    ├── new/
    │   └── page.tsx       ← Create account
    └── [id]/
        └── edit/page.tsx  ← Edit account
```

**2. Componentes de Layout**

```
frontend/src/components/
├── Sidebar.tsx            ← Menu lateral
├── Header.tsx             ← Header com user menu
├── AppLayout.tsx          ← Container principal
└── Navigation.tsx         ← Items do menu
```

**3. Páginas**

- **Dashboard**: Mockup com alguns cards
- **Accounts**: Tabela listando contas
- **New Account**: Formulário de criação
- **Edit Account**: Formulário de edição

---

## Estrutura de Pastas Final (Fase 1)

```
backend/src/
├── modules/
│   ├── auth/              ← ✨ Novo
│   │   ├── strategies/
│   │   ├── guards/
│   │   ├── dtos/
│   │   ├── auth.service.ts
│   │   ├── auth.controller.ts
│   │   └── auth.module.ts
│   │
│   ├── users/             ← ✨ Novo
│   │   ├── entities/
│   │   ├── dtos/
│   │   ├── users.service.ts
│   │   └── users.module.ts
│   │
│   ├── accounts/          ← ✨ Novo
│   │   ├── entities/
│   │   ├── dtos/
│   │   ├── accounts.service.ts
│   │   ├── accounts.controller.ts
│   │   └── accounts.module.ts
│   │
│   └── ...
│
├── database/
│   ├── migrations/        ← ✨ User, Accounts tables
│   └── seeders/          ← ✨ Dados de teste
│
└── main.ts               ← ✅ Já existe

frontend/src/
├── app/
│   ├── (auth)/           ← ✨ Novo (Login/Register)
│   │   ├── login/
│   │   ├── register/
│   │   └── layout.tsx
│   │
│   ├── (dashboard)/      ← ✨ Novo (Protegido)
│   │   ├── dashboard/
│   │   ├── accounts/
│   │   └── layout.tsx
│   │
│   └── layout.tsx        ← ✅ Já existe
│
├── components/
│   ├── ✅ Button, Input, Card (já existem)
│   ├── ✨ LoginForm.tsx
│   ├── ✨ Sidebar.tsx
│   ├── ✨ Header.tsx
│   └── ...
│
├── hooks/
│   ├── ✨ useAuth.ts     ← Auth hook
│   └── ✨ useLogin.ts
│
└── types/
    └── ✅ index.ts       ← Já existe
```

---

## Checklist de Implementação

### Semana 1
- [ ] Database migrations (users, accounts)
- [ ] Auth module criado
- [ ] JWT strategy implementado
- [ ] Login endpoint funcionando
- [ ] Testes de auth

### Semana 2
- [ ] Accounts module criado
- [ ] CRUD endpoints implementados
- [ ] Dashboard service começado
- [ ] Testes de CRUD

### Semana 3
- [ ] Login page criada
- [ ] Register page criada
- [ ] useAuth hook implementado
- [ ] JWT interceptor configurado
- [ ] Redirecionamento funcionando

### Semana 4
- [ ] AppLayout criado
- [ ] Dashboard page com layout
- [ ] Accounts list page
- [ ] Create/Edit forms
- [ ] Testes E2E básicos

---

## Commits Recomendados

```bash
# Semana 1
git commit -m "feat: add JWT authentication strategy"
git commit -m "feat: implement users and accounts entities"
git commit -m "feat: create auth controller with login/register"
git commit -m "test: add auth service tests"

# Semana 2
git commit -m "feat: create accounts CRUD endpoints"
git commit -m "feat: implement accounts repository pattern"
git commit -m "feat: add accounts service logic"
git commit -m "test: add accounts controller tests"

# Semana 3
git commit -m "feat: create auth pages (login/register)"
git commit -m "feat: implement useAuth hook"
git commit -m "feat: add JWT interceptor"
git commit -m "feat: add form validation with Zod"

# Semana 4
git commit -m "feat: create dashboard layout"
git commit -m "feat: implement sidebar and header"
git commit -m "feat: create accounts management pages"
git commit -m "test: add E2E tests for auth flow"
```

---

## Como Executar

### Terminal 1: Serviços
```bash
cd ~/projects/casa-financeira
docker-compose up -d
```

### Terminal 2: Backend
```bash
cd backend
npm install
npm run start:dev
# Acesse: http://localhost:3000
```

### Terminal 3: Frontend
```bash
cd frontend
npm install
npm run dev
# Acesse: http://localhost:3001
```

---

## Próximos Recursos

- 📖 `arquitectura/03-ESTRATEGIA-TECNICA.md` - Code patterns
- 🗂️ `arquitectura/04-COMPONENTES-CHECKLIST.md` - Componentes React
- 🧪 NestJS Docs: https://docs.nestjs.com
- ⚛️ Next.js Docs: https://nextjs.org/docs

---

## Suporte Rápido

**Erro de porta?**
```bash
# Verifique
lsof -i :3000
kill -9 <PID>

# Ou mude a porta
# Edite docker-compose.yml ou .env
```

**Database connection error?**
```bash
# Verifique se postgres está pronto
docker-compose exec postgres pg_isready -U admin

# Recrie se necessário
docker-compose restart postgres
```

**Dependências faltando?**
```bash
# Backend
cd backend && npm install && npm install --save bcryptjs passport @nestjs/jwt

# Frontend
cd frontend && npm install && npm install react-hook-form zod
```

---

## 🎯 Meta: Fase 1 Completa

Ao final das 4 semanas, você terá:
- ✅ Usuários podem se registrar
- ✅ Usuários podem fazer login
- ✅ Sistema de JWT funcionando
- ✅ Usuários podem criar contas bancárias
- ✅ Dashboard layout pronto
- ✅ Testes básicos implementados

**Total de tempo**: ~40-60 horas de desenvolvimento

---

**Pronto para começar?** 🚀

Comece pelos passos em `Passo 1` e boa sorte!
