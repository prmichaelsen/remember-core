import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import dotenv from 'dotenv';

export default async function globalSetup() {
  // Load .env.e1 if env var not already set
  if (!process.env.E1_PLATFORM_SERVICE_TOKEN) {
    const envPath = resolve(process.cwd(), '.env.e1');
    if (existsSync(envPath)) {
      dotenv.config({ path: envPath });
    }
  }

  if (!process.env.E1_PLATFORM_SERVICE_TOKEN) {
    throw new Error(
      'E1_PLATFORM_SERVICE_TOKEN is required for live tests.\n' +
      'Run: npm run fetch-e1-secrets',
    );
  }

  // Health check to warm the e1 instance
  const healthRes = await fetch(
    'https://remember-rest-service-e1-dit6gawkbq-uc.a.run.app/health',
  );
  if (!healthRes.ok) {
    throw new Error(`E1 health check failed: ${healthRes.status}`);
  }

  console.log('Live test setup complete — e1 service healthy');
}
