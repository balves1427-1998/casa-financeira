# 🔧 Integração de Seção D - Passo a Passo

## ⚠️ Pré-requisitos

Antes de integrar Seção D, certifique-se de que:

1. ✅ Seção C (Analytics) foi completamente implementada
2. ✅ Todos os 12 arquivos de Seção D estão criados
3. ✅ As migrations foram executadas corretamente
4. ✅ O banco de dados foi atualizado

---

## 📋 Checklist de Integração

### Backend

- [ ] **Passo 1:** Verificar que AnalyticsModule está importado em app.module.ts
- [ ] **Passo 2:** Adicionar ReportsModule em app.module.ts
- [ ] **Passo 3:** Executar aplicação backend
- [ ] **Passo 4:** Verificar logs da inicialização
- [ ] **Passo 5:** Testar endpoint GET /reports (deve retornar array vazio)

### Frontend

- [ ] **Passo 6:** Adicionar rota /reports ao layout ou sidebar
- [ ] **Passo 7:** Verificar compilação frontend (sem erros)
- [ ] **Passo 8:** Navegar para página de Relatórios
- [ ] **Passo 9:** Testar criação de relatório simples
- [ ] **Passo 10:** Verificar API calls nos network tools do navegador

---

## 🔨 Backend Integration

### 1. Atualizar `backend/src/app.module.ts`

**Localizar o arquivo atual** (deve estar similar a isto):

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ExpensesModule } from './modules/expenses/expenses.module';
import { IncomeModule } from './modules/income/income.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      username: process.env.DB_USERNAME || 'postgres',
      password: process.env.DB_PASSWORD || 'password',
      database: process.env.DB_NAME || 'casa_financeira',
      entities: ['src/**/*.entity.ts'],
      migrations: ['src/database/migrations/*.ts'],
      migrationsRun: true,
      synchronize: false,
      logging: true,
    }),
    AuthModule,
    UsersModule,
    ExpensesModule,
    IncomeModule,
    CategoriesModule,
    AccountsModule,
    AnalyticsModule,
    // ← ADICIONAR AQUI
  ],
})
export class AppModule {}
```

**Adicionar imports:**

```typescript
import { ReportsModule } from './modules/reports/reports.module';
```

**Adicionar em imports array:**

```typescript
@Module({
  imports: [
    // ... existing modules
    AnalyticsModule,  // ← Certificar que está aqui (Seção C)
    ReportsModule,    // ← ADICIONAR AQUI (Seção D)
  ],
})
```

**Arquivo final deve ficar assim:**

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ExpensesModule } from './modules/expenses/expenses.module';
import { IncomeModule } from './modules/income/income.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { ReportsModule } from './modules/reports/reports.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      username: process.env.DB_USERNAME || 'postgres',
      password: process.env.DB_PASSWORD || 'password',
      database: process.env.DB_NAME || 'casa_financeira',
      entities: ['src/**/*.entity.ts'],
      migrations: ['src/database/migrations/*.ts'],
      migrationsRun: true,
      synchronize: false,
      logging: true,
    }),
    AuthModule,
    UsersModule,
    ExpensesModule,
    IncomeModule,
    CategoriesModule,
    AccountsModule,
    AnalyticsModule,
    ReportsModule, // ← ADICIONADO
  ],
})
export class AppModule {}
```

### 2. Verificar Migrations

Execute as migrations:

```bash
# No diretório backend
npm run typeorm migration:run

# Deve mostrar algo como:
# Migration 013-create-reports-table.ts has been executed
```

### 3. Testar Backend

```bash
# Iniciar servidor
npm run start:dev

# Logs esperados:
# [Nest] ... NestFactory bootstrapped successfully
# Reports module initialized
# Analytics module initialized
```

### 4. Testar Endpoints

```bash
# Terminal com curl (ou Postman/Insomnia)

# 1. Obter token (assumindo auth funciona)
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"bruno@example.com","password":"senha"}'

# Copiar o token de resposta

# 2. Listar relatórios (deve retornar [])
curl -X GET http://localhost:3001/api/reports \
  -H "Authorization: Bearer {TOKEN_AQUI}"

# Resposta esperada:
# {"reports":[],"total":0,"limit":20,"offset":0}

# 3. Gerar relatório
curl -X POST http://localhost:3001/api/reports/generate \
  -H "Authorization: Bearer {TOKEN_AQUI}" \
  -H "Content-Type: application/json" \
  -d '{
    "reportType": "monthly",
    "startMonth": 8,
    "startYear": 2026,
    "config": {
      "includeSummary": true,
      "includeSpendingPatterns": true,
      "includeAnomalies": false,
      "includeTrends": false,
      "includeComparison": false,
      "includeForecasting": false,
      "includeMetas": false
    },
    "format": "pdf"
  }'
```

---

## 🎨 Frontend Integration

### 1. Adicionar Rota no Layout Principal

**Arquivo:** `frontend/src/app/layout.tsx`

Localizar a navegação e adicionar:

```typescript
const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊' },
  { href: '/expenses', label: 'Despesas', icon: '💳' },
  { href: '/income', label: 'Receitas', icon: '💰' },
  { href: '/accounts', label: 'Contas', icon: '🏦' },
  { href: '/analytics', label: 'Análises', icon: '📈' },
  { href: '/reports', label: 'Relatórios', icon: '📋' }, // ← ADICIONAR AQUI
  { href: '/settings', label: 'Configurações', icon: '⚙️' },
];
```

### 2. Verificar Compilação Frontend

