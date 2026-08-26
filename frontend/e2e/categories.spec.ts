import { test, expect } from './setup';

test.describe('Categories Page', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/categories');
    await authenticatedPage.waitForLoadState('networkidle');
  });

  test('should display categories list', async ({ authenticatedPage }) => {
    const categoryCards = authenticatedPage.locator('[data-testid="category-card"]');
    const count = await categoryCards.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should create a new category', async ({ authenticatedPage }) => {
    // Click "Nova Categoria" button
    await authenticatedPage.click('button:has-text("➕ Nova Categoria")');

    // Fill form
    await authenticatedPage.fill('input[placeholder="Nome da categoria"]', 'Test Category');
    await authenticatedPage.fill('input[type="color"]', '#FF5733');
    await authenticatedPage.click('select');
    await authenticatedPage.click('option[value="expense"]');

    // Submit
    await authenticatedPage.click('button:has-text("💾 Salvar")');

    // Verify toast/confirmation
    await expect(authenticatedPage.locator('text=Categoria criada')).toBeVisible({
      timeout: 5000,
    });

    // Verify category appears in list
    await expect(
      authenticatedPage.locator('text=Test Category'),
    ).toBeVisible({ timeout: 5000 });
  });

  test('should edit a category', async ({ authenticatedPage }) => {
    // Find first category and click edit
    const firstCard = authenticatedPage.locator('[data-testid="category-card"]').first();
    await firstCard.locator('button:has-text("✏️ Editar")').click();

    // Update name
    const nameInput = authenticatedPage.locator('input[placeholder="Nome da categoria"]');
    await nameInput.clear();
    await nameInput.fill('Updated Category');

    // Submit
    await authenticatedPage.click('button:has-text("💾 Salvar")');

    // Verify update
    await expect(authenticatedPage.locator('text=Updated Category')).toBeVisible({
      timeout: 5000,
    });
  });

  test('should delete a category', async ({ authenticatedPage }) => {
    // Find first category
    const firstCard = authenticatedPage.locator('[data-testid="category-card"]').first();
    const categoryName = await firstCard.locator('.category-name').textContent();

    // Click delete button
    await firstCard.locator('button:has-text("🗑️")').click();

    // Confirm deletion
    await authenticatedPage.click('button:has-text("Confirmar")');

    // Verify removed from list
    await expect(authenticatedPage.locator(`text=${categoryName}`)).not.toBeVisible({
      timeout: 5000,
    });
  });

  test('should set monthly budget', async ({ authenticatedPage }) => {
    // Find first category
    const firstCard = authenticatedPage.locator('[data-testid="category-card"]').first();

    // Click budget button
    await firstCard.locator('button:has-text("💰 Orçamento")').click();

    // Fill budget
    await authenticatedPage.fill('input[placeholder="Orçamento mensal"]', '1500.00');

    // Submit
    await authenticatedPage.click('button:has-text("Definir")');

    // Verify budget set
    await expect(authenticatedPage.locator('text=R$ 1.500,00')).toBeVisible({
      timeout: 5000,
    });
  });

  test('should filter categories', async ({ authenticatedPage }) => {
    // Click filter button
    await authenticatedPage.click('select[aria-label="Filtrar por tipo"]');
    await authenticatedPage.click('option[value="income"]');

    // Verify only income categories shown
    const categoryCards = authenticatedPage.locator('[data-testid="category-card"]');
    const firstType = await categoryCards.first().locator('.category-type').textContent();
    expect(firstType).toContain('Receita');
  });

  test('should create subcategory', async ({ authenticatedPage }) => {
    // Find a category
    const firstCard = authenticatedPage.locator('[data-testid="category-card"]').first();

    // Click "Add subcategory"
    await firstCard.locator('button:has-text("➕ Subcategoria")').click();

    // Fill subcategory form
    await authenticatedPage.fill(
      'input[placeholder="Nome da subcategoria"]',
      'Test Subcategory',
    );

    // Submit
    await authenticatedPage.click('button:has-text("Adicionar")');

    // Verify subcategory appears
    await expect(authenticatedPage.locator('text=Test Subcategory')).toBeVisible({
      timeout: 5000,
    });
  });

  test('should display category colors', async ({ authenticatedPage }) => {
    const categoryCards = authenticatedPage.locator('[data-testid="category-card"]');
    const firstCard = categoryCards.first();

    // Check if color is applied
    const colorBox = firstCard.locator('[data-testid="category-color"]');
    const bgColor = await colorBox.evaluate(el => window.getComputedStyle(el).backgroundColor);

    expect(bgColor).toBeTruthy();
  });

  test('should be responsive on mobile', async ({ authenticatedPage }) => {
    // Set mobile viewport
    await authenticatedPage.setViewportSize({ width: 375, height: 667 });

    // Verify layout adjusts
    const grid = authenticatedPage.locator('[data-testid="categories-grid"]');
    const computedStyle = await grid.evaluate(el => window.getComputedStyle(el).gridTemplateColumns);

    // Should be single column on mobile
    expect(computedStyle).toContain('1fr');
  });

  test('should support dark mode', async ({ authenticatedPage }) => {
    // Toggle dark mode
    await authenticatedPage.click('button[aria-label="Toggle dark mode"]');

    // Wait for transition
    await authenticatedPage.waitForTimeout(500);

    // Check if dark class is applied
    const body = authenticatedPage.locator('body');
    const isDark = await body.evaluate(el => el.classList.contains('dark'));

    expect(isDark).toBe(true);
  });

  test('should search categories', async ({ authenticatedPage }) => {
    // Type in search
    await authenticatedPage.fill('input[placeholder="Buscar categoria..."]', 'Alimentação');

    // Wait for results
    await authenticatedPage.waitForTimeout(300);

    // Verify results
    const categoryCards = authenticatedPage.locator('[data-testid="category-card"]');
    const firstCard = categoryCards.first();
    const text = await firstCard.textContent();

    expect(text).toContain('Alimentação');
  });
});
