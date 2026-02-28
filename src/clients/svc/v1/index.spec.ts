// src/clients/svc/v1/index.spec.ts
import { createSvcClient } from './index';

// Mock global fetch
const mockFetch = jest.fn();
(globalThis as any).fetch = mockFetch;

describe('createSvcClient', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('returns all 7 resource groups', () => {
    const client = createSvcClient({
      baseUrl: 'https://api.example.com',
      getAuthToken: async () => 'token',
    });

    expect(client.memories).toBeDefined();
    expect(client.relationships).toBeDefined();
    expect(client.spaces).toBeDefined();
    expect(client.confirmations).toBeDefined();
    expect(client.preferences).toBeDefined();
    expect(client.trust).toBeDefined();
    expect(client.health).toBeDefined();
  });

  it('memories has all 6 methods', () => {
    const client = createSvcClient({
      baseUrl: 'https://api.example.com',
      getAuthToken: async () => 'token',
    });

    expect(typeof client.memories.create).toBe('function');
    expect(typeof client.memories.update).toBe('function');
    expect(typeof client.memories.delete).toBe('function');
    expect(typeof client.memories.search).toBe('function');
    expect(typeof client.memories.similar).toBe('function');
    expect(typeof client.memories.query).toBe('function');
  });

  it('relationships has all 4 methods', () => {
    const client = createSvcClient({
      baseUrl: 'https://api.example.com',
      getAuthToken: async () => 'token',
    });

    expect(typeof client.relationships.create).toBe('function');
    expect(typeof client.relationships.update).toBe('function');
    expect(typeof client.relationships.delete).toBe('function');
    expect(typeof client.relationships.search).toBe('function');
  });

  it('spaces has all 6 methods', () => {
    const client = createSvcClient({
      baseUrl: 'https://api.example.com',
      getAuthToken: async () => 'token',
    });

    expect(typeof client.spaces.publish).toBe('function');
    expect(typeof client.spaces.retract).toBe('function');
    expect(typeof client.spaces.revise).toBe('function');
    expect(typeof client.spaces.moderate).toBe('function');
    expect(typeof client.spaces.search).toBe('function');
    expect(typeof client.spaces.query).toBe('function');
  });

  it('confirmations has both methods', () => {
    const client = createSvcClient({
      baseUrl: 'https://api.example.com',
      getAuthToken: async () => 'token',
    });

    expect(typeof client.confirmations.confirm).toBe('function');
    expect(typeof client.confirmations.deny).toBe('function');
  });

  it('preferences has both methods', () => {
    const client = createSvcClient({
      baseUrl: 'https://api.example.com',
      getAuthToken: async () => 'token',
    });

    expect(typeof client.preferences.get).toBe('function');
    expect(typeof client.preferences.update).toBe('function');
  });

  it('trust has all 7 methods', () => {
    const client = createSvcClient({
      baseUrl: 'https://api.example.com',
      getAuthToken: async () => 'token',
    });

    expect(typeof client.trust.getGhostConfig).toBe('function');
    expect(typeof client.trust.updateGhostConfig).toBe('function');
    expect(typeof client.trust.setUserTrust).toBe('function');
    expect(typeof client.trust.removeUserTrust).toBe('function');
    expect(typeof client.trust.blockUser).toBe('function');
    expect(typeof client.trust.unblockUser).toBe('function');
    expect(typeof client.trust.checkAccess).toBe('function');
  });

  it('health has both methods', () => {
    const client = createSvcClient({
      baseUrl: 'https://api.example.com',
      getAuthToken: async () => 'token',
    });

    expect(typeof client.health.check).toBe('function');
    expect(typeof client.health.version).toBe('function');
  });

  it('total method count is 29', () => {
    const client = createSvcClient({
      baseUrl: 'https://api.example.com',
      getAuthToken: async () => 'token',
    });

    const methodCount =
      Object.keys(client.memories).length +
      Object.keys(client.relationships).length +
      Object.keys(client.spaces).length +
      Object.keys(client.confirmations).length +
      Object.keys(client.preferences).length +
      Object.keys(client.trust).length +
      Object.keys(client.health).length;

    expect(methodCount).toBe(29);
  });
});
