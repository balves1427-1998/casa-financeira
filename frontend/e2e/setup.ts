import { test as base, expect } from '@playwright/test';

/**
 * Fixtures customizadas para testes E2E
 * Inclui helpers para login, navegação, e assertions
 */

type TestFixtures = {
  authenticatedPage: any;
  apiBaseUrl: string;
};

export const test = base.extend<TestFixtures>({
  apiBaseUrl: async ({}, use) => {
    const baseUrl = process.env.API_BASE_URL || 'http://localhost:3001/api/v1';
    await use(baseUrl);
  },

  authenticatedPage: async ({ page }, use) => {
    // Setup authentication
    const loginUrl = process.env.BASE_URL || 'http://localhost:3000';

    // Navigate to login
    await page.goto(`${loginUrl}/login`);

    // Fill login form
    await page.fill('input[type="email"]', process.env.TEST_EMAIL || 'test@example.com');
    await page.fill('input[type="password"]', process.env.TEST_PASSWORD || 'password123');

    // Submit form
    await page.click('button[type="submit"]');

    // Wait for navigation to dashboard
    await page.waitForURL(`${loginUrl}/dashboard`);

    // Verify authenticated
    expect(await page.title()).toContain('Dashboard');

    await use(page);
  },
});

export { expect };
