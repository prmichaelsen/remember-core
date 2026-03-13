// src/services/relationship-reorder.ts
// Pure reorder logic for ordered relationships (M77).

import type { ReorderOperation } from '../types/memory.types.js';

/** Parse member_order_json from storage. Returns empty map for null/undefined. */
export function parseMemberOrder(json: string | null | undefined): Record<string, number> {
  if (!json) return {};
  try {
    return JSON.parse(json) as Record<string, number>;
  } catch {
    return {};
  }
}

/** Serialize member order map to JSON for storage. */
export function serializeMemberOrder(order: Record<string, number>): string {
  return JSON.stringify(order);
}

/** Build default order from array: index 0..N-1 based on array position. */
export function buildDefaultOrder(memberIds: string[]): Record<string, number> {
  const order: Record<string, number> = {};
  for (let i = 0; i < memberIds.length; i++) {
    order[memberIds[i]] = i;
  }
  return order;
}

/** Re-index positions to dense 0..N-1, preserving relative order. */
export function compactOrder(order: Record<string, number>): Record<string, number> {
  const entries = Object.entries(order).sort((a, b) => a[1] - b[1]);
  const compacted: Record<string, number> = {};
  for (let i = 0; i < entries.length; i++) {
    compacted[entries[i][0]] = i;
  }
  return compacted;
}

/** Sort member IDs by their position in the order map. Unordered IDs sort to the end. */
export function sortMemberIdsByOrder(memberIds: string[], order: Record<string, number>): string[] {
  const maxPos = Object.keys(order).length;
  return [...memberIds].sort((a, b) => (order[a] ?? maxPos) - (order[b] ?? maxPos));
}

/**
 * Apply a reorder operation to the current order map.
 * Returns a new compacted order map.
 *
 * @throws Error with message containing '409' for set_order membership mismatch.
 */
export function applyReorder(
  currentOrder: Record<string, number>,
  memberIds: string[],
  operation: ReorderOperation,
): Record<string, number> {
  // Ensure we have a working order — lazy backfill if empty
  const order = Object.keys(currentOrder).length > 0
    ? { ...currentOrder }
    : buildDefaultOrder(memberIds);

  switch (operation.type) {
    case 'move_to_index':
      return applyMoveToIndex(order, operation.memory_id, operation.index);
    case 'swap':
      return applySwap(order, operation.memory_id_a, operation.memory_id_b);
    case 'set_order':
      return applySetOrder(order, memberIds, operation.ordered_memory_ids);
    case 'move_before':
      return applyMoveBefore(order, operation.memory_id, operation.before);
    case 'move_after':
      return applyMoveAfter(order, operation.memory_id, operation.after);
    default: {
      const _exhaustive: never = operation;
      throw new Error(`Unknown reorder operation: ${(_exhaustive as ReorderOperation).type}`);
    }
  }
}

function applyMoveToIndex(order: Record<string, number>, memoryId: string, targetIndex: number): Record<string, number> {
  const currentPos = order[memoryId];
  if (currentPos === undefined) throw new Error(`Memory ${memoryId} not in order map`);
  if (currentPos === targetIndex) return compactOrder(order);

  // Remove from current position and shift
  const sorted = Object.entries(order).sort((a, b) => a[1] - b[1]);
  const ids = sorted.map(([id]) => id);
  const fromIdx = ids.indexOf(memoryId);
  ids.splice(fromIdx, 1);

  // Clamp target
  const clampedTarget = Math.max(0, Math.min(targetIndex, ids.length));
  ids.splice(clampedTarget, 0, memoryId);

  return buildDefaultOrder(ids);
}

function applySwap(order: Record<string, number>, idA: string, idB: string): Record<string, number> {
  if (order[idA] === undefined) throw new Error(`Memory ${idA} not in order map`);
  if (order[idB] === undefined) throw new Error(`Memory ${idB} not in order map`);

  const result = { ...order };
  const tmp = result[idA];
  result[idA] = result[idB];
  result[idB] = tmp;
  return result;
}

function applySetOrder(
  _currentOrder: Record<string, number>,
  memberIds: string[],
  orderedMemoryIds: string[],
): Record<string, number> {
  const memberSet = new Set(memberIds);
  const inputSet = new Set(orderedMemoryIds);

  if (memberSet.size !== inputSet.size) {
    throw new Error('409: set_order membership mismatch — count differs');
  }
  for (const id of orderedMemoryIds) {
    if (!memberSet.has(id)) {
      throw new Error(`409: set_order membership mismatch — ${id} not a member`);
    }
  }
  for (const id of memberIds) {
    if (!inputSet.has(id)) {
      throw new Error(`409: set_order membership mismatch — ${id} missing from input`);
    }
  }

  return buildDefaultOrder(orderedMemoryIds);
}

function applyMoveBefore(order: Record<string, number>, memoryId: string, beforeId: string): Record<string, number> {
  if (order[memoryId] === undefined) throw new Error(`Memory ${memoryId} not in order map`);
  if (order[beforeId] === undefined) throw new Error(`Memory ${beforeId} not in order map`);
  if (memoryId === beforeId) return compactOrder(order);

  const sorted = Object.entries(order).sort((a, b) => a[1] - b[1]);
  const ids = sorted.map(([id]) => id);

  // Remove memoryId from current position
  ids.splice(ids.indexOf(memoryId), 1);
  // Insert before the target
  const targetIdx = ids.indexOf(beforeId);
  ids.splice(targetIdx, 0, memoryId);

  return buildDefaultOrder(ids);
}

function applyMoveAfter(order: Record<string, number>, memoryId: string, afterId: string): Record<string, number> {
  if (order[memoryId] === undefined) throw new Error(`Memory ${memoryId} not in order map`);
  if (order[afterId] === undefined) throw new Error(`Memory ${afterId} not in order map`);
  if (memoryId === afterId) return compactOrder(order);

  const sorted = Object.entries(order).sort((a, b) => a[1] - b[1]);
  const ids = sorted.map(([id]) => id);

  ids.splice(ids.indexOf(memoryId), 1);
  const targetIdx = ids.indexOf(afterId);
  ids.splice(targetIdx + 1, 0, memoryId);

  return buildDefaultOrder(ids);
}
