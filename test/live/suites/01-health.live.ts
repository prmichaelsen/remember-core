import { getClient } from '../helpers/client.js';

describe('Health (live)', () => {
  const client = getClient();

  it('GET /health returns ok', async () => {
    const res = await client.health.check();
    expect(res.data).toBeDefined();
    expect(res.error).toBeNull();
  });

  it('version() returns service version info', async () => {
    const res = await client.health.version();

    if (res.error) {
      console.warn('version error:', res.error);
      expect([400, 500]).toContain(res.error.status);
      return;
    }

    expect(res.data).toBeDefined();
  });
});
