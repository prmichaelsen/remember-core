/**
 * REM Haiku validation client.
 *
 * Evaluates candidate clusters via Anthropic Haiku API to determine
 * if they form meaningful relationship groups. Acts as intelligence gate
 * before relationship creation.
 */

// ─── Types ───────────────────────────────────────────────────────────────

export interface HaikuValidationInput {
  memories: Array<{
    id: string;
    content: string;
    tags: string[];
    content_type?: string;
  }>;
}

export interface HaikuValidationResult {
  valid: boolean;
  relationship_type?: string;
  observation?: string;
  strength?: number;
  confidence?: number;
  tags?: string[];
  reason?: string;
}

export interface HaikuClient {
  validateCluster(input: HaikuValidationInput): Promise<HaikuValidationResult>;
}

// ─── Prompt ──────────────────────────────────────────────────────────────

function buildValidationPrompt(input: HaikuValidationInput): string {
  const memoryList = input.memories
    .map((m) => `- [${m.id}] ${m.content} (tags: ${m.tags.join(', ') || 'none'})`)
    .join('\n');

  return `Given these memories from a single collection, determine if they form a meaningful group that should be linked as a relationship.

Memories:
${memoryList}

If these memories form a coherent group, respond with ONLY valid JSON:
{"valid":true,"relationship_type":"<type>","observation":"<descriptive title for this group>","strength":<0-1>,"confidence":<0-1>,"tags":["<relevant tags>"]}

If they do NOT form a meaningful group, respond with ONLY valid JSON:
{"valid":false,"reason":"<why not>"}

Relationship types: topical, temporal, locational, author, genre, event, or other descriptive type.
Respond with ONLY the JSON object, no other text.`;
}

// ─── Client ──────────────────────────────────────────────────────────────

/**
 * Create a Haiku validation client that calls Anthropic's API.
 */
export function createHaikuClient(options: {
  apiKey: string;
  model?: string;
}): HaikuClient {
  const model = options.model ?? 'claude-haiku-4-5-20251001';

  return {
    async validateCluster(input: HaikuValidationInput): Promise<HaikuValidationResult> {
      try {
        const prompt = buildValidationPrompt(input);

        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': options.apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model,
            max_tokens: 512,
            messages: [{ role: 'user', content: prompt }],
          }),
        });

        if (!response.ok) {
          return { valid: false, reason: `api_error: ${response.status}` };
        }

        const data = await response.json() as any;
        const text = data.content?.[0]?.text ?? '';

        const parsed = JSON.parse(text);
        return parsed as HaikuValidationResult;
      } catch {
        return { valid: false, reason: 'api_error' };
      }
    },
  };
}

// ─── Mock ────────────────────────────────────────────────────────────────

/**
 * Create a mock Haiku client for testing.
 * Returns predefined responses, or a default valid response.
 */
export function createMockHaikuClient(
  defaultResult?: HaikuValidationResult,
): HaikuClient {
  const result = defaultResult ?? {
    valid: true,
    relationship_type: 'topical',
    observation: 'Mock relationship',
    strength: 0.7,
    confidence: 0.8,
    tags: ['test'],
  };

  return {
    async validateCluster(): Promise<HaikuValidationResult> {
      return result;
    },
  };
}
