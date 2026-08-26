import { test, expect } from './setup';

test.describe('Credit Cards Page', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/cards');
    await authenticatedPage.waitForLoadState('networkidle');
  });

  test('should display credit cards dashboard', async ({ authenticatedPage }) => {
    // Check title
    await expect(authenticatedPage.locator('h1:has-text("💳 Cartões")')).toBeVisible();

    // Check cards are displayed
    const cards = authenticatedPage.locator('[data-testid="card-item"]');
    expect(await cards.count()).toBeGreaterThan(0);
  });

  test('should create new credit card', async ({ authenticatedPage }) => {
    // Click new card button
    await authenticatedPage.click('button:has-text("➕ Novo Cartão")');

    // Fill form
    await authenticatedPage.fill('input[name="cardName"]', 'Test Card');
    await authenticatedPage.fill('input[name="cardNumber"]', '4111111111111111');
    await authenticatedPage.fill('input[name="limit"]', '5000');
    await authenticatedPage.fill('input[name="closingDay"]', '10');
    await authenticatedPage.fill('input[name="dueDay"]', '20');

    // Submit
    await authenticatedPage.click('button:has-text("Adicionar Cartão")');

    // Verify success
    await expect(authenticatedPage.locator('text=Test Card')).toBeVisible({
      timeout: 5000,
    });
  });

  test('should display card utilization', async ({ authenticatedPage }) => {
    // Find first card
    const firstCard = authenticatedPage.locator('[data-testid="card-item"]').first();

    // Check for utilization bar
    const utilizationBar = firstCard.locator('[data-testid="utilization-bar"]');
    await expect(utilizationBar).toBeVisible();

    // Check percentage
    const percentage = firstCard.locator('[data-testid="utilization-percent"]');
    const text = await percentage.textContent();
    expect(text).toMatch(/\d+%/);
  });

  test('should show card status', async ({ authenticatedPage }) => {
    // Find first card
    const firstCard = authenticatedPage.locator('[data-testid="card-item"]').first();

    // Check for status badge
    const statusBadge = firstCard.locator('[data-testid="card-status"]');
    const status = await statusBadge.textContent();

    expect(status).toMatch(/Ativo|Inativo|Bloqueado|Expirado/);
  });

  test('should edit credit card', async ({ authenticatedPage }) => {
    // Find first card
    const firstCard = authenticatedPage.locator('[data-testid="card-item"]').first();

    // Click edit button
    await firstCard.locator('button:has-text("✏️")').click();

    // Update limit
    await authenticatedPage.fill('input[name="limit"]', '10000');

    // Save
    await authenticatedPage.click('button:has-text("Salvar")');

    // Verify update
    await expect(authenticatedPage.locator('text=R$ 10.000,00')).toBeVisible({
      timeout: 5000,
    });
  });

  test('should delete credit card', async ({ authenticatedPage }) => {
    // Find first card
    const firstCard = authenticatedPage.locator('[data-testid="card-item"]').first();
    const cardName = await firstCard.locator('[data-testid="card-name"]').textContent();

    // Click delete button
    await firstCard.locator('button:has-text("🗑️")').click();

    // Confirm
    await authenticatedPage.click('button:has-text("Confirmar")');

    // Verify removed
    await expect(authenticatedPage.locator(`text=${cardName}`)).not.toBeVisible({
      timeout: 5000,
    });
  });

  test('should display due dates', async ({ authenticatedPage }) => {
    // Find first card
    const firstCard = authenticatedPage.locator('[data-testid="card-item"]').first();

    // Check for due date info
    const dueDateInfo = firstCard.locator('[data-testid="due-date"]');
    const text = await dueDateInfo.textContent();

    expect(text).toMatch(/\d+\/\d+/);
  });

  test('should display closing date', async ({ authenticatedPage }) => {
    // Find first card
    const firstCard = authenticatedPage.locator('[data-testid="card-item"]').first();

    // Check for closing date
    const closingDateInfo = firstCard.locator('[data-testid="closing-date"]');
    const text = await closingDateInfo.textContent();

    expect(text).toMatch(/Fechamento.*\d+/);
  });

  test('should show utilization warning when close to limit', async ({ authenticatedPage }) => {
    // Check for warning badge
    const warningBadges = authenticatedPage.locator('[data-testid="warning-badge"]');

    if (await warningBadges.count() > 0) {
      // Verify warning is visible
      const firstWarning = warningBadges.first();
      const text = await firstWarning.textContent();

      expect(text).toMatch(/Próximo do limite|Limite atingido/);
    }
  });

  test('should be responsive on mobile', async ({ authenticatedPage }) => {
    // Set mobile viewport
    await authenticatedPage.setViewportSize({ width: 375, height: 667 });

    // Check if cards are stacked
    const cards = authenticatedPage.locator('[data-testid="card-item"]');
    expect(await cards.count()).toBeGreaterThan(0);

    // Verify card width fits screen
    const firstCard = cards.first();
    const width = await firstCard.evaluate(el => el.clientWidth);
    expect(width).toBeLessThanOrEqual(375);
  });

  test('should support dark mode', async ({ authenticatedPage }) => {
    // Toggle dark mode
    await authenticatedPage.click('button[aria-label="Toggle dark mode"]');

    // Wait for transition
    await authenticatedPage.waitForTimeout(500);

    // Check if cards have dark styling
    const cards = authenticatedPage.locator('[data-testid="card-item"]');
    const firstCard = cards.first();
    const hasClass = await firstCard.evaluate(el =>
      Array.from(el.classList).some(c => c.includes('dark'))
    );

    expect(hasClass).toBe(true);
  });

  test('should display invoice information', async ({ authenticatedPage }) => {
    // Find first card
    const firstCard = authenticatedPage.locator('[data-testid="card-item"]').first();

    // Check for invoice info
    const invoiceInfo = firstCard.locator('[data-testid="invoice-info"]');
    const text = await invoiceInfo.textContent();

    expect(text).toMatch(/Fatura.*R\$/);
  });

  test('should show interest rate', async ({ authenticatedPage }) => {
    // Find first card
    const firstCard = authenticatedPage.locator('[data-testid="card-item"]').first();

    // Check for interest rate
    const interestInfo = firstCard.locator('[data-testid="interest-rate"]');

    if (await interestInfo.count() > 0) {
      const text = await interestInfo.textContent();
      expect(text).toMatch(/\d+[.,]\d+%/);
    }
  });

  test('should filter cards by status', async ({ authenticatedPage }) => {
    // Look for filter if implemented
    const filterSelect = authenticatedPage.locator('select[name="statusFilter"]');

    if (await filterSelect.count() > 0) {
      await filterSelect.selectOption('active');
      await authenticatedPage.waitForTimeout(300);

      // Verify only active cards shown
      const statusBadges = authenticatedPage.locator('[data-testid="card-status"]');
      const firstStatus = await statusBadges.first().textContent();

      expect(firstStatus).toContain('Ativo');
    }
  });

  test('should display total utilization summary', async ({ authenticatedPage }) => {
    // Look for summary section
    const summary = authenticatedPage.locator('[data-testid="cards-summary"]');

    if (await summary.count() > 0) {
      // Check for total info
      const totalUsed = summary.locator('[data-testid="total-used"]');
      const totalLimit = summary.locator('[data-testid="total-limit"]');

      await expect(totalUsed).toBeVisible();
      await expect(totalLimit).toBeVisible();
    }
  });

  test('should mark card as paid', async ({ authenticatedPage }) => {
    // Find first card with invoice
    const firstCard = authenticatedPage.locator('[data-testid="card-item"]').first();

    // Look for "Mark as paid" button
    const markPaidBtn = firstCard.locator('button:has-text("Marcar como pago")');

    if (await markPaidBtn.count() > 0) {
      await markPaidBtn.click();

      // Verify status changes
      await expect(authenticatedPage.locator('text=Fatura paga')).toBeVisible({
        timeout: 5000,
      });
    }
  });
});
