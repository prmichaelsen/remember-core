/**
 * Sub-LLM prompt template for dimension impact analysis.
 *
 * Given a memory, its current scores, and new context, the sub-LLM determines
 * which of the 31 dimensions would have their scores meaningfully changed.
 */

import { ALL_SCORING_DIMENSIONS } from '../../database/weaviate/v2-collections.js';
import { DIMENSION_REGISTRY } from '../../services/emotional-scoring.service.js';
import type { ReEvaluationContext } from './selective-reevaluation.js';

const DIMENSION_REFERENCE = DIMENSION_REGISTRY
  .map((d) => `- ${d.property}: ${d.description}`)
  .join('\n');

export function buildDimensionImpactPrompt(
  memoryContent: string,
  currentScores: Partial<Record<string, number | null>>,
  context: ReEvaluationContext,
): string {
  const scoresBlock = ALL_SCORING_DIMENSIONS
    .map((dim) => {
      const val = currentScores[dim];
      return `  ${dim}: ${val !== null && val !== undefined ? val : 'null'}`;
    })
    .join('\n');

  let contextBlock = '';

  if (context.triggerType === 'rem_cycle') {
    contextBlock = buildRemCycleContext(context);
  } else if (context.triggerType === 'relationship_formation') {
    contextBlock = buildRelationshipContext(context);
  } else if (context.triggerType === 'retrieval_threshold') {
    contextBlock = buildRetrievalContext(context);
  }

  return `You are analyzing which emotional/functional dimensions of a memory need re-scoring based on new context.

MEMORY:
${memoryContent}

CURRENT SCORES:
${scoresBlock}

NEW CONTEXT:
${contextBlock}

AVAILABLE DIMENSIONS:
${DIMENSION_REFERENCE}

Given this memory and the new context above, which dimensions would have their scores MEANINGFULLY changed? Only include dimensions where the new context would shift the score by at least 0.1.

Return ONLY a JSON array of dimension property names. If no dimensions are impacted, return an empty array [].

Example: ["functional_salience", "functional_narrative_importance"]`;
}

function buildRemCycleContext(context: ReEvaluationContext): string {
  const parts: string[] = [];
  parts.push(`Trigger: REM cycle re-evaluation (periodic review)`);

  if (context.relationshipObservations.length > 0) {
    parts.push(`\nRelationship observations since last scoring:`);
    for (const obs of context.relationshipObservations) {
      parts.push(`  - ${obs}`);
    }
  }

  if (context.recentRelatedMemories.length > 0) {
    parts.push(`\nNew related memories since last scoring:`);
    for (const mem of context.recentRelatedMemories) {
      const preview = typeof mem.content === 'string' ? mem.content.slice(0, 100) : '';
      parts.push(`  - ${preview}`);
    }
  }

  if (context.newRelationships.length > 0) {
    parts.push(`\nNew relationships formed: ${context.newRelationships.length}`);
    for (const rel of context.newRelationships) {
      if (rel.observation) parts.push(`  - ${rel.observation}`);
    }
  }

  return parts.join('\n');
}

function buildRelationshipContext(context: ReEvaluationContext): string {
  const parts: string[] = [];
  parts.push(`Trigger: New relationship formed`);

  if (context.newRelationships.length > 0) {
    const rel = context.newRelationships[0];
    parts.push(`Relationship type: ${rel.relationship_type ?? 'unknown'}`);
    if (rel.observation) parts.push(`Observation: ${rel.observation}`);
  }

  if (context.recentRelatedMemories.length > 0) {
    parts.push(`\nConnected memories:`);
    for (const mem of context.recentRelatedMemories) {
      const preview = typeof mem.content === 'string' ? mem.content.slice(0, 100) : '';
      parts.push(`  - ${preview}`);
    }
  }

  return parts.join('\n');
}

function buildRetrievalContext(context: ReEvaluationContext): string {
  const parts: string[] = [];
  parts.push(`Trigger: Retrieval threshold crossed`);

  if (context.retrievalMetadata) {
    const rm = context.retrievalMetadata;
    parts.push(`Total retrievals: ${rm.retrievalCount}`);
    parts.push(`Threshold crossed: ${rm.thresholdCrossed}`);
    parts.push(`Recent retrievals (last 7 days): ${rm.recentRetrievals}`);
    parts.push(`Retrieval frequency: ${rm.retrievalFrequency.toFixed(2)} per day`);
  }

  return parts.join('\n');
}
