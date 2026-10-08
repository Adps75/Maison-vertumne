import { defineConfig } from "@playwright/test";
import dotenv from "dotenv";
import path from "path";

// Charger .env.test.local pour E2E_EMAIL et E2E_PASSWORD
dotenv.config({ path: path.resolve(process.cwd(), ".env.test.local") });

const port = parseInt(process.env.PORT ?? "3000", 10);

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: `http://localhost:${port}`,
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
    {
      name: "webkit",
      use: { browserName: "webkit" },
      dependencies: ["auth-setup"],
    },
  ],
  webServer: {
    command: `npm run dev -- -p ${port}`,
    port,
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
