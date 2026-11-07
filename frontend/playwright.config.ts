import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:5173', channel: process.env.PLAYWRIGHT_CHANNEL },
  webServer: [
    { command: 'python -m gridskills.server', cwd: '..', url: 'http://127.0.0.1:8000/health', reuseExistingServer: false },
    { command: 'npm run dev -- --host 127.0.0.1', url: 'http://127.0.0.1:5173', reuseExistingServer: false },
  ],
})
