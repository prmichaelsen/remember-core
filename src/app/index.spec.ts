// src/app/index.spec.ts
import { createAppClient } from './index';

// Mock global fetch
const mockFetch = jest.fn();
(globalThis as any).fetch = mockFetch;

describe('createAppClient', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('returns profiles and ghost resource groups', () => {
    const client = createAppClient({
      baseUrl: 'https://api.example.com',
      getAuthToken: async () => 'token',
    });

    expect(client.profiles).toBeDefined();
    expect(client.ghost).toBeDefined();
  });

  it('profiles has all 4 methods', () => {
    const client = createAppClient({
      baseUrl: 'https://api.example.com',
      getAuthToken: async () => 'token',
    });

    expect(typeof client.profiles.createAndPublish).toBe('function');
    expect(typeof client.profiles.search).toBe('function');
    expect(typeof client.profiles.retract).toBe('function');
    expect(typeof client.profiles.updateAndRepublish).toBe('function');
  });

  it('ghost has searchAsGhost method', () => {
    const client = createAppClient({
      baseUrl: 'https://api.example.com',
      getAuthToken: async () => 'token',
    });

    expect(typeof client.ghost.searchAsGhost).toBe('function');
  });

  it('total method count is 5', () => {
    const client = createAppClient({
      baseUrl: 'https://api.example.com',
      getAuthToken: async () => 'token',
    });

    const methodCount =
      Object.keys(client.profiles).length +
      Object.keys(client.ghost).length;

    expect(methodCount).toBe(5);
  });
});
