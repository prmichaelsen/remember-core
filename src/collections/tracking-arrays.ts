/**
 * Tracking Array Management.
 *
 * Ported from remember-mcp/src/collections/tracking-arrays.ts.
 * Immutable utilities for managing space_ids and group_ids tracking arrays.
 */

export interface MemoryWithTracking {
  space_ids: string[];
  group_ids: string[];
  [key: string]: any;
}

export interface PublishedLocations {
  spaces: string[];
  groups: string[];
}

export function addToSpaceIds<T extends MemoryWithTracking>(memory: T, spaceId: string): T {
  if (memory.space_ids.includes(spaceId)) return memory;
  return { ...memory, space_ids: [...memory.space_ids, spaceId] };
}

export function removeFromSpaceIds<T extends MemoryWithTracking>(memory: T, spaceId: string): T {
  return { ...memory, space_ids: memory.space_ids.filter((id) => id !== spaceId) };
}

export function addToGroupIds<T extends MemoryWithTracking>(memory: T, groupId: string): T {
  if (memory.group_ids.includes(groupId)) return memory;
  return { ...memory, group_ids: [...memory.group_ids, groupId] };
}

export function removeFromGroupIds<T extends MemoryWithTracking>(memory: T, groupId: string): T {
  return { ...memory, group_ids: memory.group_ids.filter((id) => id !== groupId) };
}

export function isPublishedToSpace(memory: MemoryWithTracking, spaceId: string): boolean {
  return memory.space_ids.includes(spaceId);
}

export function isPublishedToGroup(memory: MemoryWithTracking, groupId: string): boolean {
  return memory.group_ids.includes(groupId);
}

export function getPublishedLocations(memory: MemoryWithTracking): PublishedLocations {
  return { spaces: [...memory.space_ids], groups: [...memory.group_ids] };
}

export function isPublished(memory: MemoryWithTracking): boolean {
  return memory.space_ids.length > 0 || memory.group_ids.length > 0;
}

export function getPublishedCount(memory: MemoryWithTracking): number {
  return memory.space_ids.length + memory.group_ids.length;
}

export function initializeTracking<T extends Record<string, any>>(memory: T): T & MemoryWithTracking {
  return {
    ...memory,
    space_ids: (memory as any).space_ids || [],
    group_ids: (memory as any).group_ids || [],
  };
}

export function addMultipleSpaceIds<T extends MemoryWithTracking>(memory: T, spaceIds: string[]): T {
  const existing = new Set(memory.space_ids);
  const merged = [...memory.space_ids];
  for (const spaceId of spaceIds) {
    if (!existing.has(spaceId)) {
      existing.add(spaceId);
      merged.push(spaceId);
    }
  }
  return { ...memory, space_ids: merged };
}

export function addMultipleGroupIds<T extends MemoryWithTracking>(memory: T, groupIds: string[]): T {
  const existing = new Set(memory.group_ids);
  const merged = [...memory.group_ids];
  for (const groupId of groupIds) {
    if (!existing.has(groupId)) {
      existing.add(groupId);
      merged.push(groupId);
    }
  }
  return { ...memory, group_ids: merged };
}
