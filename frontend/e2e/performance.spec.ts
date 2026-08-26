import { test, expect } from './setup';

/**
 * Performance Tests
 * Validates that API responses and page loads meet performance targets
 */

test.describe('Performance Tests', () => {
  const PERFORMANCE_TARGETS = {
    API_RESPONSE_TIME: 200, // ms
    PAGE_LOAD_TIME: 3000, // ms
    INTERACTION_TIME: 500, // ms (user interactions should respond within this)
  };

  test('should load dashboard within target time', async ({ authenticatedPage }) => {
    const startTime = Date.now();

    await authenticatedPage.goto('/dashboard');
    await authenticatedPage.waitForLoadState('networkidle');

    const loadTime = Date.now() - startTime;

    console.log(`Dashboard load time: ${loadTime}ms`);
    expect(loadTime).toBeLessThan(PERFORMANCE_TARGETS.PAGE_LOAD_TIME);
  });

  test('should fetch categories within target time', async ({ authenticatedPage, apiBaseUrl }) => {
    const startTime = Date.now();

    const response = await authenticatedPage.request.get(`${apiBaseUrl}/categories`);
    const responseTime = Date.now() - startTime;

    console.log(`Categories API response time: ${responseTime}ms`);
    expect(response.status()).toBe(200);
    expect(responseTime).toBeLessThan(PERFORMANCE_TARGETS.API_RESPONSE_TIME);
  });

  test('should fetch rules within target time', async ({ authenticatedPage, apiBaseUrl }) => {
    const startTime = Date.now();

    const response = await authenticatedPage.request.get(`${apiBaseUrl}/classification-rules`);
    const responseTime = Date.now() - startTime;

    console.log(`Rules API response time: ${responseTime}ms`);
    expect(response.status()).toBe(200);
    expect(responseTime).toBeLessThan(PERFORMANCE_TARGETS.API_RESPONSE_TIME);
  });

  test('should fetch credit cards within target time', async ({ authenticatedPage, apiBaseUrl }) => {
    const startTime = Date.now();

    const response = await authenticatedPage.request.get(`${apiBaseUrl}/credit-cards`);
    const responseTime = Date.now() - startTime;

    console.log(`Credit Cards API response time: ${responseTime}ms`);
    expect(response.status()).toBe(200);
    expect(responseTime).toBeLessThan(PERFORMANCE_TARGETS.API_RESPONSE_TIME);
  });

  test('should fetch planned accounts within target time', async ({
    authenticatedPage,
    apiBaseUrl,
  }) => {
    const startTime = Date.now();

    const response = await authenticatedPage.request.get(`${apiBaseUrl}/planned-accounts`);
    const responseTime = Date.now() - startTime;

    console.log(`Planned Accounts API response time: ${responseTime}ms`);
    expect(response.status()).toBe(200);
    expect(responseTime).toBeLessThan(PERFORMANCE_TARGETS.API_RESPONSE_TIME);
  });

  test('should respond to rule creation within target time', async ({
    authenticatedPage,
    apiBaseUrl,
  }) => {
    const ruleData = {
      pattern: 'TEST_PERF',
      matchType: 'keyword',
      categoryId: '1',
      priority: 50,
      confidence: 0.85,
      isActive: true,
    };

    const startTime = Date.now();

    const response = await authenticatedPage.request.post(`${apiBaseUrl}/classification-rules/custom`, {
      data: ruleData,
    });

    const responseTime = Date.now() - startTime;

    console.log(`Rule creation API response time: ${responseTime}ms`);
    expect(response.status()).toBe(201 || 200);
    expect(responseTime).toBeLessThan(PERFORMANCE_TARGETS.API_RESPONSE_TIME * 1.5);
  });

  test('should test pattern within target time', async ({ authenticatedPage, apiBaseUrl }) => {
    const patternData = {
      pattern: 'IFOOD',
      matchType: 'keyword',
      testStrings: ['IFOOD - RESTAURANT', 'PIZZA HUT', 'UBER EATS'],
    };

    const startTime = Date.now();

    const response = await authenticatedPage.request.post(
      `${apiBaseUrl}/classification-rules/test-pattern`,
      {
        data: patternData,
      },
    );

    const responseTime = Date.now() - startTime;

    console.log(`Pattern test API response time: ${responseTime}ms`);
    expect(response.status()).toBe(200);
    expect(responseTime).toBeLessThan(PERFORMANCE_TARGETS.API_RESPONSE_TIME);
  });

  test('should predict classification within target time', async ({
    authenticatedPage,
    apiBaseUrl,
  }) => {
    const startTime = Date.now();

    const response = await authenticatedPage.request.get(
      `${apiBaseUrl}/ml-classifier/predict?description=IFOOD%20RESTAURANT&establishment=IFOOD`,
    );

    const responseTime = Date.now() - startTime;

    console.log(`ML prediction API response time: ${responseTime}ms`);
    expect(response.status()).toBe(200);
    expect(responseTime).toBeLessThan(PERFORMANCE_TARGETS.API_RESPONSE_TIME * 2);
  });

  test('should filter rules with acceptable delay', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/rules');
    await authenticatedPage.waitForLoadState('networkidle');

    const startTime = Date.now();

    // Type in search
    await authenticatedPage.fill('input[placeholder*="Buscar"]', 'IFOOD');

    // Wait for debounce and filter
    await authenticatedPage.waitForTimeout(600);

    const filterTime = Date.now() - startTime;

    console.log(`Filter/search time: ${filterTime}ms`);
    expect(filterTime).toBeLessThan(PERFORMANCE_TARGETS.INTERACTION_TIME * 2);
  });

  test('should load categories page with lazy loaded stats', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/rules');
    await authenticatedPage.waitForLoadState('networkidle');

    const startTime = Date.now();

    // Click stats panel to trigger load
    await authenticatedPage.click('button:has-text("📊 Estatísticas")');

    // Wait for stats to load
    await authenticatedPage.waitForSelector('text=Total', { timeout: 5000 });

    const statsLoadTime = Date.now() - startTime;

    console.log(`Stats lazy load time: ${statsLoadTime}ms`);
    expect(statsLoadTime).toBeLessThan(PERFORMANCE_TARGETS.PAGE_LOAD_TIME);
  });

  test('should handle bulk operations efficiently', async ({
    authenticatedPage,
    apiBaseUrl,
  }) => {
    const rulesData = [
      { pattern: 'IFOOD', matchType: 'keyword', categoryId: '1' },
      { pattern: 'UBER', matchType: 'keyword', categoryId: '3' },
      { pattern: 'NETFLIX', matchType: 'keyword', categoryId: '9' },
      { pattern: 'AMAZON', matchType: 'keyword', categoryId: '8' },
      { pattern: 'SPOTIFY', matchType: 'keyword', categoryId: '9' },
    ];

    const startTime = Date.now();

    const response = await authenticatedPage.request.post(
      `${apiBaseUrl}/classification-rules/bulk-apply`,
      {
        data: { rules: rulesData, overwrite: false },
      },
    );

    const responseTime = Date.now() - startTime;

    console.log(`Bulk apply API response time for 5 rules: ${responseTime}ms`);
    expect(response.status()).toBe(200 || 201);
    expect(responseTime).toBeLessThan(PERFORMANCE_TARGETS.API_RESPONSE_TIME * 3);
  });

  test('should export rules efficiently', async ({ authenticatedPage, apiBaseUrl }) => {
    const startTime = Date.now();

    const response = await authenticatedPage.request.get(`${apiBaseUrl}/classification-rules/export`);

    const responseTime = Date.now() - startTime;

    console.log(`Export rules API response time: ${responseTime}ms`);
    expect(response.status()).toBe(200);
    expect(responseTime).toBeLessThan(PERFORMANCE_TARGETS.API_RESPONSE_TIME * 2);

    // Verify data is returned
    const data = await response.json();
    expect(data.rules).toBeDefined();
  });

  test('should get statistics efficiently', async ({ authenticatedPage, apiBaseUrl }) => {
    const startTime = Date.now();

    const response = await authenticatedPage.request.get(
      `${apiBaseUrl}/classification-rules/stats`,
    );

    const responseTime = Date.now() - startTime;

    console.log(`Get stats API response time: ${responseTime}ms`);
    expect(response.status()).toBe(200);
    expect(responseTime).toBeLessThan(PERFORMANCE_TARGETS.API_RESPONSE_TIME);

    // Verify stats structure
    const data = await response.json();
    expect(data.totalRules).toBeDefined();
    expect(data.activeRules).toBeDefined();
    expect(data.byMatchType).toBeDefined();
  });

  test('should handle concurrent requests', async ({
    authenticatedPage,
    apiBaseUrl,
  }) => {
    const startTime = Date.now();

    // Make 5 concurrent requests
    const promises = [
      authenticatedPage.request.get(`${apiBaseUrl}/categories`),
      authenticatedPage.request.get(`${apiBaseUrl}/credit-cards`),
      authenticatedPage.request.get(`${apiBaseUrl}/planned-accounts`),
      authenticatedPage.request.get(`${apiBaseUrl}/classification-rules`),
      authenticatedPage.request.get(`${apiBaseUrl}/classification-rules/stats`),
    ];

    const responses = await Promise.all(promises);
    const totalTime = Date.now() - startTime;

    console.log(`Concurrent requests (5) total time: ${totalTime}ms`);

    // All should succeed
    responses.forEach(response => {
      expect(response.status()).toBe(200);
    });

    // Total time should not be too excessive
    expect(totalTime).toBeLessThan(PERFORMANCE_TARGETS.API_RESPONSE_TIME * 5);
  });
});

/**
 * Performance targets summary:
 * - API responses: < 200ms
 * - Page loads: < 3s
 * - User interactions: < 500ms
 * - Bulk operations: < 600ms
 * - Concurrent requests (5): < 1000ms
 */
