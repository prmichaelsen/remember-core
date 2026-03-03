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

export interface HaikuExtraction {
  keywords: string[];    // 5-10 specific terms
  topics: string[];      // 2-5 high-level topics
  themes: string[];      // 2-5 abstract themes
  summary: string;       // 1-2 sentence summary
}

export interface HaikuClient {
  validateCluster(input: HaikuValidationInput): Promise<HaikuValidationResult>;
  extractFeatures(content: string): Promise<HaikuExtraction>;
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

function buildExtractionPrompt(content: string): string {
  return `Analyze this memory and extract structured information for semantic search.

Memory:
${content}

Extract the following and respond with ONLY valid JSON:
{
  "keywords": ["5-10 specific terms, entities, or concepts"],
  "topics": ["2-5 high-level subject areas"],
  "themes": ["2-5 abstract themes or ideas"],
  "summary": "1-2 sentence summary capturing core meaning"
}

Focus on:
- Keywords: proper nouns, technical terms, specific concepts
- Topics: broad subject categories (e.g., "technology", "relationships", "travel")
- Themes: deeper meanings or patterns (e.g., "growth", "conflict", "discovery")
- Summary: concise distillation of the main idea

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

  async function callApi(prompt: string): Promise<any> {
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
      throw new Error(`api_error: ${response.status}`);
    }

    const data = await response.json() as any;
    const text = data.content?.[0]?.text ?? '';
    return JSON.parse(text);
  }

  return {
    async validateCluster(input: HaikuValidationInput): Promise<HaikuValidationResult> {
      try {
        const prompt = buildValidationPrompt(input);
        const parsed = await callApi(prompt);
        return parsed as HaikuValidationResult;
      } catch {
        return { valid: false, reason: 'api_error' };
      }
    },

    async extractFeatures(content: string): Promise<HaikuExtraction> {
      try {
        const prompt = buildExtractionPrompt(content);
        const parsed = await callApi(prompt);
        return parsed as HaikuExtraction;
      } catch {
        // Return empty extraction on error
        return {
          keywords: [],
          topics: [],
          themes: [],
          summary: '',
        };
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
  defaultExtraction?: HaikuExtraction,
): HaikuClient {
  const result = defaultResult ?? {
    valid: true,
    relationship_type: 'topical',
    observation: 'Mock relationship',
    strength: 0.7,
    confidence: 0.8,
    tags: ['test'],
  };

  const extraction = defaultExtraction ?? {
    keywords: ['test', 'mock', 'keyword'],
    topics: ['testing', 'development'],
    themes: ['quality', 'reliability'],
    summary: 'Mock memory for testing purposes.',
  };

  return {
    async validateCluster(): Promise<HaikuValidationResult> {
      return result;
    },

    async extractFeatures(): Promise<HaikuExtraction> {
      return extraction;
    },
  };
}
