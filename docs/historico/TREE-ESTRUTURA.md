# 🌳 Estrutura Completa do Projeto - Casa Financeira

## Visualização em Árvore

```
casa-financeira/
│
├── 📄 README.md                          ← Documentação principal
├── 📄 SETUP.md                           ← Guia de setup
├── 📄 PROXIMOS-PASSOS.md                 ← Implementação Fase 1
├── 📄 CHECKLIST-FASE-1.md                ← Checklist de tarefas
├── 📄 ARQUIVOS-CRIADOS.md                ← Inventário
├── 📄 TREE-ESTRUTURA.md                  ← Este arquivo
│
├── 📄 docker-compose.yml                 ← Orquestração (PostgreSQL, Redis, PgAdmin)
├── 📄 Dockerfile                         ← Build multi-stage
├── 📄 .env.example                       ← Template de environment
├── 📄 .gitignore                         ← Git ignore rules
│
├── 📁 backend/ (NestJS API)
│   ├── 📄 package.json                   ← Dependencies: 50+ packages
│   ├── 📄 tsconfig.json                  ← TypeScript config
│   ├── 📄 .env.development               ← Dev environment
│   ├── 📄 .eslintrc.json                 ← Linting
│   ├── 📄 jest.config.js                 ← Tests config
│   │
│   ├── 📁 src/
│   │   ├── 📄 main.ts                    ← Bootstrap com Helmet, CORS, Validation
│   │   ├── 📄 app.module.ts              ← Root module com 11 submodules
│   │   │
│   │   ├── 📁 modules/ (ESTRUTURA PLANEJADA)
│   │   │   ├── 📁 auth/                  ← 🔐 Autenticação JWT
│   │   │   │   ├── auth.service.ts
│   │   │   │   ├── auth.controller.ts
│   │   │   │   ├── auth.module.ts
│   │   │   │   ├── 📁 strategies/
│   │   │   │   │   ├── jwt.strategy.ts
│   │   │   │   │   └── local.strategy.ts
│   │   │   │   ├── 📁 guards/
│   │   │   │   │   └── jwt-auth.guard.ts
│   │   │   │   └── 📁 dtos/
│   │   │   │       ├── login.dto.ts
│   │   │   │       └── register.dto.ts
│   │   │   │
│   │   │   ├── 📁 users/                 ← 👥 Gerenciamento de Usuários
│   │   │   │   ├── users.service.ts
│   │   │   │   ├── users.controller.ts
│   │   │   │   ├── users.module.ts
│   │   │   │   ├── 📁 entities/
│   │   │   │   │   └── user.entity.ts
│   │   │   │   └── 📁 dtos/
│   │   │   │       ├── create-user.dto.ts
│   │   │   │       └── update-user.dto.ts
│   │   │   │
│   │   │   ├── 📁 accounts/              ← 🏦 Contas Bancárias
│   │   │   │   ├── accounts.service.ts
│   │   │   │   ├── accounts.controller.ts
│   │   │   │   ├── accounts.module.ts
│   │   │   │   ├── 📁 entities/
│   │   │   │   │   └── account.entity.ts
│   │   │   │   ├── 📁 dtos/
│   │   │   │   ├── 📁 repositories/
│   │   │   │   │   └── accounts.repository.ts
│   │   │   │   └── 📁 interfaces/
│   │   │   │
│   │   │   ├── 📁 receipts/              ← 💰 Receitas
│   │   │   │   ├── receipts.service.ts
│   │   │   │   ├── receipts.controller.ts
│   │   │   │   ├── receipts.module.ts
│   │   │   │   └── 📁 entities/
│   │   │   │
│   │   │   ├── 📁 expenses/              ← 💸 Despesas
│   │   │   │   ├── expenses.service.ts
│   │   │   │   ├── expenses.controller.ts
│   │   │   │   ├── expenses.module.ts
│   │   │   │   └── 📁 entities/
│   │   │   │
│   │   │   ├── 📁 categories/            ← 🏷️ Categorias
│   │   │   │   ├── categories.service.ts
│   │   │   │   ├── categories.controller.ts
│   │   │   │   ├── categories.module.ts
│   │   │   │   └── 📁 entities/
│   │   │   │
│   │   │   ├── 📁 credit-cards/          ← 💳 Cartões de Crédito
│   │   │   │   ├── credit-cards.service.ts
│   │   │   │   ├── credit-cards.controller.ts
│   │   │   │   ├── credit-cards.module.ts
│   │   │   │   └── 📁 entities/
│   │   │   │
│   │   │   ├── 📁 planned-accounts/      ← 📅 Contas Planejadas
│   │   │   │   ├── planned-accounts.service.ts
│   │   │   │   ├── planned-accounts.controller.ts
│   │   │   │   ├── planned-accounts.module.ts
│   │   │   │   └── 📁 entities/
│   │   │   │
│   │   │   ├── 📁 dashboard/             ← 📊 Dashboard
│   │   │   │   ├── dashboard.service.ts
│   │   │   │   ├── dashboard.controller.ts
│   │   │   │   └── dashboard.module.ts
│   │   │   │
│   │   │   ├── 📁 import/                ← 📄 Importação de PDFs
│   │   │   │   ├── import.service.ts
│   │   │   │   ├── import.controller.ts
│   │   │   │   ├── import.module.ts
│   │   │   │   └── 📁 processors/
│   │   │   │
│   │   │   ├── 📁 alerts/                ← 🔔 Alertas & Notificações
│   │   │   │   ├── alerts.service.ts
│   │   │   │   ├── alerts.controller.ts
│   │   │   │   ├── alerts.module.ts
│   │   │   │   └── 📁 queue/
│   │   │   │
│   │   │   └── 📁 reports/               ← 📈 Relatórios
│   │   │       ├── reports.service.ts
│   │   │       ├── reports.controller.ts
│   │   │       ├── reports.module.ts
│   │   │       └── 📁 generators/
│   │   │
│   │   ├── 📁 common/ (COMPARTILHADO)
│   │   │   ├── 📁 decorators/
│   │   │   │   ├── get-current-user.decorator.ts
│   │   │   │   └── is-public.decorator.ts
│   │   │   ├── 📁 filters/
│   │   │   │   └── http-exception.filter.ts
│   │   │   ├── 📁 interceptors/
│   │   │   │   ├── logging.interceptor.ts
│   │   │   │   └── transform.interceptor.ts
│   │   │   ├── 📁 guards/
│   │   │   │   └── jwt-auth.guard.ts
│   │   │   └── 📁 pipes/
│   │   │       └── validation.pipe.ts
│   │   │
│   │   └── 📁 database/
│   │       ├── 📁 migrations/
│   │       │   ├── 001-create-users-table.ts
│   │       │   ├── 002-create-accounts-table.ts
│   │       │   ├── 003-create-receipts-table.ts
│   │       │   ├── 004-create-expenses-table.ts
│   │       │   ├── 005-create-categories-table.ts
│   │       │   └── ...
│   │       └── 📁 seeders/
│   │           └── seed.ts
│   │
│   ├── 📁 test/
│   │   ├── app.e2e-spec.ts
│   │   ├── auth.e2e-spec.ts
│   │   └── jest-e2e.json
│   │
│   └── 📄 Dockerfile.backend              ← (Opcional)
│
│
├── 📁 frontend/ (Next.js + React)
│   ├── 📄 package.json                   ← Dependencies: 22+ packages
│   ├── 📄 tsconfig.json                  ← TypeScript config
│   ├── 📄 next.config.js                 ← Next.js config
│   ├── 📄 tailwind.config.ts             ← Tailwind design system
│   ├── 📄 postcss.config.js              ← PostCSS config
│   ├── 📄 .eslintrc.json                 ← Linting
│   ├── 📄 .env.development               ← Dev environment
│   ├── 📄 jest.config.js                 ← Tests config
│   ├── 📄 playwright.config.ts           ← E2E tests config
│   │
│   ├── 📁 src/
│   │   ├── 📁 app/ (ESTRUTURA PLANEJADA)
│   │   │   ├── 📁 (auth)/                ← 🔐 Rotas de autenticação
│   │   │   │   ├── layout.tsx             ← Auth layout (sem sidebar)
│   │   │   │   ├── 📁 login/
│   │   │   │   │   └── page.tsx          ← Login page
│   │   │   │   └── 📁 register/
│   │   │   │       └── page.tsx          ← Register page
│   │   │   │
│   │   │   ├── 📁 (dashboard)/           ← 📊 Rotas protegidas
│   │   │   │   ├── layout.tsx            ← AppLayout com sidebar
│   │   │   │   ├── 📁 dashboard/
│   │   │   │   │   └── page.tsx          ← Dashboard principal
│   │   │   │   ├── 📁 accounts/
│   │   │   │   │   ├── page.tsx          ← Lista de contas
│   │   │   │   │   ├── 📁 new/
│   │   │   │   │   │   └── page.tsx      ← Criar conta
│   │   │   │   │   └── 📁 [id]/
│   │   │   │   │       └── 📁 edit/
│   │   │   │   │           └── page.tsx  ← Editar conta
│   │   │   │   ├── 📁 receipts/          ← Receitas
│   │   │   │   ├── 📁 expenses/          ← Despesas
│   │   │   │   ├── 📁 categories/        ← Categorias
│   │   │   │   ├── 📁 reports/           ← Relatórios
│   │   │   │   └── 📁 settings/          ← Configurações
│   │   │   │
│   │   │   ├── layout.tsx                ← Root layout
│   │   │   ├── page.tsx                  ← Home (redirect)
│   │   │   └── globals.css               ← Global styles
│   │   │
│   │   ├── 📁 components/ (REUTILIZÁVEIS)
│   │   │   ├── ✅ Button.tsx             ← Componente base
│   │   │   ├── ✅ Input.tsx              ← Componente base
│   │   │   ├── ✅ Card.tsx               ← Componente base
│   │   │   │
│   │   │   ├── 📁 Layout/
│   │   │   │   ├── Sidebar.tsx           ← Menu lateral (PLANEJADO)
│   │   │   │   ├── Header.tsx            ← Header com user menu (PLANEJADO)
│   │   │   │   ├── AppLayout.tsx         ← Container principal (PLANEJADO)
│   │   │   │   └── Navigation.tsx        ← Items do menu (PLANEJADO)
│   │   │   │
│   │   │   ├── 📁 Auth/
│   │   │   │   ├── LoginForm.tsx         ← Form de login (PLANEJADO)
│   │   │   │   └── RegisterForm.tsx      ← Form de registro (PLANEJADO)
│   │   │   │
│   │   │   ├── 📁 Dashboard/
│   │   │   │   ├── StatCard.tsx          ← Card de estatística (PLANEJADO)
│   │   │   │   ├── ChartCard.tsx         ← Card com gráfico (PLANEJADO)
│   │   │   │   └── ProgressBar.tsx       ← Progress indicator (PLANEJADO)
│   │   │   │
│   │   │   ├── 📁 Forms/
│   │   │   │   ├── CreateAccountForm.tsx ← Form de conta (PLANEJADO)
│   │   │   │   ├── UpdateAccountForm.tsx ← Form de edição (PLANEJADO)
│   │   │   │   └── DatePicker.tsx        ← Date picker (PLANEJADO)
│   │   │   │
│   │   │   ├── 📁 Tables/
│   │   │   │   ├── DataTable.tsx         ← Tabela genérica (PLANEJADO)
│   │   │   │   ├── Pagination.tsx        ← Paginação (PLANEJADO)
│   │   │   │   └── DataTableRow.tsx      ← Linha de tabela (PLANEJADO)
│   │   │   │
│   │   │   ├── 📁 UI/
│   │   │   │   ├── Modal.tsx             ← Modal dialog (PLANEJADO)
│   │   │   │   ├── Toast.tsx             ← Notificações (PLANEJADO)
│   │   │   │   ├── Spinner.tsx           ← Loading spinner (PLANEJADO)
│   │   │   │   └── Badge.tsx             ← Badges (PLANEJADO)
│   │   │   │
│   │   │   └── 📁 Charts/
│   │   │       ├── AreaChart.tsx         ← Area chart (PLANEJADO)
│   │   │       ├── BarChart.tsx          ← Bar chart (PLANEJADO)
│   │   │       ├── PieChart.tsx          ← Pie chart (PLANEJADO)
│   │   │       └── LineChart.tsx         ← Line chart (PLANEJADO)
│   │   │
│   │   ├── 📁 hooks/ (CUSTOM HOOKS)
│   │   │   ├── useAuth.ts                ← Auth hook (PLANEJADO)
│   │   │   ├── useLogin.ts               ← Login hook (PLANEJADO)
│   │   │   ├── useAccounts.ts            ← Accounts hook (PLANEJADO)
│   │   │   ├── useDashboard.ts           ← Dashboard hook (PLANEJADO)
│   │   │   ├── useNotification.ts        ← Toast hook (PLANEJADO)
│   │   │   ├── useApi.ts                 ← API calls hook (PLANEJADO)
│   │   │   └── useDarkMode.ts            ← Dark mode hook (PLANEJADO)
│   │   │
│   │   ├── 📁 lib/ (UTILITÁRIOS)
│   │   │   ├── ✅ api.ts                 ← Axios client
│   │   │   ├── format.ts                 ← Formatação (PLANEJADO)
│   │   │   ├── validation.ts             ← Validações (PLANEJADO)
│   │   │   ├── storage.ts                ← LocalStorage (PLANEJADO)
│   │   │   └── constants.ts              ← Constantes (PLANEJADO)
│   │   │
│   │   ├── 📁 store/ (STATE MANAGEMENT)
│   │   │   ├── auth.store.ts             ← Auth state (PLANEJADO)
│   │   │   ├── accounts.store.ts         ← Accounts state (PLANEJADO)
│   │   │   ├── ui.store.ts               ← UI state (PLANEJADO)
│   │   │   └── notifications.store.ts    ← Notifications state (PLANEJADO)
│   │   │
│   │   └── 📁 types/ (TYPESCRIPT)
│   │       └── ✅ index.ts               ← 20+ types definidos
│   │
│   ├── 📁 public/ (ASSETS)
│   │   ├── favicon.ico
│   │   └── ...
│   │
│   ├── 📁 test/
│   │   └── e2e/
│   │       ├── auth.spec.ts
│   │       ├── accounts.spec.ts
│   │       └── dashboard.spec.ts
│   │
│   └── 📄 Dockerfile.frontend             ← (Opcional)
│
│
└── 📁 arquitectura/ (DOCUMENTAÇÃO NO PROJETO)
    ├── 00-RESUMO-EXECUTIVO.md            ← Visão geral
    ├── 01-PLANO-ARQUITETURA.md           ← Arquitetura completa
    ├── 02-MODELO-DADOS-DETALHADO.md      ← Schema SQL
    ├── 03-ESTRATEGIA-TECNICA.md          ← Padrões de código
    ├── 04-COMPONENTES-CHECKLIST.md       ← Componentes & checklist
    └── 05-INDICE-VISUAL.md               ← Índice visual
```

