// src/clients/svc/v1/memories.ts
// MemoriesResource — 1:1 mirror of /api/svc/v1/memories routes

import type { HttpClient } from '../../http.js';
import type { SdkResponse } from '../../response.js';

export interface MemorySourceContext {
  author?: string | null;
  space?: string | null;
  group?: string | null;
}

export interface MemoryGetOptions extends MemorySourceContext {
  include?: string | null;
}

export interface MemoriesResource {
  get(userId: string, id: string, options?: MemoryGetOptions): Promise<SdkResponse<unknown>>;
  create(userId: string, input: Record<string, unknown>): Promise<SdkResponse<unknown>>;
  update(userId: string, id: string, input: Record<string, unknown>): Promise<SdkResponse<unknown>>;
  delete(userId: string, id: string, input?: Record<string, unknown>): Promise<SdkResponse<unknown>>;
  search(userId: string, input: Record<string, unknown>): Promise<SdkResponse<unknown>>;
  similar(userId: string, input: Record<string, unknown>): Promise<SdkResponse<unknown>>;
  query(userId: string, input: Record<string, unknown>): Promise<SdkResponse<unknown>>;
  byTime(userId: string, input: Record<string, unknown>): Promise<SdkResponse<unknown>>;
  byDensity(userId: string, input: Record<string, unknown>): Promise<SdkResponse<unknown>>;
  byTimeSlice(userId: string, input: Record<string, unknown>): Promise<SdkResponse<unknown>>;
  byDensitySlice(userId: string, input: Record<string, unknown>): Promise<SdkResponse<unknown>>;
  import(userId: string, input: Record<string, unknown>): Promise<SdkResponse<{ job_id: string }>>;
  rate(userId: string, memoryId: string, rating: number): Promise<SdkResponse<unknown>>;
  retractRating(userId: string, memoryId: string): Promise<SdkResponse<void>>;
  getMyRating(userId: string, memoryId: string): Promise<SdkResponse<unknown>>;
  byRating(userId: string, input: Record<string, unknown>): Promise<SdkResponse<unknown>>;
  byDiscovery(userId: string, input: Record<string, unknown>): Promise<SdkResponse<unknown>>;
}

export function createMemoriesResource(http: HttpClient): MemoriesResource {
  return {
    get(userId, id, options) {
      const params = new URLSearchParams();
      if (options?.author) params.set('author', options.author);
      if (options?.space) params.set('space', options.space);
      if (options?.group) params.set('group', options.group);
      if (options?.include) params.set('include', options.include);
      const qs = params.toString();
      return http.request('GET', `/api/svc/v1/memories/${id}${qs ? `?${qs}` : ''}`, { userId });
    },
    create(userId, input) {
      return http.request('POST', '/api/svc/v1/memories', { userId, body: input });
    },
    update(userId, id, input) {
      return http.request('PATCH', `/api/svc/v1/memories/${id}`, { userId, body: input });
    },
    delete(userId, id, input) {
      return http.request('DELETE', `/api/svc/v1/memories/${id}`, { userId, ...(input ? { body: input } : {}) });
    },
    search(userId, input) {
      return http.request('POST', '/api/svc/v1/memories/search', { userId, body: input });
    },
    similar(userId, input) {
      return http.request('POST', '/api/svc/v1/memories/similar', { userId, body: input });
    },
    query(userId, input) {
      return http.request('POST', '/api/svc/v1/memories/query', { userId, body: input });
    },
    byTime(userId, input) {
      return http.request('POST', '/api/svc/v1/memories/by-time', { userId, body: input });
    },
    byDensity(userId, input) {
      return http.request('POST', '/api/svc/v1/memories/by-density', { userId, body: input });
    },
    byTimeSlice(userId, input) {
      return http.request('POST', '/api/svc/v1/memories/by-time-slice', { userId, body: input });
    },
    byDensitySlice(userId, input) {
      return http.request('POST', '/api/svc/v1/memories/by-density-slice', { userId, body: input });
    },
    import(userId, input) {
      return http.request('POST', '/api/svc/v1/memories/import', { userId, body: input });
    },
    rate(userId, memoryId, rating) {
      return http.request('PUT', `/api/svc/v1/memories/${memoryId}/rating`, { userId, body: { rating } });
    },
    retractRating(userId, memoryId) {
      return http.request('DELETE', `/api/svc/v1/memories/${memoryId}/rating`, { userId });
    },
    getMyRating(userId, memoryId) {
      return http.request('GET', `/api/svc/v1/memories/${memoryId}/rating`, { userId });
    },
    byRating(userId, input) {
      return http.request('POST', '/api/svc/v1/memories/by-rating', { userId, body: input });
    },
    byDiscovery(userId, input) {
      return http.request('POST', '/api/svc/v1/memories/by-discovery', { userId, body: input });
    },
  };
}
