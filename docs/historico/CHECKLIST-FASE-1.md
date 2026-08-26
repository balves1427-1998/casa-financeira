# ✅ Checklist Fase 1 - Foundation & Setup

## Objetivo da Fase 1
Configurar a base da arquitetura com autenticação, CRUDs básicos e estrutura de projeto pronta para desenvolvimento.

**Duração**: 4 semanas (Semanas 1-4)
**Status**: ✅ Setup Inicial Completo | Aguardando Implementação

---

## ✅ Seção 1: Infraestrutura & Setup (COMPLETO)

### Docker & Ambiente
- [x] Docker-compose com PostgreSQL 16
- [x] Docker-compose com Redis 7
- [x] Docker-compose com PgAdmin
- [x] .env.example configurado
- [x] Dockerfile multi-stage
- [x] Scripts de inicialização
- [x] Documentação de setup

### Dependências & Configuração
- [x] Backend: NestJS + TypeORM
- [x] Frontend: Next.js + React
- [x] Tailwind CSS configurado
- [x] TypeScript configured
- [x] ESLint & Prettier
- [x] Jest setup (Backend)
- [x] Playwright setup (Frontend)

---

## 📋 Seção 2: Backend - Autenticação JWT (TODO - Próximo)

### Estrutura Base
- [ ] Criar módulo `auth/`
- [ ] Criar entidade `User`
- [ ] Criar repositório `UsersRepository`
- [ ] Criar service `AuthService`
- [ ] Criar controller `AuthController`

### Endpoints de Auth
- [ ] `POST /auth/register` - Registrar novo usuário
- [ ] `POST /auth/login` - Login com email/senha
- [ ] `POST /auth/refresh` - Refresh token
- [ ] `POST /auth/logout` - Logout
- [ ] `GET /auth/me` - Get current user

### Segurança
- [ ] Hash de senhas (bcryptjs)
- [ ] JWT Guard implementado
- [ ] Refresh token strategy
- [ ] Validação de email
- [ ] Rate limiting
- [ ] CORS configurado

---

## 📋 Seção 3: Database - Schema & Migrations (TODO - Próximo)

### Tabelas Principais
- [ ] `users` - Usuários do sistema
- [ ] `accounts` - Contas bancárias
- [ ] `credit_cards` - Cartões de crédito
- [ ] `categories` - Categorias de gasto
- [ ] `receipts` - Receitas
- [ ] `expenses` - Despesas

### Migrations
- [ ] Migration: Create users table
- [ ] Migration: Create accounts table
- [ ] Migration: Create credit_cards table
- [ ] Migration: Create categories table
- [ ] Migration: Create receipts table
- [ ] Migration: Create expenses table

### Índices & Performance
- [ ] Índices em foreign keys
- [ ] Índices em datas
- [ ] Índices em buscas frequentes
- [ ] Views for dashboards

---

## 📋 Seção 4: Backend - CRUD Básicos (TODO)

### Módulo Users
- [ ] `GET /users/:id` - Get user by ID
- [ ] `PUT /users/:id` - Update user
- [ ] `DELETE /users/:id` - Delete user
- [ ] `GET /users` - List all users

### Módulo Accounts
- [ ] `POST /accounts` - Create account
- [ ] `GET /accounts` - List accounts
- [ ] `GET /accounts/:id` - Get account
- [ ] `PUT /accounts/:id` - Update account
- [ ] `DELETE /accounts/:id` - Delete account

### Módulo Categories
- [ ] `POST /categories` - Create category
- [ ] `GET /categories` - List categories
- [ ] `PUT /categories/:id` - Update category
- [ ] `DELETE /categories/:id` - Delete category

### DTOs & Validation
- [ ] DTO: CreateUserDto
- [ ] DTO: UpdateUserDto
- [ ] DTO: CreateAccountDto
- [ ] DTO: UpdateAccountDto
- [ ] Validators para cada DTO

---

## 📋 Seção 5: Frontend - Login & Layout (TODO)

### Páginas de Autenticação
- [ ] Página `/login` - Login
- [ ] Página `/register` - Registro
- [ ] Página `/forgot-password` - Recuperar senha
- [ ] Redirecionamento automático

### Layout Principal
- [ ] Componente `AppLayout`
- [ ] Sidebar com navegação
- [ ] Header com user menu
- [ ] Breadcrumbs
- [ ] Dark mode toggle