```bash
# No diretório frontend
npm run build

# Deve completar sem erros
# Especialmente: pages/reports/page.tsx
```

### 3. Iniciar Frontend

```bash
npm run dev

# Deve compilar sem erros
# Output esperado:
# ▲ Next.js 14.x ready on http://localhost:3000
```

### 4. Teste de Navegação

1. Abrir navegador em http://localhost:3000
2. Fazer login
3. Clicar em "Relatórios" na navegação
4. Deve carregar página com 3 abas (Criar, Listar, Templates)

---

## 🧪 Testes de Validação

### Teste 1: Criar Relatório Simples

**Passos:**
1. Navegar para /reports
2. Clicar em aba "Criar Novo"
3. Selecionar:
   - Tipo: "Mensal"
   - Período: Agosto 2026
   - Formato: PDF
   - Seções: Resumo Executivo, Padrões
4. Clicar em "Gerar Relatório"

**Validações:**
- ✅ Não aparecer erro na tela
- ✅ Botão mostrar "Gerando..."
- ✅ No network tab do DevTools: POST /reports/generate com status 202
- ✅ Resposta incluir id, status, metadados

### Teste 2: Listar Relatórios

**Passos:**
1. Clicar em aba "Meus Relatórios"
2. Aguardar carregar

**Validações:**
- ✅ Relatório criado deve aparecer na lista
- ✅ Status deve ser "Pronto" (cor verde)
- ✅ Metadados exibidos: formato, total, categoria
- ✅ Ícones de download e visualizar aparecem

### Teste 3: Visualizar Relatório

**Passos:**
1. Clicar em ícone de olho (👁️) no relatório
2. Modal deve abrir

**Validações:**
- ✅ Modal mostra período correto
- ✅ Metadados exibidos em cards
- ✅ Seções incluídas listadas
- ✅ Botão de fechar funciona

### Teste 4: Validações de Entrada

**Teste A: Sem seções selecionadas**
- Desselecionar todas as seções
- Tentar gerar
- ✅ Deve aparecer erro: "Selecione pelo menos uma seção"

**Teste B: Email inválido**
- Marcar "Enviar por Email"
- Colocar email: "invalido@"
- Tentar gerar
- ✅ Deve aparecer erro: "Emails inválidos"

**Teste C: Período inválido**
- Selecionar tipo "Personalizado"
- Não selecionar data final
- Tentar gerar
- ✅ Deve aparecer erro: "Data final é obrigatória"

---

## 🔍 Troubleshooting

### Problema: 404 em /reports

**Solução:**
1. Verificar que ReportsModule foi adicionado em app.module.ts
2. Reiniciar servidor backend
3. Limpar cache do navegador (Ctrl+Shift+Delete)

### Problema: TypeOrmModule not found

**Solução:**
1. Verificar import em reports.module.ts:
   ```typescript
   import { TypeOrmModule } from '@nestjs/typeorm';
   ```
2. Verificar entity está registrada:
   ```typescript
   TypeOrmModule.forFeature([Report, Expense, Income])
   ```

### Problema: Componentes não encontrados

**Solução:**
1. Verificar arquivo reports/index.ts existe
2. Verificar imports em page.tsx:
   ```typescript
   import { ReportBuilder, ReportList, ReportPreview, TemplateManager } from '@/components/reports';
   ```
3. Limpar .next: `rm -rf .next && npm run build`

### Problema: Authorization error ao gerar relatório

**Solução:**
1. Verificar token JWT é válido
2. Verificar JwtAuthGuard está em ReportsController
3. Verificar NEXT_PUBLIC_API_URL está correto em frontend

### Problema: Migrations não executaram

**Solução:**
```bash
# No backend
npm run typeorm migration:show  # Ver quais faltam

npm run typeorm migration:run   # Executar pendentes

npm run typeorm migration:revert  # Se precisar reverter última
```

---

## ✅ Checklist Final de Integração

- [ ] ReportsModule importado em app.module.ts
- [ ] AnalyticsModule importado em app.module.ts
- [ ] Migrations executadas com sucesso
- [ ] Backend inicia sem erros
- [ ] Endpoint GET /reports retorna dados
- [ ] Frontend compila sem erros
- [ ] Rota /reports acessível
- [ ] Página carrega com 3 abas
- [ ] Teste 1 (Criar) funciona
- [ ] Teste 2 (Listar) funciona
- [ ] Teste 3 (Visualizar) funciona
- [ ] Teste 4 (Validações) funciona
- [ ] Sem erros no console (F12)
- [ ] Sem erros nos logs do backend
- [ ] Network requests têm status correto

---

## 📞 Suporte

Se encontrar problemas:

1. Verificar logs do backend: `npm run start:dev`
2. Verificar console do navegador: F12 → Console
3. Verificar network requests: F12 → Network
4. Verificar que todos os 12 arquivos existem
5. Verificar tipos estão corretos (TypeScript strict mode)

---

## 🎉 Próximos Passos Após Integração

Após integração bem-sucedida:

1. **Executar testes completos** da Seção D
2. **Integrar bibliotecas reais:**
   - PDF generation (PDFKit/pdfmake)
   - XLSX export (xlsx)
   - Email sending (nodemailer)
3. **Adicionar file storage** (S3/GCS)
4. **Implementar rate limiting** em endpoints
5. **Adicionar logs e monitoring**
6. **Criar testes automatizados** (Jest/Cypress)
7. **Preparar para Fase 4**

---

*Integração de Seção D - 25/08/2026*
