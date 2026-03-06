import { getClient } from '../helpers/client.js';

describe('Health (live)', () => {
  const client = getClient();

  it('GET /health returns ok', async () => {
    const res = await client.health.check();
    expect(res.data).toBeDefined();
    expect(res.error).toBeNull();
  });
});
