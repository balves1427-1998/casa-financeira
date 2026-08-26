# 🎭 Playwright E2E Testing Setup

## Instalação

```bash
npm install --save-dev @playwright/test
npx playwright install
```

## Configuração

### 1. playwright.config.ts
Localizado em `/frontend/playwright.config.ts`

**Browsers suportados:**
- Chromium (Desktop)
- Firefox (Desktop)
- WebKit (Safari)
- Mobile Chrome (Pixel 5)
- Mobile Safari (iPhone 12)

**Reporters:**
- HTML Report
- JSON Report
- JUnit XML (para CI/CD)
- Console output

### 2. Fixtures Customizadas

O arquivo `/frontend/e2e/setup.ts` define:
- `authenticatedPage` - Page com autenticação automática
- `apiBaseUrl` - URL base da API

### 3. Variáveis de Ambiente

```bash
# .env.test (criar na raiz do projeto)
BASE_URL=http://localhost:3000
API_BASE_URL=http://localhost:3001/api/v1
TEST_EMAIL=test@example.com
TEST_PASSWORD=password123
```

## Scripts npm

Adicionar ao `package.json`:

```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:e2e:debug": "playwright test --debug",
    "test:e2e:headed": "playwright test --headed",
    "test:e2e:report": "playwright show-report"
  }
}
```

## Executar Testes

### Interface Visual (UI Mode)
```bash
npm run test:e2e:ui
```
- Abre interface interativa
- Vê testes sendo executados em tempo real
- Debug facilitado

### Modo Debug
```bash
npm run test:e2e:debug
```
- Pausa antes de cada ação
- Permite inspeção de elementos
- Útil para criar/depurar testes

### Modo Headed (com browser visível)
```bash
npm run test:e2e:headed
```
- Executa com browser visível
- Mais lento que headless

### Modo Headless (padrão)
```bash
npm run test:e2e
```
- Executa testes sem UI
- Mais rápido
- Ideal para CI/CD

### Ver Relatório
```bash
npm run test:e2e:report
```
- Abre relatório HTML dos últimos testes
- Mostra screenshots/vídeos de falhas

## Estrutura de Testes

```
frontend/e2e/
├── setup.ts                 # Fixtures e configuração
├── categories.spec.ts       # Testes de categorias (11 testes)
├── credit-cards.spec.ts     # Testes de cartões (14 testes)
├── rules.spec.ts            # Testes de regras (14 testes)
├── performance.spec.ts      # Testes de performance (12 testes)
└── planned-accounts.spec.ts # (Ainda a implementar)
```

**Total: 51+ testes E2E**

## Cobertura de Testes

### Categories (11 testes)
- [x] Display list
- [x] Create category
- [x] Edit category
- [x] Delete category
- [x] Set budget
- [x] Filter by type
- [x] Create subcategory
- [x] Display colors
- [x] Responsive mobile
- [x] Dark mode
- [x] Search functionality

### Credit Cards (14 testes)
- [x] Display dashboard
- [x] Create card
- [x] Display utilization
- [x] Show status
- [x] Edit card
- [x] Delete card
- [x] Display due dates
- [x] Display closing date
- [x] Utilization warnings
- [x] Responsive mobile
- [x] Dark mode
- [x] Invoice info
- [x] Interest rate
- [x] Filter by status

### Rules Management (14 testes)
- [x] Display rules page
- [x] Create rule
- [x] Test pattern (regex)
- [x] Filter by type
- [x] Filter by status
- [x] Search rules
- [x] Edit rule
- [x] Delete rule
- [x] Display statistics
- [x] Handle regex errors
- [x] Export rules
- [x] Bulk operations
- [x] Responsive mobile
- [x] Dark mode

### Performance (12 testes)
- [x] Dashboard load time
- [x] Categories API response
- [x] Rules API response
- [x] Credit Cards API response
- [x] Planned Accounts API response
- [x] Rule creation performance
- [x] Pattern test performance
- [x] ML prediction performance
- [x] Filter/search performance
- [x] Lazy load stats
- [x] Bulk operations efficiency
- [x] Concurrent requests

## Targets de Performance

| Métrica | Target |
|---------|--------|
| API Response | < 200ms |
| Page Load | < 3s |
| User Interaction | < 500ms |
| Bulk Operations | < 600ms |
| Concurrent Requests (5) | < 1000ms |

## Best Practices

### 1. Use data-testid para elementos críticos
```html
<div data-testid="category-card">...</div>
```

### 2. Espere por estado de rede
```typescript
await authenticatedPage.waitForLoadState('networkidle');
```

### 3. Use timeouts apropriados
```typescript
await expect(element).toBeVisible({ timeout: 5000 });
```

### 4. Evite hardcoded waits
```typescript
// ❌ Ruim
await page.waitForTimeout(5000);

// ✅ Bom
await page.waitForSelector('text=Success', { timeout: 5000 });
```

### 5. Use locators específicos
```typescript
// ❌ Ruim
page.click('button');

// ✅ Bom
page.click('button:has-text("Salvar")');
```

## CI/CD Integration

### GitHub Actions Example
```yaml
- name: Run E2E Tests
  run: |
    npm ci
    npm run build
    npm run test:e2e
    
- name: Upload Report
  if: always()
  uses: actions/upload-artifact@v3
  with:
    name: playwright-report
    path: playwright-report/
```

## Debugging

### Modo Inspect
```bash
npx playwright test --debug
```
- Abre inspector de elementos
- Pausa em cada ação
- Permite explorar DOM

### Screenshots
Automaticamente capturados em falhas:
```
playwright-report/
├── test-results/
│   ├── test-1-chromium/
│   │   ├── test-failed-1.png
│   │   └── ...
│   └── ...
```

### Vídeos
Capturados em falhas:
```
playwright-report/
├── video/
│   ├── test-1-chromium.webm
│   └── ...
```

## Comandos Úteis

```bash
# Rodar teste específico
npx playwright test categories.spec.ts

# Rodar teste específico com padrão
npx playwright test -g "should create"

# Rodar apenas em Chrome
npx playwright test --project=chromium

# Rodar com output verbose
npx playwright test --reporter=list

# Gerar trace para investigação
npx playwright test --trace=on
```

## Troubleshooting

### "Browser executable not found"
```bash
npx playwright install chromium
```

### Testes passam localmente mas falham em CI
- Verificar URLs (BASE_URL, API_BASE_URL)
- Verificar credenciais de teste
- Verificar timezone
- Verificar resolução de tela

### Timeout em network
- Aumentar timeout
- Verificar se backend está rodando
- Verificar firewall/proxy

### Element não encontrado
- Verificar seletor
- Usar `--debug` para inspeccionar
- Aumentar timeout
- Verificar se elemento é renderizado

## Recursos

- [Playwright Docs](https://playwright.dev)
- [Best Practices](https://playwright.dev/docs/best-practices)
- [Locators Guide](https://playwright.dev/docs/locators)
- [Assertions](https://playwright.dev/docs/assertions)

---

## Próximos Passos

1. ✅ Setup Playwright
2. ✅ Criar testes base (categories, rules, cards)
3. ✅ Criar testes de performance
4. [ ] Integrar com CI/CD
5. [ ] Criar testes para planned accounts
6. [ ] Criar testes para PDF import
7. [ ] Criar testes para ML classifier
8. [ ] Atingir 70%+ cobertura

---

**Desenvolvido com ❤️ para Casa Financeira**
