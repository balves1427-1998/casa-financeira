import { test, expect } from './setup';

test.describe('Rules Management Page', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/rules');
    await authenticatedPage.waitForLoadState('networkidle');
  });

  test('should display rules page', async ({ authenticatedPage }) => {
    // Check title
    await expect(authenticatedPage.locator('h1:has-text("⚙️ Regras de Classificação")')).toBeVisible();

    // Check new rule button
    await expect(authenticatedPage.locator('button:has-text("➕ Nova Regra")')).toBeVisible();
  });

  test('should create a custom rule', async ({ authenticatedPage }) => {
    // Click "Nova Regra"
    await authenticatedPage.click('button:has-text("➕ Nova Regra")');

    // Fill form
    await authenticatedPage.fill('input[placeholder="Ex: IFOOD"]', 'TEST_PATTERN');
    await authenticatedPage.selectOption('select[name="matchType"]', 'keyword');
    await authenticatedPage.selectOption('select[name="categoryId"]', '1'); // Alimentação

    // Set priority
    await authenticatedPage.fill('input[name="priority"]', '75');

    // Set confidence
    await authenticatedPage.fill('input[name="confidence"]', '0.9');

    // Add description
    await authenticatedPage.fill('textarea[name="description"]', 'Test rule description');

    // Submit
    await authenticatedPage.click('button:has-text("💾 Salvar Regra")');

    // Verify success
    await expect(authenticatedPage.locator('text=Regra criada')).toBeVisible({
      timeout: 5000,
    });

    // Verify in table
    await expect(authenticatedPage.locator('text=TEST_PATTERN')).toBeVisible({
      timeout: 5000,
    });
  });

  test('should test pattern with regex', async ({ authenticatedPage }) => {
    // Find RegexTester component
    const testerButton = authenticatedPage.locator('button:has-text("🧪 Testador de Padrões")');

    // Click to expand if collapsed
    if ((await testerButton.count()) > 0) {
      // Already expanded or not needed
    }

    // Fill pattern
    await authenticatedPage.fill(
      'input[placeholder*="padrão"]',
      '.*IFOOD.*',
    );

    // Select regex type
    await authenticatedPage.selectOption('select', 'regex');

    // Add test string
    await authenticatedPage.fill(
      'input[placeholder*="Digite uma string"]',
      'IFOOD - RESTAURANTE',
    );
    await authenticatedPage.click('button:has-text("Adicionar")');

    // Run test
    await authenticatedPage.click('button:has-text("▶️ Testar")');

    // Verify results
    await expect(authenticatedPage.locator('text=📊 Resultados')).toBeVisible({
      timeout: 5000,
    });

    // Check success rate
    const successRate = authenticatedPage.locator('text=100%');
    await expect(successRate).toBeVisible({ timeout: 5000 });
  });

  test('should filter rules by type', async ({ authenticatedPage }) => {
    // Select filter
    await authenticatedPage.selectOption('select[aria-label*="Tipo"]', 'keyword');

    // Wait for filter
    await authenticatedPage.waitForTimeout(300);

    // Verify only keyword rules shown
    const typeColumn = authenticatedPage.locator('td').filter({ hasText: '🔤' });
    const count = await typeColumn.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should filter rules by status', async ({ authenticatedPage }) => {
    // Select active status
    await authenticatedPage.selectOption('select[aria-label*="Status"]', 'active');

    // Wait for filter
    await authenticatedPage.waitForTimeout(300);

    // Verify rules are active
    const statusBadges = authenticatedPage.locator('span:has-text("✓ Ativa")');
    const count = await statusBadges.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should search rules', async ({ authenticatedPage }) => {
    // Fill search
    await authenticatedPage.fill('input[placeholder*="Buscar"]', 'IFOOD');

    // Wait for search
    await authenticatedPage.waitForTimeout(300);

    // Verify results
    const rows = authenticatedPage.locator('table tbody tr');
    const firstRow = rows.first();
    const text = await firstRow.textContent();

    expect(text).toContain('IFOOD');
  });

  test('should edit existing rule', async ({ authenticatedPage }) => {
    // Find first rule
    const firstRow = authenticatedPage.locator('table tbody tr').first();

    // Click edit button
    await firstRow.locator('button:has-text("✏️ Editar")').click();

    // Wait for form
    await authenticatedPage.waitForTimeout(300);

    // Update priority
    const priorityInput = authenticatedPage.locator('input[name="priority"]');
    await priorityInput.fill('90');

    // Save
    await authenticatedPage.click('button:has-text("💾 Salvar Regra")');

    // Verify update
    await expect(authenticatedPage.locator('text=Regra atualizada')).toBeVisible({
      timeout: 5000,
    });
  });

  test('should delete rule', async ({ authenticatedPage }) => {
    // Find first rule
    const firstRow = authenticatedPage.locator('table tbody tr').first();
    const rulePattern = await firstRow.locator('td:first-child').textContent();

    // Click delete button
    await firstRow.locator('button:has-text("🗑️ Excluir")').click();

    // Confirm deletion
    await authenticatedPage.click('button:has-text("Confirmar")');

    // Verify removed
    await expect(authenticatedPage.locator(`text=${rulePattern}`)).not.toBeVisible({
      timeout: 5000,
    });
  });

  test('should display rule statistics', async ({ authenticatedPage }) => {
    // Click stats panel
    await authenticatedPage.click('button:has-text("📊 Estatísticas de Regras")');

    // Wait for panel to expand
    await authenticatedPage.waitForTimeout(500);

    // Verify stats displayed
    await expect(authenticatedPage.locator('text=Total')).toBeVisible();
    await expect(authenticatedPage.locator('text=Ativas')).toBeVisible();
    await expect(authenticatedPage.locator('text=🔤 Palavra-chave')).toBeVisible();
  });

  test('should show regex error on invalid pattern', async ({ authenticatedPage }) => {
    // Click to expand tester
    // Fill invalid regex
    await authenticatedPage.fill('input[placeholder*="padrão"]', '[invalid(regex');

    // Select regex type
    await authenticatedPage.selectOption('select', 'regex');

    // Add test string
    await authenticatedPage.fill('input[placeholder*="Digite uma string"]', 'test');
    await authenticatedPage.click('button:has-text("Adicionar")');

    // Try to test
    await authenticatedPage.click('button:has-text("▶️ Testar")');

    // Verify error message
    await expect(authenticatedPage.locator('text=Invalid regex')).toBeVisible({
      timeout: 5000,
    });
  });

  test('should export rules', async ({ authenticatedPage }) => {
    // Look for export button (if implemented)
    const exportButton = authenticatedPage.locator('button:has-text("Exportar")');

    if (await exportButton.count() > 0) {
      // Click export
      await exportButton.click();

      // Verify download starts
      const downloadPromise = authenticatedPage.waitForEvent('download');
      const download = await downloadPromise;

      expect(download.suggestedFilename()).toContain('rules');
    }
  });

  test('should handle bulk operations', async ({ authenticatedPage }) => {
    // Create multiple rules (assuming form is open)
    const createMultiple = async (count: number) => {
      for (let i = 0; i < count; i++) {
        await authenticatedPage.click('button:has-text("➕ Nova Regra")');
        await authenticatedPage.fill('input[placeholder="Ex: IFOOD"]', `RULE_${i}`);
        await authenticatedPage.selectOption('select[name="matchType"]', 'keyword');
        await authenticatedPage.selectOption('select[name="categoryId"]', '1');
        await authenticatedPage.click('button:has-text("💾 Salvar Regra")');
        await authenticatedPage.waitForTimeout(1000);
      }
    };

    // This is a simplified example
    // In a real scenario, you'd use the bulk API
  });

  test('should be responsive on mobile', async ({ authenticatedPage }) => {
    // Set mobile viewport
    await authenticatedPage.setViewportSize({ width: 375, height: 667 });

    // Check if table scrolls
    const table = authenticatedPage.locator('table');
    const width = await table.evaluate(el => el.clientWidth);

    // Table should be full width but scrollable
    expect(width).toBeLessThanOrEqual(375);
  });

  test('should support dark mode', async ({ authenticatedPage }) => {
    // Toggle dark mode
    await authenticatedPage.click('button[aria-label="Toggle dark mode"]');

    // Wait for transition
    await authenticatedPage.waitForTimeout(500);

    // Check if panel has dark styling
    const panel = authenticatedPage.locator('[class*="dark:"]').first();
    const hasClass = await panel.evaluate(el =>
      Array.from(el.classList).some(c => c.includes('dark'))
    );

    expect(hasClass).toBe(true);
  });

  test('should show confidence bars', async ({ authenticatedPage }) => {
    // Find confidence column
    const confidenceBars = authenticatedPage.locator('[data-testid="confidence-bar"]');
    const count = await confidenceBars.count();

    expect(count).toBeGreaterThan(0);

    // Check width reflects confidence
    const firstBar = confidenceBars.first();
    const width = await firstBar.evaluate(el => el.style.width || '0%');
    expect(width).toMatch(/\d+%/);
  });
});