### Componentes Reutilizáveis
- [ ] ✅ Button (já criado)
- [ ] ✅ Input (já criado)
- [ ] ✅ Card (já criado)
- [ ] [ ] Modal/Dialog
- [ ] [ ] Toast/Notifications
- [ ] [ ] Loading Spinner
- [ ] [ ] Table component
- [ ] [ ] Pagination

### Formulários
- [ ] Login form com validação
- [ ] Register form com validação
- [ ] Create account form
- [ ] Update account form

---

## 📋 Seção 6: Frontend - Pages & Routing (TODO)

### Estrutura de Routes
```
/                      → Redirect to /dashboard
/login                 → Login page
/register              → Register page
/dashboard             → Dashboard principal
/accounts              → Gerenciamento de contas
/accounts/new          → Criar conta
/accounts/:id/edit     → Editar conta
```

### Pages a Criar
- [ ] `app/layout.tsx` - Root layout com AppLayout
- [ ] `app/page.tsx` - Home (redirect)
- [ ] `app/(auth)/login/page.tsx` - Login
- [ ] `app/(auth)/register/page.tsx` - Register
- [ ] `app/(dashboard)/dashboard/page.tsx` - Dashboard
- [ ] `app/(dashboard)/accounts/page.tsx` - Accounts list
- [ ] `app/(dashboard)/accounts/new/page.tsx` - New account
- [ ] `app/(dashboard)/accounts/[id]/edit/page.tsx` - Edit account

---

## 📋 Seção 7: Testes (TODO)

### Backend Tests
- [ ] Tests para AuthService
- [ ] Tests para UsersService
- [ ] Tests para AccountsService
- [ ] Tests para Controllers (e2e)
- [ ] Coverage > 80%

### Frontend Tests
- [ ] Tests para LoginPage
- [ ] Tests para AccountsPage
- [ ] Tests para componentes
- [ ] Coverage > 70%

---

## 📋 Seção 8: Documentação (TODO)

### API Docs
- [ ] Swagger/OpenAPI setup
- [ ] Documentar todos os endpoints
- [ ] Documentar modelos de dados

### Code Docs
- [ ] README atualizado
- [ ] Contributing guide
- [ ] Architecture decisions (ADR)

---

## 🎯 Critérios de Aceitação

Para a Fase 1 estar **completa**, todos estes devem estar ✅:

- [x] Projeto pode ser clonado e iniciado com `docker-compose up`
- [x] Frontend carrega em `http://localhost:3001`
- [x] Backend roda em `http://localhost:3000`
- [ ] Login funciona e retorna JWT
- [ ] Usuário pode criar conta
- [ ] Usuário pode criar/editar contas bancárias
- [ ] Dashboard mostra dados do usuário logado
- [ ] Todos os testes passam
- [ ] Não há console errors
- [ ] Documentação está atualizada

---

## 📊 Dependências Entre Tarefas

```
Infraestrutura (✅)
    ↓
Auth Backend → Auth Frontend
    ↓                ↓
Database Schema    Login/Register pages
    ↓                ↓
CRUD Accounts → Dashboard Layout
    ↓
Tests & Docs
```

---

## 🚀 Como Usar Este Checklist

1. **Leia o arquivo** todo para entender o escopo
2. **Siga a ordem**: Seção 2 → Seção 3 → ... → Seção 8
3. **Marque com [x]** ao completar cada task
4. **Comita regularmente** com mensagens descritivas
5. **Atualize este arquivo** em cada commit

---

## 💡 Tips & Tricks

### Backend
- Use `nest generate` para scaffolding
- Use `typeorm migration:generate` para gerar migrations
- Execute `npm run db:seed` para dados de teste

### Frontend
- Use `app/(auth)` para rotas de autenticação
- Use `app/(dashboard)` para rotas protegidas
- Guarde tokens em `localStorage` (não em cookies por simplicidade inicial)

### Git Commits
```bash
# Auth backend
git commit -m "feat: implement JWT authentication"

# Database
git commit -m "feat: create users and accounts schema"

# CRUD endpoints
git commit -m "feat: implement accounts CRUD endpoints"

# Frontend login
git commit -m "feat: create login and register pages"
```

---

## 📞 Suporte

- Dúvidas sobre arquitetura? → Consulte `arquitectura/01-PLANO-ARQUITETURA.md`
- Dúvidas sobre setup? → Consulte `SETUP.md`
- Dúvidas sobre tipos? → Veja `frontend/src/types/index.ts`

---

**Última Atualização**: 2024-08-25
**Responsável**: Bruno Alves
**Status**: 🚀 Setup Inicial Completo - Pronto para Fase 1 de Implementação
