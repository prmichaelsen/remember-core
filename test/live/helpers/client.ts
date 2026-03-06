import { createSvcClient } from '../../../src/clients/svc/v1/index.js';
import type { SvcClient } from '../../../src/clients/svc/v1/index.js';

const E1_BASE_URL = 'https://remember-rest-service-e1-dit6gawkbq-uc.a.run.app';

function getServiceToken(): string {
  const token = process.env.E1_PLATFORM_SERVICE_TOKEN;
  if (!token) {
    throw new Error(
      'E1_PLATFORM_SERVICE_TOKEN env var is required. ' +
      'Set it from GCP Secret Manager: gcloud secrets versions access latest --secret=remember-e1-platform-service-token --project=com-f5-parm',
    );
  }
  return token;
}

let cachedClient: SvcClient | null = null;

export function getClient(): SvcClient {
  if (!cachedClient) {
    cachedClient = createSvcClient({
      baseUrl: E1_BASE_URL,
      auth: {
        serviceToken: getServiceToken(),
        jwtOptions: {
          issuer: 'agentbase.me',
          audience: 'svc',
          expiresIn: '1h',
        },
      },
    });
  }
  return cachedClient;
}
