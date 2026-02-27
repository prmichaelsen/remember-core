/**
 * Context and location types for remember-core.
 * Ported from remember-mcp/src/types/memory.ts
 */

/**
 * GPS coordinates
 */
export interface GPSCoordinates {
  latitude: number;
  longitude: number;
  accuracy?: number; // Accuracy in meters
  altitude?: number;
  timestamp: string; // ISO 8601 datetime
}

/**
 * Address information
 */
export interface Address {
  formatted: string; // Full formatted address
  street?: string;
  city?: string;
  state?: string;
  country?: string;
  postal_code?: string;
  timezone?: string;
}

/**
 * Location information (from platform cookies)
 */
export interface Location {
  gps: GPSCoordinates | null;
  address: Address | null;
  source: 'gps' | 'ip' | 'manual' | 'cached' | 'unavailable';
  confidence: number; // 0-1
  is_approximate: boolean;
}

/**
 * Conversation participant
 */
export interface Participant {
  user_id: string;
  role: 'user' | 'assistant' | 'system';
  name?: string;
}

/**
 * Source information
 */
export interface Source {
  type: 'conversation' | 'import' | 'inference' | 'manual' | 'api';
  platform?: string; // web, mobile, api
  client?: string;
  version?: string;
}

/**
 * Environment information
 */
export interface Environment {
  location?: Location;
  device?: string;
  user_agent?: string;
}

/**
 * Context information about how/when memory was created
 */
export interface MemoryContext {
  conversation_id?: string;
  conversation_title?: string;
  turn_number?: number;
  summary?: string; // Brief summary for quick retrieval
  participants?: Participant[];
  timestamp: string; // ISO 8601 datetime
  timezone?: string;
  source: Source;
  environment?: Environment;
  tags?: string[];
  notes?: string;
}
