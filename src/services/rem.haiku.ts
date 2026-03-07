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
  // Sub-cluster support: Haiku splits heterogeneous clusters into related subsets
  sub_clusters?: Array<{
    memory_ids: string[];
    relationship_type: string;
    observation: string;
    strength: number;
    confidence: number;
    tags: string[];
  }>;
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

  return `**CRITICAL**: Your primary task is to SALVAGE relationships from this cluster. Even if the full group isn't cohesive, identify ANY sub-groups that are related.

Memories:
${memoryList}

**Three-tier decision process**:

1. **FIRST**: Check if ALL memories form ONE cohesive group
   - If yes: return valid=true with all memory IDs

2. **SECOND** (MOST IMPORTANT): If not all cohesive, split into 2+ sub-clusters
   - Look for ANY groupings of 2+ memories that share connections
   - Each sub-cluster must share: topic, entities, timeframe, location, activity, hub-and-spoke, creative format, or cause-effect
   - **Strongly prefer creating sub-clusters over rejecting everything**
   - Drop orphans (memories that don't fit any group)

3. **LAST RESORT**: Only reject completely if NO memories relate to each other at all

**Valid connection types**:
- **Common topic/theme** (e.g., all about dogs, comedy, coding, travel, Airbnb)
- **Common entities** (people, places, events, projects, businesses)
- **Common timeframe or location**
- **Common activity or experience**
- **Hub-and-spoke** (main topic + related activities/tools/resources)
- **Cause and effect** (related sequence)
- **Creative format** (poems, lyrics, quotes - recognize by structure/rhythm)
- **Multimedia** (YouTube links + images + text about same topic)

**Examples showing sub-clustering**:
✓ 10 dog memories + 8 cat memories + 3 bird memories → 3 sub-clusters (pets)
✓ 5 comedy show memories + 4 YouTube links → 1-2 sub-clusters (entertainment)
✓ 4 Airbnb posts + 3 house photos + 2 unrelated → 1 sub-cluster (drop unrelated)
✓ 6 duplicates of same URL + 5 related images → 1 sub-cluster (multimedia)
✓ 3 song revisions + 2 chord progressions + 1 recipe → 1 sub-cluster (drop recipe)

**Response formats**:

All memories cohesive (ONE group):
{"valid":true,"relationship_type":"<type>","observation":"<title>","strength":<0-1>,"confidence":<0-1>,"tags":["<tags>"]}

Multiple distinct groups (SPLIT into sub-clusters):
{"valid":false,"reason":"heterogeneous cluster split into sub-groups","sub_clusters":[{"memory_ids":["id1","id2","id3"],"relationship_type":"<type>","observation":"<title>","strength":<0-1>,"confidence":<0-1>,"tags":["<tags>"]},{"memory_ids":["id4","id5"],"relationship_type":"<type>","observation":"<title>","strength":<0-1>,"confidence":<0-1>,"tags":["<tags>"]}]}

Nothing salvageable (RARE - only if truly all unrelated):
{"valid":false,"reason":"no related memories found"}

**Directive**: AGGRESSIVELY look for sub-clusters. It's better to create 2-3 small relationships than reject everything.`;
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
  // Default to Sonnet for better relationship reasoning
  // Haiku is too conservative and rejects obvious relationships
  // Can override with 'claude-haiku-4-5-20251001' for cost savings if needed
  const model = options.model ?? 'claude-sonnet-4-5-20241022';

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
    const cleaned = text.replace(/```json?\s*/g, '').replace(/```\s*/g, '').trim();
    return JSON.parse(cleaned);
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
