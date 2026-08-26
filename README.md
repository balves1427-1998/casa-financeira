# 💼 Casa Financeira

Sistema de gestão financeira doméstica para duas pessoas — o "CFO da Casa".
Controla receitas, despesas, cartões, contas futuras, fluxo de caixa e metas, importa extratos
e faturas em PDF, e traz uma camada de inteligência financeira que responde perguntas em
linguagem natural usando **exclusivamente os lançamentos registrados**.

---

## O que o sistema faz

| Área | Recursos |
|---|---|
| **Lançamentos** | Receitas e despesas com categoria, subcategoria, responsável, forma de pagamento, parcelamento e recorrência |
| **Contas e cartões** | Conta corrente, poupança, carteira, conta digital e cartão de crédito com limite, fechamento e vencimento |
| **Importação de PDF** | Extrato bancário e fatura de cartão: extração real do texto, classificação automática, detecção de duplicidade e tela de conferência antes de gravar |
| **Planejamento** | Contas futuras com status (previsto, pago, vencido, cancelado) e alertas de vencimento por e-mail |
| **Fluxo de caixa** | Projeção diária, dias críticos, melhor período para compras e saldo mínimo de segurança |
| **Orçamento** | Teto mensal por categoria com alerta amarelo em 80% e vermelho em 100% |
| **Metas** | Objetivo, prazo, aporte planejado × necessário e projeção de conclusão |
| **Divisão Bruno × Giovanna** | Rateio 50/50, proporcional à renda ou percentual customizado, com acerto de contas |
| **Inteligência financeira** | Chat sobre as finanças, recomendações de economia, detecção de anomalias e previsões |
| **Relatório mensal** | Consolidado com comparação mês a mês, exportável em PDF, Excel e CSV |
| **Automações** | Agendamento de relatórios, alertas, e-mails com retry e webhooks assinados (HMAC-SHA256) |

### Um princípio: a IA não inventa

Todos os números exibidos vêm de consulta ao banco. Quando não há lançamentos suficientes, o
sistema **diz isso** — "Ainda não há lançamentos de Alimentação em agosto/2026" — em vez de
devolver um valor plausível. Recomendações sempre mostram a base do cálculo.

---

## Stack

**Backend** — NestJS 10 · TypeORM 0.3 · PostgreSQL 16 · JWT · Bull + Redis · pdfkit · exceljs · pdfjs-dist
**Frontend** — Next.js 14 (App Router) · React 18 · TypeScript · TailwindCSS · Recharts
**Banco** — 23 migrations · 29 tabelas · soft delete · índices compostos

---

## Como rodar localmente

### Pré-requisitos
Node.js 18+, Docker (ou PostgreSQL 16 e Redis instalados).

### 1. Infraestrutura

```bash
docker compose up -d          # PostgreSQL:5432, Redis:6379, pgAdmin:5050
```

Sem Docker, crie o banco manualmente:

```bash
createdb casa_financeira
psql -d casa_financeira -c 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";'
```

### 2. Backend

```bash
cd backend
cp .env.example .env.development     # ajuste as credenciais se necessário
npm install
npm run db:run-migrations            # aplica as 23 migrations
npm run start:dev                    # http://localhost:3000
```

### 3. Frontend

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev                          # http://localhost:3001
```

### 4. Primeiro acesso

Cadastre-se pela tela de registro — **a família é criada automaticamente**.
Para juntar as duas pessoas na mesma casa, acesse **Família** e adicione a outra pelo e-mail.

> ⚠️ Sem família, os endpoints de inteligência financeira respondem **403**. É proposital:
> todos os agregados são escopados por família, e um escopo indefinido devolveria dados errados
> em silêncio.

---

## Modelo de escopo

```
users.family_id  →  membros da família  →  lançamentos agregados
```

**Ler é coletivo, escrever é individual.** Qualquer membro consulta os lançamentos da casa; só
quem lançou pode alterar ou remover o próprio registro. `userId` significa autoria, não
visibilidade.

O `FinancialDataService` é a única porta de entrada dos módulos analíticos para as tabelas de
lançamento — nenhum número chega ao usuário sem ter passado por uma consulta.

---

## Comandos úteis

```bash
# Backend
npm run start:dev            # desenvolvimento com watch
npm run build                # build de produção
npm test                     # 410 testes
npm run test:cov             # cobertura
npm run db:run-migrations    # aplica migrations
npm run db:show              # lista migrations e status
npm run db:revert            # reverte a última

