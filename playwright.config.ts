import { defineConfig } from '@playwright/test';

const E2E_DB = process.env.E2E_DATABASE_URL ?? 'postgres://alumni:alumni@localhost:5432/alumni_e2e';
export const e2eEnv = {
  NODE_ENV: 'development',
  DATABASE_URL: E2E_DB,
  PORT: '3100',
  APP_BASE_URL: 'http://localhost:5174',
  VERIFICATION_EMAIL_DOMAINS: 'student:students.uni.edu,faculty:uni.edu',
  DEV_MAILBOX: 'true',
};

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'retain-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : undefined,
  },
  webServer: [
    {
      command:
        'pnpm --filter @alumni/api exec tsx scripts/reset-db.ts && pnpm --filter @alumni/api exec tsx src/server.ts',
      url: 'http://127.0.0.1:3100/api/health',
      env: e2eEnv,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'pnpm --filter @alumni/web exec vite --port 5174 --strictPort',
      url: 'http://localhost:5174',
      env: { VITE_API_TARGET: 'http://127.0.0.1:3100' },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
