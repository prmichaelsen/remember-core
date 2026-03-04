// src/app/index.spec.ts
import { createAppClient } from './index';

// Mock global fetch
const mockFetch = jest.fn();
(globalThis as any).fetch = mockFetch;

describe('createAppClient', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('returns all resource groups', () => {
    const client = createAppClient({
      baseUrl: 'https://api.example.com',
      getAuthToken: async () => 'token',
    });

    expect(client.profiles).toBeDefined();
    expect(client.ghost).toBeDefined();
    expect(client.memories).toBeDefined();
    expect(client.relationships).toBeDefined();
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

  it('memories has get method', () => {
    const client = createAppClient({
      baseUrl: 'https://api.example.com',
      getAuthToken: async () => 'token',
    });

    expect(typeof client.memories.get).toBe('function');
  });

  it('relationships has getMemories method', () => {
    const client = createAppClient({
      baseUrl: 'https://api.example.com',
      getAuthToken: async () => 'token',
    });

    expect(typeof client.relationships.getMemories).toBe('function');
  });

  it('total method count is 7', () => {
    const client = createAppClient({
      baseUrl: 'https://api.example.com',
      getAuthToken: async () => 'token',
    });

    const methodCount =
      Object.keys(client.profiles).length +
      Object.keys(client.ghost).length +
      Object.keys(client.memories).length +
      Object.keys(client.relationships).length;

    expect(methodCount).toBe(7);
  });
});
