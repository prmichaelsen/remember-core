/**
 * Content moderation service.
 *
 * LLM-based gate for space publish/revise operations.
 * Uses Claude Haiku to classify content as pass/fail.
 * Follows rem.haiku.ts pattern (direct HTTP, no SDK).
 *
 * See: agent/design/local.content-moderation.md
 */

import { createHash } from 'crypto';

// ─── Types ───────────────────────────────────────────────────────────────

export type ModerationCategory =
  | 'hate_speech'
  | 'extremism'
  | 'violence_incitement'
  | 'csam'
  | 'self_harm_encouragement';

export interface ModerationResult {
  pass: boolean;
  reason: string;
  category?: ModerationCategory;
}

export interface ModerationClient {
  moderate(content: string): Promise<ModerationResult>;
}

// ─── Prompt ──────────────────────────────────────────────────────────────

function buildModerationPrompt(content: string): string {
  return `You are a content moderation classifier. Evaluate the following user-generated content and determine if it should be ALLOWED or BLOCKED from a public space.

You must be LENIENT. Most content should pass. Only block content that is clearly and explicitly in one of these categories:

BLOCK categories:

1. HATE SPEECH — Explicit dehumanization of ethnic/racial/religious groups, calls for violence against protected groups, racial slurs used to demean.
   Examples that FAIL:
   - "All [ethnic group] should be exterminated. They are subhuman parasites."
   - Explicit Nazi ideology or white supremacist recruitment
   - "[Racial slur] don't deserve rights"
   - Genocide celebration ("The Holocaust was a good thing")

2. VIOLENCE INCITEMENT — Direct threats against specific people or locations, incitement to commit specific acts of mass violence.
   Examples that FAIL:
   - "I'm going to find [person] and make them pay. They won't see it coming."
   - "Someone should shoot up [location]. That would teach them."
   Examples that PASS:
   - Instructions or information about weapons (legally protected speech without incitement)
   - Historical/philosophical discussion of violence
   - Fictional violence (games, stories, D&D campaigns)
   - Colloquial expressions ("I could kill for a burger")

3. CSAM — Any sexual content involving minors. Zero tolerance.

4. SELF-HARM ENCOURAGEMENT — Detailed instructions or active encouragement for self-harm or suicide.
   Examples that PASS:
   - Discussions about depression or mental health struggles
   - Jokes about suicide or dark humor about self-harm
   - Journaling about difficult feelings

ALWAYS ALLOW:
- Harsh political opinions, criticism of governments or public figures
- Edgy humor, dark comedy, offensive jokes (without targeted dehumanization)
- Strong opinions about religion, ideology, or social issues
- Profanity and vulgar language
- Controversial or uncomfortable topics
- Educational/historical content about atrocities
- The French Revolution, violent revolution as philosophical concept

Content to evaluate:
---
${content}
---

Respond with ONLY valid JSON:
{"pass":true}
OR
{"pass":false,"reason":"<specific, human-friendly explanation of why this was blocked>","category":"<hate_speech|extremism|violence_incitement|csam|self_harm_encouragement>"}`;
}

// ─── Cache ───────────────────────────────────────────────────────────────

const DEFAULT_CACHE_MAX = 1000;

function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

// ─── Client ──────────────────────────────────────────────────────────────

/**
 * Create a moderation client that calls Anthropic's API.
 */
export function createModerationClient(options: {
  apiKey: string;
  model?: string;
  cacheMax?: number;
}): ModerationClient {
  const model = options.model ?? 'claude-haiku-4-5-20251001';
  const cacheMax = options.cacheMax ?? DEFAULT_CACHE_MAX;
  const cache = new Map<string, ModerationResult>();

  return {
    async moderate(content: string): Promise<ModerationResult> {
      // Check cache first
      const hash = hashContent(content);
      const cached = cache.get(hash);
      if (cached) return cached;

      try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': options.apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model,
            max_tokens: 256,
            messages: [{ role: 'user', content: buildModerationPrompt(content) }],
          }),
        });

        if (!response.ok) {
          // Fail-closed: API errors block content
          const errorBody = await response.text().catch(() => '');
          const msg = `[moderation] Anthropic API error: ${response.status} ${response.statusText} ${errorBody}`;
          console.error(msg);
          return { pass: false, reason: msg };
        }

        const data = (await response.json()) as any;
        const rawText = data.content?.[0]?.text ?? '';
        // Strip markdown code fences if the LLM wraps its response
        const text = rawText.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
        const parsed = JSON.parse(text) as ModerationResult;

        // Normalize result
        const result: ModerationResult = {
          pass: parsed.pass === true,
          reason: parsed.reason ?? '',
          category: parsed.pass ? undefined : parsed.category,
        };

        // Store in cache (LRU eviction)
        if (cache.size >= cacheMax) {
          const oldest = cache.keys().next().value!;
          cache.delete(oldest);
        }
        cache.set(hash, result);

        return result;
      } catch (err) {
        // Fail-closed: network/parse errors block content
        const msg = `[moderation] Unexpected error: ${err instanceof Error ? err.message : String(err)}`;
        console.error(msg, err);
        return { pass: false, reason: msg };
      }
    },
  };
}

// ─── Mock ────────────────────────────────────────────────────────────────

/**
 * Create a mock moderation client for testing.
 * Returns predefined response, defaulting to pass.
 */
export function createMockModerationClient(
  defaultResult?: ModerationResult,
): ModerationClient {
  const result = defaultResult ?? { pass: true, reason: '' };

  return {
    async moderate(): Promise<ModerationResult> {
      return result;
    },
  };
}