# Frontend
npm run dev                  # desenvolvimento
npm run build                # build de produção
npm run type-check           # tsc --noEmit
npm run test:e2e             # Playwright
```

---

## Estrutura

```
casa-financeira/
├── backend/                 # API NestJS
│   └── src/
│       ├── modules/         # 24 módulos de domínio
│       │   ├── financial-data/   ← camada de leitura dos lançamentos (IA e relatórios)
│       │   ├── families/         ← escopo de todo o sistema
│       │   ├── ai/               ← chat, recomendações, anomalias, previsões
│       │   ├── reports/          ← relatório mensal + exportação PDF/XLSX/CSV
│       │   └── ...
│       ├── database/migrations/  # 23 migrations
│       └── common/
├── frontend/                # Next.js (App Router)
│   └── src/{app,components,hooks,lib,types,utils}
├── docs/
│   ├── DEVELOPER-GUIDE.md
│   ├── SETUP.md
│   ├── insomnia-collection.json
│   └── historico/           # documentos das fases anteriores (ver aviso abaixo)
└── docker-compose.yml
```

> 📁 **`docs/historico/`** guarda os documentos de fases antigas. Vários deles declaram como
> "concluído" código que nunca havia sido executado — foram mantidos como registro, mas **não
> são fonte confiável** sobre o estado atual. Este README e os testes são.

---

## Estado atual

| Verificação | Resultado |
|---|---|
| `tsc --noEmit` (backend e frontend) | ✅ 0 erros |
| `npm test` (backend) | ✅ 11 suítes / **410 testes** |
| Migrations do zero | ✅ 23/23 |
| Boot da API | ✅ sem erros |
| `next build` | ✅ 20 páginas |

### Pendências conhecidas

- `ParseUUIDPipe` nos parâmetros `:id` — um UUID malformado devolve **500** em vez de 400/404
  (~25 endpoints; muda o contrato de erro, por isso ficou para uma decisão consciente)
- A detecção de anomalias (`POST /analysis/anomalies/detect`) é disparada manualmente; caberia um
  cron diário
- Integração com Open Finance ainda não iniciada
- Rate limiting, RBAC e criptografia em repouso não implementados

---

## Segurança

- Autenticação JWT com guard em todos os endpoints protegidos
- `ClassSerializerInterceptor` global com `@Exclude()` em `password` e `refreshToken`
- Escopo de família derivado do usuário autenticado, nunca da URL
- Validação de entrada por DTOs em todas as rotas de escrita
- Consultas parametrizadas (sem concatenação de SQL)
- Webhooks assinados com HMAC-SHA256 e comparação em tempo constante
- Helmet e CORS restrito

O sistema **nunca** solicita nem armazena senha bancária, token ou código de autenticação. Os PDFs
são lidos apenas para extrair os lançamentos.

---

## Deploy

Backend no **Render** ou **Railway**, frontend na **Vercel**.
Passo a passo, variáveis de ambiente e verificação pós-deploy em
**[`docs/DEPLOY.md`](docs/DEPLOY.md)**.

Os arquivos de configuração já estão no repositório: `render.yaml` (blueprint
completo com API, PostgreSQL e Redis), `backend/railway.json` e
`frontend/vercel.json`.

Health check da API: `GET /health` e `GET /health/ready`.

> O Lovable trabalha com React + Vite e Supabase — a API NestJS não roda nele.
> Ver a seção "Sobre o Lovable" em `docs/DEPLOY.md`.

---

## Licença

Projeto pessoal de uso privado.
