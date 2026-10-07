import { defineConfig } from "@playwright/test";
import dotenv from "dotenv";
import path from "path";

// Charger .env.test.local pour E2E_EMAIL et E2E_PASSWORD
dotenv.config({ path: path.resolve(process.cwd(), ".env.test.local") });

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: "http://localhost:3000",
    headless: true,
    viewport: { width: 1280, height: 800 },
  },
  projects: [
    {
      name: "auth-setup",
      testMatch: "auth.setup.ts",
    },
    {
      name: "chromium",
      use: { browserName: "chromium" },
      dependencies: ["auth-setup"],
    },
  ],
  webServer: {
    command: "npm run dev",
    port: 3000,
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