---

## 📊 Resumo por Camada

### ✅ Criado (Setup Inicial)
- Docker-compose com todos os serviços
- Backend NestJS scaffolding
- Frontend Next.js scaffolding
- 3 componentes React (Button, Input, Card)
- Cliente HTTP com Axios
- 20+ TypeScript types
- Documentação completa

### 🎯 Fase 1 (Próximas 4 semanas)
- 11 módulos NestJS estruturados
- 8+ páginas Next.js
- 20+ componentes React
- 6+ custom hooks
- Dashboard com layout
- Autenticação JWT
- CRUD de Contas

### 📅 Fases 2-7 (Próximas 22 semanas)
- Receitas e Despesas
- Importação de PDFs
- Analytics e Previsões
- Automações
- IA e Metas
- Deploy em Produção

---

## 🎯 Legenda

- ✅ Já criado
- 🎯 Próxima semana (Fase 1)
- 📁 Pasta
- 📄 Arquivo
- 📊 Sistema/Feature

---

## 💡 Próximos Passos

1. **Estude a estrutura** deste arquivo
2. **Leia PROXIMOS-PASSOS.md** para começar a implementação
3. **Abra CHECKLIST-FASE-1.md** para acompanhar o progresso
4. **Consulte arquitectura/*.md** para entender decisões

---

**Total de Arquivos**: 50+
**Total de Módulos**: 11
**Total de Componentes (planejado)**: 20+
**Total de Pages (planejado)**: 8+
**Total de Types**: 20+
**Total de Linhas de Código (estimado)**: 50.000+

**Status**: ✅ Setup Completo | 🎯 Pronto para Fase 1
