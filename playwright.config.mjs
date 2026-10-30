import { defineConfig, devices } from '@playwright/test';

// Normaal zoekt Playwright zelf de browser die bij deze versie hoort.
// Draai je in een omgeving die al een Chromium klaar heeft staan (zoals een
// kale server of een container), zet dan CHROMIUM_PAD op het pad daarvan.
const chromiumPad = process.env.CHROMIUM_PAD;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  // in GitHub Actions nooit een vergeten .only laten slippen
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never' }]]
    : [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    // bij een mislukte test een opname bewaren, dat scheelt zoeken
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{
    name: 'chromium',
    use: {
      ...devices['Desktop Chrome'],
      ...(chromiumPad ? { launchOptions: { executablePath: chromiumPad } } : {}),
    },
  }],
  webServer: {
    command: 'node tools/serve.mjs',
    url: 'http://127.0.0.1:4173/',
    reuseExistingServer: !process.env.CI,
    timeout: 20_000,
  },
});
